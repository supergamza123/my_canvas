import type { CanvasNode } from './nodes'
import { cloneNode, nextId } from './nodes'

export type DocListener = () => void

export class Document {
  nodes: CanvasNode[] = []
  selectedIds = new Set<string>()
  private listeners = new Set<DocListener>()

  subscribe(fn: DocListener): () => void {
    this.listeners.add(fn)
    return () => this.listeners.delete(fn)
  }

  notify(): void {
    for (const fn of this.listeners) fn()
  }

  get selected(): CanvasNode[] {
    return this.nodes.filter((n) => this.selectedIds.has(n.id))
  }

  getNode(id: string): CanvasNode | undefined {
    return this.nodes.find((n) => n.id === id)
  }

  addNode(node: CanvasNode, select = true): void {
    this.nodes.push(node)
    if (select) {
      this.selectedIds.clear()
      this.selectedIds.add(node.id)
    }
    this.notify()
  }

  removeNodes(ids: string[]): void {
    const set = new Set(ids)
    this.nodes = this.nodes.filter((n) => !set.has(n.id))
    for (const id of ids) this.selectedIds.delete(id)
    this.notify()
  }

  setSelection(ids: string[], additive = false): void {
    if (!additive) this.selectedIds.clear()
    for (const id of ids) this.selectedIds.add(id)
    this.notify()
  }

  toggleSelection(id: string): void {
    if (this.selectedIds.has(id)) this.selectedIds.delete(id)
    else this.selectedIds.add(id)
    this.notify()
  }

  clearSelection(): void {
    this.selectedIds.clear()
    this.notify()
  }

  setVisible(id: string, visible: boolean): void {
    const n = this.getNode(id)
    if (!n) return
    n.visible = visible
    this.notify()
  }

  reorder(id: string, toIndex: number): void {
    const from = this.nodes.findIndex((n) => n.id === id)
    if (from < 0) return
    const [node] = this.nodes.splice(from, 1)
    const idx = Math.max(0, Math.min(toIndex, this.nodes.length))
    this.nodes.splice(idx, 0, node)
    this.notify()
  }

  bringForward(id: string): void {
    const i = this.nodes.findIndex((n) => n.id === id)
    if (i < 0 || i >= this.nodes.length - 1) return
    ;[this.nodes[i], this.nodes[i + 1]] = [this.nodes[i + 1], this.nodes[i]]
    this.notify()
  }

  sendBackward(id: string): void {
    const i = this.nodes.findIndex((n) => n.id === id)
    if (i <= 0) return
    ;[this.nodes[i], this.nodes[i - 1]] = [this.nodes[i - 1], this.nodes[i]]
    this.notify()
  }

  bringToFront(id: string): void {
    const i = this.nodes.findIndex((n) => n.id === id)
    if (i < 0 || i >= this.nodes.length - 1) return
    const [node] = this.nodes.splice(i, 1)
    this.nodes.push(node)
    this.notify()
  }

  sendToBack(id: string): void {
    const i = this.nodes.findIndex((n) => n.id === id)
    if (i <= 0) return
    const [node] = this.nodes.splice(i, 1)
    this.nodes.unshift(node)
    this.notify()
  }

  replaceAll(nodes: CanvasNode[], selectedIds: string[]): void {
    this.nodes = nodes.map(cloneNode)
    this.selectedIds = new Set(selectedIds)
    this.notify()
  }

  snapshot(): { nodes: CanvasNode[]; selectedIds: string[] } {
    return {
      nodes: this.nodes.map(cloneNode),
      selectedIds: [...this.selectedIds],
    }
  }

  seedDemo(): void {
    this.nodes = [
      {
        id: nextId('r'),
        name: 'Rectangle 1',
        type: 'rect',
        visible: true,
        x: 80,
        y: 80,
        w: 200,
        h: 120,
        fill: '#3b82f6',
        stroke: '#1d4ed8',
        strokeWidth: 2,
      },
      {
        id: nextId('e'),
        name: 'Ellipse 1',
        type: 'ellipse',
        visible: true,
        x: 340,
        y: 140,
        w: 160,
        h: 160,
        fill: '#22c55e',
        stroke: '#15803d',
        strokeWidth: 2,
      },
      {
        id: nextId('t'),
        name: 'Text 1',
        type: 'text',
        visible: true,
        x: 100,
        y: 260,
        w: 240,
        h: 40,
        text: 'Hello Canvas',
        fontSize: 28,
        fill: '#e5e7eb',
      },
    ]
    this.selectedIds.clear()
    this.notify()
  }
}
