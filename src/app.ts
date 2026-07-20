import { Editor } from './editor'
import type { ToolId } from './nodes'
import type { TextNode } from './nodes'
import { nodeBounds } from './nodes'

const TOOLS: { id: ToolId; label: string; key: string }[] = [
  { id: 'select', label: 'Select', key: 'V' },
  { id: 'hand', label: 'Hand', key: 'H' },
  { id: 'rect', label: 'Rect', key: 'R' },
  { id: 'ellipse', label: 'Ellipse', key: 'O' },
  { id: 'line', label: 'Line', key: 'L' },
  { id: 'text', label: 'Text', key: 'T' },
  { id: 'brush', label: 'Brush', key: 'B' },
]

export function mountApp(root: HTMLElement): void {
  root.innerHTML = `
    <div class="shell">
      <header class="topbar">
        <div class="brand">Canvas</div>
        <div class="toolbar" id="toolbar"></div>
        <div class="stylebar">
          <label>Fill <input type="color" id="fill" value="#3b82f6" /></label>
          <label>Stroke <input type="color" id="stroke" value="#93c5fd" /></label>
          <label>Width <input type="number" id="strokeWidth" min="0" max="64" value="2" /></label>
          <label>Font <input type="number" id="fontSize" min="8" max="256" value="24" /></label>
          <button type="button" id="undo" title="Ctrl+Z">Undo</button>
          <button type="button" id="redo" title="Ctrl+Shift+Z">Redo</button>
        </div>
      </header>
      <div class="main">
        <div class="viewport" id="viewport">
          <canvas id="canvas"></canvas>
          <textarea id="textEditor" class="text-editor" hidden></textarea>
        </div>
        <aside class="sidebar">
          <section>
            <h2>Layers</h2>
            <ul id="layers" class="layers"></ul>
          </section>
          <section>
            <h2>Properties</h2>
            <div id="props" class="props">Nothing selected</div>
          </section>
          <p class="hint">Space 팬 · Wheel 줌 · Shift 비율 · [ ] 레이어 · Ctrl+[ ] 맨앞/뒤</p>
        </aside>
      </div>
    </div>
  `

  const canvas = root.querySelector<HTMLCanvasElement>('#canvas')!
  const viewport = root.querySelector<HTMLElement>('#viewport')!
  const toolbar = root.querySelector<HTMLElement>('#toolbar')!
  const layersEl = root.querySelector<HTMLUListElement>('#layers')!
  const propsEl = root.querySelector<HTMLElement>('#props')!
  const textEditor = root.querySelector<HTMLTextAreaElement>('#textEditor')!
  const fillInput = root.querySelector<HTMLInputElement>('#fill')!
  const strokeInput = root.querySelector<HTMLInputElement>('#stroke')!
  const widthInput = root.querySelector<HTMLInputElement>('#strokeWidth')!
  const fontSizeInput = root.querySelector<HTMLInputElement>('#fontSize')!

  for (const t of TOOLS) {
    const btn = document.createElement('button')
    btn.type = 'button'
    btn.dataset.tool = t.id
    btn.title = `${t.label} (${t.key})`
    btn.textContent = t.label
    btn.addEventListener('click', () => editor.setTool(t.id))
    toolbar.appendChild(btn)
  }

  let editingTextId: string | null = null

  const editor = new Editor(canvas, {
    onToolChange: syncToolbar,
    onUiRefresh: refreshUi,
    onRequestTextEdit: openTextEditor,
  })

  fillInput.addEventListener('input', () => {
    editor.style = { ...editor.style, fill: fillInput.value }
  })
  strokeInput.addEventListener('input', () => {
    editor.style = { ...editor.style, stroke: strokeInput.value }
  })
  fillInput.addEventListener('change', () => editor.setStyle({ fill: fillInput.value }))
  strokeInput.addEventListener('change', () => editor.setStyle({ stroke: strokeInput.value }))
  widthInput.addEventListener('change', () => {
    editor.setStyle({ strokeWidth: Number(widthInput.value) || 0 })
  })
  fontSizeInput.addEventListener('input', () => {
    editor.style = { ...editor.style, fontSize: Number(fontSizeInput.value) || 24 }
  })
  fontSizeInput.addEventListener('change', () => {
    editor.setStyle({ fontSize: Number(fontSizeInput.value) || 24 })
  })
  root.querySelector('#undo')!.addEventListener('click', () => editor.undo())
  root.querySelector('#redo')!.addEventListener('click', () => editor.redo())

  function syncToolbar(): void {
    toolbar.querySelectorAll('button').forEach((btn) => {
      btn.classList.toggle('active', btn.getAttribute('data-tool') === editor.tool)
    })
  }

  function refreshUi(): void {
    syncToolbar()
    renderLayers()
    renderProps()
  }

  function renderLayers(): void {
    layersEl.innerHTML = ''
    // Top of list = top of stack (rendered last = on top)
    const nodes = [...editor.doc.nodes].reverse()
    for (const n of nodes) {
      const li = document.createElement('li')
      li.className = editor.doc.selectedIds.has(n.id) ? 'selected' : ''
      li.innerHTML = `
        <button type="button" class="vis" title="Visibility">${n.visible ? '●' : '○'}</button>
        <button type="button" class="name">${escapeHtml(n.name)}</button>
        <div class="layer-actions">
          <button type="button" class="layer-btn" title="앞으로" data-act="up">↑</button>
          <button type="button" class="layer-btn" title="뒤로" data-act="down">↓</button>
        </div>
      `
      li.querySelector('.vis')!.addEventListener('click', (e) => {
        e.stopPropagation()
        editor.history.push()
        editor.doc.setVisible(n.id, !n.visible)
        refreshUi()
      })
      li.querySelector('.name')!.addEventListener('click', () => {
        editor.doc.setSelection([n.id])
        refreshUi()
      })
      li.querySelector('[data-act="up"]')!.addEventListener('click', (e) => {
        e.stopPropagation()
        editor.doc.setSelection([n.id])
        editor.layerForward()
      })
      li.querySelector('[data-act="down"]')!.addEventListener('click', (e) => {
        e.stopPropagation()
        editor.doc.setSelection([n.id])
        editor.layerBackward()
      })
      layersEl.appendChild(li)
    }
  }

  function renderProps(): void {
    const sel = editor.doc.selected
    if (sel.length === 0) {
      propsEl.textContent = 'Nothing selected'
      return
    }
    if (sel.length > 1) {
      propsEl.textContent = `${sel.length} objects selected`
      return
    }
    const n = sel[0]
    const b = nodeBounds(n)
    const textFields =
      n.type === 'text'
        ? `
        <label>Font <input data-k="fontSize" type="number" min="8" max="256" value="${n.fontSize}" /></label>
        <label>Text <input data-k="text" value="${escapeAttr(n.text)}" /></label>
      `
        : ''
    propsEl.innerHTML = `
      <div class="prop-grid">
        <label>Name <input data-k="name" value="${escapeAttr(n.name)}" /></label>
        <label>X <input data-k="x" type="number" value="${Math.round(b.x)}" /></label>
        <label>Y <input data-k="y" type="number" value="${Math.round(b.y)}" /></label>
        <label>W <input data-k="w" type="number" value="${Math.round(b.w)}" /></label>
        <label>H <input data-k="h" type="number" value="${Math.round(b.h)}" /></label>
        ${textFields}
      </div>
      <div class="layer-btns">
        <button type="button" data-layer="back" title="맨 뒤 (Ctrl+[)">맨 뒤</button>
        <button type="button" data-layer="down" title="뒤로 ([)">뒤로</button>
        <button type="button" data-layer="up" title="앞으로 (])">앞으로</button>
        <button type="button" data-layer="front" title="맨 앞 (Ctrl+])">맨 앞</button>
      </div>
    `
    propsEl.querySelectorAll('input').forEach((input) => {
      input.addEventListener('change', () => {
        const key = input.getAttribute('data-k')!
        editor.history.push()
        if (key === 'name') {
          n.name = (input as HTMLInputElement).value
        } else if (key === 'text' && n.type === 'text') {
          n.text = (input as HTMLInputElement).value || 'Text'
          const metrics = measureText(n.text, n.fontSize)
          n.w = Math.max(40, metrics.w)
          n.h = Math.max(n.fontSize, metrics.h)
        } else if (key === 'fontSize' && n.type === 'text') {
          n.fontSize = Math.max(8, Number((input as HTMLInputElement).value) || 24)
          const metrics = measureText(n.text, n.fontSize)
          n.w = Math.max(40, metrics.w)
          n.h = Math.max(n.fontSize, metrics.h)
        } else {
          const v = Number((input as HTMLInputElement).value)
          applyProp(n, key, v)
        }
        editor.doc.notify()
        refreshUi()
      })
    })
    propsEl.querySelector('[data-layer="up"]')!.addEventListener('click', () => editor.layerForward())
    propsEl.querySelector('[data-layer="down"]')!.addEventListener('click', () => editor.layerBackward())
    propsEl.querySelector('[data-layer="front"]')!.addEventListener('click', () => editor.layerToFront())
    propsEl.querySelector('[data-layer="back"]')!.addEventListener('click', () => editor.layerToBack())

    if (n.type === 'text') fontSizeInput.value = String(n.fontSize)
  }

  function openTextEditor(node: TextNode): void {
    editingTextId = node.id
    const screen = editor.camera.worldToScreen(node.x, node.y)
    textEditor.hidden = false
    textEditor.value = node.text
    textEditor.style.left = `${screen.x}px`
    textEditor.style.top = `${screen.y}px`
    textEditor.style.width = `${Math.max(120, node.w * editor.camera.zoom)}px`
    textEditor.style.height = `${Math.max(32, node.h * editor.camera.zoom)}px`
    textEditor.style.fontSize = `${node.fontSize * editor.camera.zoom}px`
    textEditor.style.color = node.fill
    textEditor.focus()
    textEditor.select()
  }

  function commitTextEditor(): void {
    if (!editingTextId) return
    const node = editor.doc.getNode(editingTextId)
    if (node?.type === 'text') {
      editor.history.push()
      node.text = textEditor.value || 'Text'
      const metrics = measureText(node.text, node.fontSize)
      node.w = Math.max(40, metrics.w)
      node.h = Math.max(node.fontSize, metrics.h)
      editor.doc.notify()
    }
    editingTextId = null
    textEditor.hidden = true
    refreshUi()
  }

  textEditor.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      e.preventDefault()
      commitTextEditor()
    }
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      commitTextEditor()
    }
    e.stopPropagation()
  })
  textEditor.addEventListener('blur', () => commitTextEditor())

  const ro = new ResizeObserver(() => {
    const r = viewport.getBoundingClientRect()
    editor.resize(r.width, r.height)
  })
  ro.observe(viewport)

  editor.doc.subscribe(() => refreshUi())
  syncToolbar()
  refreshUi()

  // Center camera roughly on demo content
  editor.camera.x = 40
  editor.camera.y = 40
  editor.renderer.mark()
}

function applyProp(n: import('./nodes').CanvasNode, key: string, v: number): void {
  switch (n.type) {
    case 'rect':
    case 'ellipse':
    case 'text':
      if (key === 'x') n.x = v
      if (key === 'y') n.y = v
      if (key === 'w') n.w = Math.max(1, v)
      if (key === 'h') n.h = Math.max(1, v)
      break
    case 'line': {
      const b = nodeBounds(n)
      if (key === 'x') {
        const dx = v - b.x
        n.x1 += dx
        n.x2 += dx
      }
      if (key === 'y') {
        const dy = v - b.y
        n.y1 += dy
        n.y2 += dy
      }
      break
    }
    case 'brush': {
      const b = nodeBounds(n)
      if (key === 'x') {
        const dx = v - b.x
        for (const p of n.points) p.x += dx
      }
      if (key === 'y') {
        const dy = v - b.y
        for (const p of n.points) p.y += dy
      }
      break
    }
  }
}

function measureText(text: string, fontSize: number): { w: number; h: number } {
  const lines = text.split('\n')
  let w = 0
  for (const line of lines) w = Math.max(w, line.length * fontSize * 0.6)
  return { w, h: lines.length * fontSize * 1.25 }
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!)
}

function escapeAttr(s: string): string {
  return escapeHtml(s)
}
