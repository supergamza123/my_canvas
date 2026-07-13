import { Camera } from './camera'
import { Document } from './document'
import { snapAABB, type Guide } from './guides'
import { History } from './history'
import { hitTestTop } from './hitTest'
import {
  constrainAxis,
  normalizeRect,
  snap,
  snapPoint,
  type Vec2,
} from './math'
import {
  defaultName,
  nextId,
  nodeBounds,
  selectionBounds,
  translateNode,
  type BrushNode,
  type CanvasNode,
  type EllipseNode,
  type LineNode,
  type RectNode,
  type TextNode,
  type ToolId,
} from './nodes'
import { handleCenters, hitHandle, resizeAABB, Renderer, type HandleId } from './render'

export type AppStyle = {
  fill: string
  stroke: string
  strokeWidth: number
  fontSize: number
}

export type EditorHooks = {
  onToolChange?: (tool: ToolId) => void
  onStyleChange?: (style: AppStyle) => void
  onRequestTextEdit?: (node: TextNode) => void
  onUiRefresh?: () => void
}

type DragMode =
  | { kind: 'none' }
  | { kind: 'pan'; last: Vec2 }
  | { kind: 'marquee'; start: Vec2; current: Vec2 }
  | {
      kind: 'move'
      start: Vec2
      origins: Map<string, CanvasNode>
    }
  | {
      kind: 'resize'
      handle: HandleId
      startBounds: { x: number; y: number; w: number; h: number }
      origins: Map<string, CanvasNode>
      grabOffset: Vec2
    }
  | { kind: 'create-rect' | 'create-ellipse'; start: Vec2 }
  | { kind: 'create-line'; start: Vec2 }
  | { kind: 'brush'; nodeId: string; origin: Vec2 }

export class Editor {
  readonly camera = new Camera()
  readonly doc = new Document()
  readonly history: History
  readonly renderer: Renderer

  tool: ToolId = 'select'
  style: AppStyle = {
    fill: '#3b82f6',
    stroke: '#93c5fd',
    strokeWidth: 2,
    fontSize: 24,
  }

  spaceDown = false
  shiftDown = false
  private drag: DragMode = { kind: 'none' }
  private canvas: HTMLCanvasElement
  private hooks: EditorHooks
  private dpr = 1

  constructor(canvas: HTMLCanvasElement, hooks: EditorHooks = {}) {
    this.canvas = canvas
    this.hooks = hooks
    const ctx = canvas.getContext('2d')
    if (!ctx) throw new Error('2D context unavailable')
    this.history = new History(this.doc)
    this.renderer = new Renderer(canvas, ctx, this.camera, this.doc)
    this.doc.seedDemo()
    this.bind()
    this.renderer.start()
  }

  setTool(tool: ToolId): void {
    this.tool = tool
    this.hooks.onToolChange?.(tool)
    this.updateCursor()
    this.hooks.onUiRefresh?.()
  }

  setStyle(partial: Partial<AppStyle>): void {
    this.style = { ...this.style, ...partial }
    this.hooks.onStyleChange?.(this.style)
    const selected = this.doc.selected
    if (selected.length) {
      this.history.push()
      for (const n of selected) {
        if ('fill' in n && partial.fill !== undefined) (n as RectNode).fill = partial.fill
        if ('stroke' in n && partial.stroke !== undefined) {
          ;(n as RectNode | LineNode | BrushNode).stroke = partial.stroke
        }
        if ('strokeWidth' in n && partial.strokeWidth !== undefined) {
          ;(n as RectNode | LineNode | BrushNode).strokeWidth = partial.strokeWidth
        }
        if (n.type === 'text' && partial.fontSize !== undefined) n.fontSize = partial.fontSize
        if (n.type === 'text' && partial.fill !== undefined) n.fill = partial.fill
      }
      this.doc.notify()
    }
    this.hooks.onUiRefresh?.()
  }

  resize(cssW: number, cssH: number): void {
    this.dpr = window.devicePixelRatio || 1
    this.renderer.resize(cssW, cssH, this.dpr)
  }

  undo(): void {
    this.history.undo()
    this.hooks.onUiRefresh?.()
  }

  redo(): void {
    this.history.redo()
    this.hooks.onUiRefresh?.()
  }

  deleteSelection(): void {
    if (this.doc.selectedIds.size === 0) return
    this.history.push()
    this.doc.removeNodes([...this.doc.selectedIds])
    this.hooks.onUiRefresh?.()
  }

  private bind(): void {
    const el = this.canvas
    el.addEventListener('pointerdown', this.onPointerDown)
    el.addEventListener('pointermove', this.onPointerMove)
    el.addEventListener('pointerup', this.onPointerUp)
    el.addEventListener('pointercancel', this.onPointerUp)
    el.addEventListener('wheel', this.onWheel, { passive: false })
    el.addEventListener('dblclick', this.onDblClick)
    window.addEventListener('keydown', this.onKeyDown)
    window.addEventListener('keyup', this.onKeyUp)
  }

  private screenPos(e: PointerEvent | WheelEvent | MouseEvent): Vec2 {
    const rect = this.canvas.getBoundingClientRect()
    return { x: e.clientX - rect.left, y: e.clientY - rect.top }
  }

  private worldPos(e: PointerEvent | MouseEvent): Vec2 {
    const s = this.screenPos(e)
    return this.camera.screenToWorld(s.x, s.y)
  }

  private effectiveTool(): ToolId {
    if (this.spaceDown) return 'hand'
    return this.tool
  }

  private updateCursor(): void {
    const t = this.effectiveTool()
    const map: Record<ToolId, string> = {
      select: 'default',
      hand: 'grab',
      rect: 'crosshair',
      ellipse: 'crosshair',
      line: 'crosshair',
      text: 'text',
      brush: 'crosshair',
    }
    this.canvas.style.cursor = map[t]
  }

  private setGuides(guides: Guide[]): void {
    this.renderer.guides = guides
    this.renderer.mark()
  }

  private countType(type: CanvasNode['type']): number {
    return this.doc.nodes.filter((n) => n.type === type).length + 1
  }

  private onWheel = (e: WheelEvent): void => {
    e.preventDefault()
    const s = this.screenPos(e)
    const factor = Math.exp(-e.deltaY * 0.0015)
    this.camera.zoomAt(s.x, s.y, factor)
    this.renderer.mark()
  }

  private onKeyDown = (e: KeyboardEvent): void => {
    if (e.code === 'Space' && !e.repeat) {
      this.spaceDown = true
      this.updateCursor()
      e.preventDefault()
    }
    if (e.key === 'Shift') this.shiftDown = true

    const mod = e.metaKey || e.ctrlKey
    if (mod && e.key.toLowerCase() === 'z') {
      e.preventDefault()
      if (e.shiftKey) this.redo()
      else this.undo()
      return
    }
    if (mod && e.key.toLowerCase() === 'y') {
      e.preventDefault()
      this.redo()
      return
    }

    if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return

    if (e.key === 'Delete' || e.key === 'Backspace') {
      e.preventDefault()
      this.deleteSelection()
      return
    }

    const toolKeys: Record<string, ToolId> = {
      v: 'select',
      h: 'hand',
      r: 'rect',
      o: 'ellipse',
      l: 'line',
      t: 'text',
      b: 'brush',
    }
    const k = e.key.toLowerCase()
    if (!mod && toolKeys[k]) {
      this.setTool(toolKeys[k])
    }
  }

  private onKeyUp = (e: KeyboardEvent): void => {
    if (e.code === 'Space') {
      this.spaceDown = false
      this.updateCursor()
    }
    if (e.key === 'Shift') this.shiftDown = false
  }

  private onDblClick = (e: MouseEvent): void => {
    const w = snapPoint(this.worldPos(e))
    const hit = hitTestTop(this.doc.nodes, w)
    if (hit?.type === 'text') {
      this.hooks.onRequestTextEdit?.(hit)
    }
  }

  private onPointerDown = (e: PointerEvent): void => {
    if (e.button !== 0 && e.button !== 1) return
    this.canvas.setPointerCapture(e.pointerId)
    const screen = this.screenPos(e)
    const worldRaw = this.worldPos(e)
    const world = snapPoint(worldRaw)
    const tool = e.button === 1 ? 'hand' : this.effectiveTool()

    if (tool === 'hand') {
      this.drag = { kind: 'pan', last: screen }
      this.canvas.style.cursor = 'grabbing'
      return
    }

    // Handles / existing nodes always win over create tools (Figma-like)
    if (tool !== 'brush' && this.trySelectInteraction(worldRaw, world, e.shiftKey)) {
      return
    }

    if (tool === 'select') {
      // empty-canvas marquee / deselect
      if (!e.shiftKey) this.doc.clearSelection()
      this.drag = { kind: 'marquee', start: world, current: world }
      this.hooks.onUiRefresh?.()
      return
    }

    if (tool === 'rect' || tool === 'ellipse') {
      this.history.beginGesture()
      this.drag = { kind: tool === 'rect' ? 'create-rect' : 'create-ellipse', start: world }
      return
    }

    if (tool === 'line') {
      this.history.beginGesture()
      this.drag = { kind: 'create-line', start: world }
      return
    }

    if (tool === 'text') {
      this.history.push()
      const node: TextNode = {
        id: nextId('t'),
        name: defaultName('text', this.countType('text')),
        type: 'text',
        visible: true,
        x: world.x,
        y: world.y,
        w: 200,
        h: 36,
        text: 'Text',
        fontSize: this.style.fontSize,
        fill: this.style.fill === '#3b82f6' ? '#e5e7eb' : this.style.fill,
      }
      this.doc.addNode(node)
      this.setTool('select')
      this.hooks.onRequestTextEdit?.(node)
      this.hooks.onUiRefresh?.()
      return
    }

    if (tool === 'brush') {
      this.history.beginGesture()
      const node: BrushNode = {
        id: nextId('b'),
        name: defaultName('brush', this.countType('brush')),
        type: 'brush',
        visible: true,
        points: [{ ...world }],
        stroke: this.style.stroke,
        strokeWidth: Math.max(1, this.style.strokeWidth),
      }
      this.doc.addNode(node, true)
      this.drag = { kind: 'brush', nodeId: node.id, origin: world }
      this.hooks.onUiRefresh?.()
    }
  }

  /** Returns true if pointer started resize/move on selection or an existing node. */
  private trySelectInteraction(hitWorld: Vec2, snapWorld: Vec2, shift: boolean): boolean {
    const bounds = selectionBounds(this.doc.selected)
    if (bounds && this.doc.selected.length > 0) {
      const handle = hitHandle(bounds, hitWorld, this.camera.zoom)
      if (handle) {
        this.history.beginGesture()
        const origins = new Map<string, CanvasNode>()
        for (const n of this.doc.selected) origins.set(n.id, structuredClone(n) as CanvasNode)
        const hc = handleCenters(bounds)[handle]
        this.drag = {
          kind: 'resize',
          handle,
          startBounds: { ...bounds },
          origins,
          grabOffset: { x: hitWorld.x - hc.x, y: hitWorld.y - hc.y },
        }
        return true
      }
    }

    const hit = hitTestTop(this.doc.nodes, hitWorld)
    if (!hit) return false

    if (shift) this.doc.toggleSelection(hit.id)
    else if (!this.doc.selectedIds.has(hit.id)) this.doc.setSelection([hit.id])

    this.history.beginGesture()
    const origins = new Map<string, CanvasNode>()
    for (const n of this.doc.selected) origins.set(n.id, structuredClone(n) as CanvasNode)
    this.drag = { kind: 'move', start: snapWorld, origins }
    this.hooks.onUiRefresh?.()
    return true
  }

  private onPointerMove = (e: PointerEvent): void => {
    const screen = this.screenPos(e)
    const worldRaw = this.worldPos(e)
    const world = snapPoint(worldRaw)

    if (this.drag.kind === 'pan') {
      this.camera.pan(screen.x - this.drag.last.x, screen.y - this.drag.last.y)
      this.drag.last = screen
      this.renderer.mark()
      return
    }

    if (this.drag.kind === 'marquee') {
      this.drag.current = world
      const box = normalizeRect(this.drag.start.x, this.drag.start.y, world.x, world.y)
      this.renderer.draft = {
        id: '__marquee',
        name: '',
        type: 'rect',
        visible: true,
        ...box,
        fill: 'rgba(96,165,250,0.15)',
        stroke: '#60a5fa',
        strokeWidth: 1,
      }
      this.renderer.mark()
      return
    }

    if (this.drag.kind === 'move') {
      let dx = snap(world.x - this.drag.start.x)
      let dy = snap(world.y - this.drag.start.y)

      // restore origins then translate
      for (const [id, origin] of this.drag.origins) {
        const n = this.doc.getNode(id)
        if (!n) continue
        Object.assign(n, structuredClone(origin))
      }

      const selected = this.doc.selected
      const b0 = selectionBounds(selected)
      if (b0) {
        const tentative = { x: b0.x + dx, y: b0.y + dy, w: b0.w, h: b0.h }
        const snapRes = snapAABB(tentative, this.doc.nodes, this.doc.selectedIds)
        dx += snapRes.dx
        dy += snapRes.dy
        this.setGuides(snapRes.guides)
      }

      for (const n of selected) translateNode(n, dx, dy)
      this.doc.notify()
      return
    }

    if (this.drag.kind === 'resize') {
      for (const [id, origin] of this.drag.origins) {
        const n = this.doc.getNode(id)
        if (!n) continue
        Object.assign(n, structuredClone(origin))
      }

      // Keep the grabbed handle under the cursor (minus initial grab offset)
      const target = snapPoint({
        x: worldRaw.x - this.drag.grabOffset.x,
        y: worldRaw.y - this.drag.grabOffset.y,
      })
      const newB = resizeAABB(this.drag.startBounds, this.drag.handle, target)
      const snapped = {
        x: snap(newB.x),
        y: snap(newB.y),
        w: Math.max(1, snap(newB.w)),
        h: Math.max(1, snap(newB.h)),
      }
      const sw = Math.max(1, this.drag.startBounds.w)
      const sh = Math.max(1, this.drag.startBounds.h)
      const sx = snapped.w / sw
      const sy = snapped.h / sh

      // Single box-like node: write bounds directly (more stable than scale map)
      if (this.doc.selected.length === 1) {
        const n = this.doc.selected[0]
        if (n.type === 'rect' || n.type === 'ellipse' || n.type === 'text') {
          n.x = snapped.x
          n.y = snapped.y
          n.w = snapped.w
          n.h = snapped.h
        } else {
          const o = this.drag.origins.get(n.id)
          if (o) applyResizeFromOrigin(n, o, this.drag.startBounds, snapped, sx, sy)
        }
      } else {
        for (const n of this.doc.selected) {
          const o = this.drag.origins.get(n.id)
          if (!o) continue
          applyResizeFromOrigin(n, o, this.drag.startBounds, snapped, sx, sy)
        }
      }

      this.setGuides([])
      this.doc.notify()
      return
    }

    if (this.drag.kind === 'create-rect' || this.drag.kind === 'create-ellipse') {
      let end = world
      if (this.shiftDown) {
        const s = this.drag.start
        const size = Math.max(Math.abs(end.x - s.x), Math.abs(end.y - s.y))
        end = {
          x: s.x + Math.sign(end.x - s.x || 1) * size,
          y: s.y + Math.sign(end.y - s.y || 1) * size,
        }
      }
      const box = normalizeRect(this.drag.start.x, this.drag.start.y, end.x, end.y)
      const draft: RectNode | EllipseNode = {
        id: '__draft',
        name: '',
        type: this.drag.kind === 'create-rect' ? 'rect' : 'ellipse',
        visible: true,
        ...box,
        fill: this.style.fill,
        stroke: this.style.stroke,
        strokeWidth: this.style.strokeWidth,
      }
      this.renderer.draft = draft
      this.renderer.mark()
      return
    }

    if (this.drag.kind === 'create-line') {
      let end = world
      if (this.shiftDown) end = constrainAxis(this.drag.start, end)
      const draft: LineNode = {
        id: '__draft',
        name: '',
        type: 'line',
        visible: true,
        x1: this.drag.start.x,
        y1: this.drag.start.y,
        x2: end.x,
        y2: end.y,
        stroke: this.style.stroke,
        strokeWidth: this.style.strokeWidth,
      }
      this.renderer.draft = draft
      this.renderer.mark()
      return
    }

    if (this.drag.kind === 'brush') {
      const node = this.doc.getNode(this.drag.nodeId) as BrushNode | undefined
      if (!node || node.type !== 'brush') return
      let p = world
      if (this.shiftDown) {
        p = constrainAxis(this.drag.origin, world)
        node.points = [node.points[0], p]
      } else {
        const last = node.points[node.points.length - 1]
        if (!last || last.x !== p.x || last.y !== p.y) node.points.push(p)
      }
      this.doc.notify()
    }
  }

  private onPointerUp = (e: PointerEvent): void => {
    try {
      this.canvas.releasePointerCapture(e.pointerId)
    } catch {
      /* ignore */
    }

    if (this.drag.kind === 'pan') {
      this.drag = { kind: 'none' }
      this.updateCursor()
      return
    }

    if (this.drag.kind === 'marquee') {
      const box = normalizeRect(
        this.drag.start.x,
        this.drag.start.y,
        this.drag.current.x,
        this.drag.current.y,
      )
      const ids = this.doc.nodes
        .filter((n) => n.visible && aabbIntersects(nodeBounds(n), box))
        .map((n) => n.id)
      this.doc.setSelection(ids)
      this.renderer.draft = null
      this.drag = { kind: 'none' }
      this.hooks.onUiRefresh?.()
      return
    }

    if (this.drag.kind === 'move' || this.drag.kind === 'resize') {
      this.history.endGesture()
      this.setGuides([])
      this.drag = { kind: 'none' }
      this.hooks.onUiRefresh?.()
      return
    }

    if (this.drag.kind === 'create-rect' || this.drag.kind === 'create-ellipse') {
      const draft = this.renderer.draft
      this.renderer.draft = null
      if (draft && (draft.type === 'rect' || draft.type === 'ellipse') && draft.w >= 1 && draft.h >= 1) {
        const type = draft.type
        const node = {
          ...draft,
          id: nextId(type === 'rect' ? 'r' : 'e'),
          name: defaultName(type, this.countType(type)),
        } as RectNode | EllipseNode
        this.doc.addNode(node)
        this.setTool('select')
      }
      this.history.endGesture()
      this.drag = { kind: 'none' }
      this.hooks.onUiRefresh?.()
      return
    }

    if (this.drag.kind === 'create-line') {
      const draft = this.renderer.draft
      this.renderer.draft = null
      if (draft && draft.type === 'line') {
        const len = Math.hypot(draft.x2 - draft.x1, draft.y2 - draft.y1)
        if (len >= 1) {
          const node: LineNode = {
            ...draft,
            id: nextId('l'),
            name: defaultName('line', this.countType('line')),
          }
          this.doc.addNode(node)
          this.setTool('select')
        }
      }
      this.history.endGesture()
      this.drag = { kind: 'none' }
      this.hooks.onUiRefresh?.()
      return
    }

    if (this.drag.kind === 'brush') {
      this.history.endGesture()
      this.drag = { kind: 'none' }
      this.setTool('select')
      this.hooks.onUiRefresh?.()
    }
  }
}

function aabbIntersects(
  a: { x: number; y: number; w: number; h: number },
  b: { x: number; y: number; w: number; h: number },
): boolean {
  return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y
}

function applyResizeFromOrigin(
  n: CanvasNode,
  o: CanvasNode,
  start: { x: number; y: number; w: number; h: number },
  next: { x: number; y: number; w: number; h: number },
  sx: number,
  sy: number,
): void {
  const mapX = (x: number) => next.x + (x - start.x) * sx
  const mapY = (y: number) => next.y + (y - start.y) * sy

  switch (n.type) {
    case 'rect':
    case 'ellipse':
    case 'text': {
      const oo = o as RectNode
      n.x = snap(mapX(oo.x))
      n.y = snap(mapY(oo.y))
      n.w = Math.max(1, snap(oo.w * sx))
      n.h = Math.max(1, snap(oo.h * sy))
      break
    }
    case 'line': {
      const oo = o as LineNode
      n.x1 = snap(mapX(oo.x1))
      n.y1 = snap(mapY(oo.y1))
      n.x2 = snap(mapX(oo.x2))
      n.y2 = snap(mapY(oo.y2))
      break
    }
    case 'brush': {
      const oo = o as BrushNode
      n.points = oo.points.map((p) => ({ x: snap(mapX(p.x)), y: snap(mapY(p.y)) }))
      break
    }
  }
}
