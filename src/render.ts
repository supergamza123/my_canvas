import type { Camera } from './camera'
import type { Document } from './document'
import type { Guide } from './guides'
import { drawGrid } from './grid'
import type { AABB } from './math'
import type { BrushNode, CanvasNode, EllipseNode, LineNode, RectNode, TextNode } from './nodes'
import { nodeBounds, selectionBounds } from './nodes'

export type HandleId = 'nw' | 'n' | 'ne' | 'e' | 'se' | 's' | 'sw' | 'w'

export const HANDLE_SIZE = 10

export class Renderer {
  needsRedraw = true
  guides: Guide[] = []
  draft: CanvasNode | null = null
  /** When false, selection chrome is not drawn (e.g. brush paint mode). */
  showSelection = true
  private raf = 0
  private canvas: HTMLCanvasElement
  private ctx: CanvasRenderingContext2D
  private camera: Camera
  private doc: Document
  private dpr = 1

  constructor(
    canvas: HTMLCanvasElement,
    ctx: CanvasRenderingContext2D,
    camera: Camera,
    doc: Document,
  ) {
    this.canvas = canvas
    this.ctx = ctx
    this.camera = camera
    this.doc = doc
    this.doc.subscribe(() => this.mark())
  }

  mark(): void {
    this.needsRedraw = true
  }

  start(): void {
    const loop = () => {
      this.raf = requestAnimationFrame(loop)
      if (!this.needsRedraw) return
      this.needsRedraw = false
      this.paint()
    }
    this.raf = requestAnimationFrame(loop)
  }

  stop(): void {
    cancelAnimationFrame(this.raf)
  }

  resize(w: number, h: number, dpr: number): void {
    this.dpr = dpr
    this.canvas.width = Math.floor(w * dpr)
    this.canvas.height = Math.floor(h * dpr)
    this.canvas.style.width = `${w}px`
    this.canvas.style.height = `${h}px`
    this.mark()
  }

  private paint(): void {
    const { ctx, canvas, camera, doc, dpr } = this
    const w = canvas.width / dpr
    const h = canvas.height / dpr

    ctx.setTransform(1, 0, 0, 1, 0, 0)
    ctx.clearRect(0, 0, canvas.width, canvas.height)

    ctx.save()
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    ctx.fillStyle = '#1a1b1e'
    ctx.fillRect(0, 0, w, h)
    ctx.restore()

    drawGrid(ctx, camera, w, h, dpr)

    ctx.save()
    camera.apply(ctx, dpr)

    for (const node of doc.nodes) {
      if (!node.visible) continue
      drawNode(ctx, node)
    }

    if (this.draft) {
      // Brush draft paints solid; shape drafts stay slightly ghosted
      drawNode(ctx, this.draft, this.draft.type !== 'brush')
    }

    if (this.showSelection) {
      const selected = doc.selected.filter((n) => n.visible)
      const bounds = selectionBounds(selected)
      if (bounds) drawSelection(ctx, bounds, camera.zoom)
    }

    for (const g of this.guides) {
      ctx.beginPath()
      ctx.strokeStyle = '#f472b6'
      ctx.lineWidth = 1 / camera.zoom
      if (g.orientation === 'v') {
        const top = camera.screenToWorld(0, 0).y
        const bot = camera.screenToWorld(0, h).y
        ctx.moveTo(g.pos, top)
        ctx.lineTo(g.pos, bot)
      } else {
        const left = camera.screenToWorld(0, 0).x
        const right = camera.screenToWorld(w, 0).x
        ctx.moveTo(left, g.pos)
        ctx.lineTo(right, g.pos)
      }
      ctx.stroke()
    }

    ctx.restore()
  }
}

function drawNode(ctx: CanvasRenderingContext2D, node: CanvasNode, draft = false): void {
  ctx.save()
  if (draft) ctx.globalAlpha = 0.7

  switch (node.type) {
    case 'rect':
      drawRect(ctx, node)
      break
    case 'ellipse':
      drawEllipse(ctx, node)
      break
    case 'line':
      drawLine(ctx, node)
      break
    case 'text':
      drawText(ctx, node)
      break
    case 'brush':
      drawBrush(ctx, node)
      break
  }
  ctx.restore()
}

function drawRect(ctx: CanvasRenderingContext2D, n: RectNode): void {
  if (n.fill && n.fill !== 'transparent') {
    ctx.fillStyle = n.fill
    ctx.fillRect(n.x, n.y, n.w, n.h)
  }
  if (n.strokeWidth > 0) {
    ctx.strokeStyle = n.stroke
    ctx.lineWidth = n.strokeWidth
    ctx.strokeRect(n.x, n.y, n.w, n.h)
  }
}

function drawEllipse(ctx: CanvasRenderingContext2D, n: EllipseNode): void {
  ctx.beginPath()
  ctx.ellipse(n.x + n.w / 2, n.y + n.h / 2, Math.abs(n.w / 2), Math.abs(n.h / 2), 0, 0, Math.PI * 2)
  if (n.fill && n.fill !== 'transparent') {
    ctx.fillStyle = n.fill
    ctx.fill()
  }
  if (n.strokeWidth > 0) {
    ctx.strokeStyle = n.stroke
    ctx.lineWidth = n.strokeWidth
    ctx.stroke()
  }
}

function drawLine(ctx: CanvasRenderingContext2D, n: LineNode): void {
  ctx.beginPath()
  ctx.strokeStyle = n.stroke
  ctx.lineWidth = n.strokeWidth
  ctx.lineCap = 'round'
  ctx.moveTo(n.x1, n.y1)
  ctx.lineTo(n.x2, n.y2)
  ctx.stroke()
}

function drawText(ctx: CanvasRenderingContext2D, n: TextNode): void {
  ctx.fillStyle = n.fill
  ctx.font = `${n.fontSize}px ui-sans-serif, system-ui, sans-serif`
  ctx.textBaseline = 'top'
  const lines = n.text.split('\n')
  let y = n.y
  for (const line of lines) {
    ctx.fillText(line, n.x, y)
    y += n.fontSize * 1.25
  }
}

function drawBrush(ctx: CanvasRenderingContext2D, n: BrushNode): void {
  if (n.points.length === 0) return
  ctx.beginPath()
  ctx.strokeStyle = n.stroke
  ctx.lineWidth = n.strokeWidth
  ctx.lineCap = 'round'
  ctx.lineJoin = 'round'
  ctx.moveTo(n.points[0].x, n.points[0].y)
  for (let i = 1; i < n.points.length; i++) {
    ctx.lineTo(n.points[i].x, n.points[i].y)
  }
  ctx.stroke()
}

function drawSelection(ctx: CanvasRenderingContext2D, b: AABB, zoom: number): void {
  const lw = 1 / zoom
  ctx.strokeStyle = '#60a5fa'
  ctx.lineWidth = lw
  ctx.setLineDash([4 / zoom, 4 / zoom])
  ctx.strokeRect(b.x, b.y, b.w, b.h)
  ctx.setLineDash([])

  const hs = HANDLE_SIZE / zoom
  const handles = handleCenters(b)
  ctx.fillStyle = '#fff'
  ctx.strokeStyle = '#60a5fa'
  ctx.lineWidth = lw
  for (const h of Object.values(handles)) {
    ctx.fillRect(h.x - hs / 2, h.y - hs / 2, hs, hs)
    ctx.strokeRect(h.x - hs / 2, h.y - hs / 2, hs, hs)
  }
}

export function handleCenters(b: AABB): Record<HandleId, { x: number; y: number }> {
  return {
    nw: { x: b.x, y: b.y },
    n: { x: b.x + b.w / 2, y: b.y },
    ne: { x: b.x + b.w, y: b.y },
    e: { x: b.x + b.w, y: b.y + b.h / 2 },
    se: { x: b.x + b.w, y: b.y + b.h },
    s: { x: b.x + b.w / 2, y: b.y + b.h },
    sw: { x: b.x, y: b.y + b.h },
    w: { x: b.x, y: b.y + b.h / 2 },
  }
}

export function hitHandle(b: AABB, p: { x: number; y: number }, zoom: number): HandleId | null {
  // ~18px screen-space hit target
  const pad = 18 / zoom
  const centers = handleCenters(b)
  let best: HandleId | null = null
  let bestDist = Infinity
  for (const [id, c] of Object.entries(centers) as [HandleId, { x: number; y: number }][]) {
    const d = Math.hypot(p.x - c.x, p.y - c.y)
    if (d <= pad && d < bestDist) {
      bestDist = d
      best = id
    }
  }
  return best
}

export function resizeAABB(
  b: AABB,
  handle: HandleId,
  world: { x: number; y: number },
  lockAspect = false,
): AABB {
  const aspect = b.w / Math.max(1e-6, b.h)
  const left = b.x
  const top = b.y
  const right = b.x + b.w
  const bottom = b.y + b.h
  const cx = b.x + b.w / 2
  const cy = b.y + b.h / 2

  if (lockAspect) {
    switch (handle) {
      case 'se':
        return aspectFromCorner({ x: left, y: top }, world, aspect, 1, 1)
      case 'sw':
        return aspectFromCorner({ x: right, y: top }, world, aspect, -1, 1)
      case 'ne':
        return aspectFromCorner({ x: left, y: bottom }, world, aspect, 1, -1)
      case 'nw':
        return aspectFromCorner({ x: right, y: bottom }, world, aspect, -1, -1)
      case 'e': {
        const w = Math.max(1, world.x - left)
        const h = Math.max(1, w / aspect)
        return { x: left, y: cy - h / 2, w, h }
      }
      case 'w': {
        const w = Math.max(1, right - world.x)
        const h = Math.max(1, w / aspect)
        return { x: right - w, y: cy - h / 2, w, h }
      }
      case 's': {
        const h = Math.max(1, world.y - top)
        const w = Math.max(1, h * aspect)
        return { x: cx - w / 2, y: top, w, h }
      }
      case 'n': {
        const h = Math.max(1, bottom - world.y)
        const w = Math.max(1, h * aspect)
        return { x: cx - w / 2, y: bottom - h, w, h }
      }
    }
  }

  let { x, y, w, h } = b
  const r = right
  const bot = bottom

  switch (handle) {
    case 'nw':
      x = world.x
      y = world.y
      w = r - x
      h = bot - y
      break
    case 'n':
      y = world.y
      h = bot - y
      break
    case 'ne':
      y = world.y
      w = world.x - x
      h = bot - y
      break
    case 'e':
      w = world.x - x
      break
    case 'se':
      w = world.x - x
      h = world.y - y
      break
    case 's':
      h = world.y - y
      break
    case 'sw':
      x = world.x
      w = r - x
      h = world.y - y
      break
    case 'w':
      x = world.x
      w = r - x
      break
  }

  if (w < 0) {
    x += w
    w = -w
  }
  if (h < 0) {
    y += h
    h = -h
  }
  return { x, y, w: Math.max(1, w), h: Math.max(1, h) }
}

/** Keep aspect while resizing from a fixed opposite corner. */
function aspectFromCorner(
  anchor: { x: number; y: number },
  world: { x: number; y: number },
  aspect: number,
  signX: 1 | -1,
  signY: 1 | -1,
): AABB {
  let tw = (world.x - anchor.x) * signX
  let th = (world.y - anchor.y) * signY
  tw = Math.max(1, tw)
  th = Math.max(1, th)

  const c1w = tw
  const c1h = Math.max(1, tw / aspect)
  const c2h = th
  const c2w = Math.max(1, th * aspect)

  const corner1 = { x: anchor.x + c1w * signX, y: anchor.y + c1h * signY }
  const corner2 = { x: anchor.x + c2w * signX, y: anchor.y + c2h * signY }
  const d1 = Math.hypot(corner1.x - world.x, corner1.y - world.y)
  const d2 = Math.hypot(corner2.x - world.x, corner2.y - world.y)
  const w = d1 <= d2 ? c1w : c2w
  const h = d1 <= d2 ? c1h : c2h

  return {
    x: signX > 0 ? anchor.x : anchor.x - w,
    y: signY > 0 ? anchor.y : anchor.y - h,
    w,
    h,
  }
}


export { nodeBounds }
