import type { CanvasNode } from './nodes'
import type { Document } from './document'

export class History {
  private undoStack: { nodes: CanvasNode[]; selectedIds: string[] }[] = []
  private redoStack: { nodes: CanvasNode[]; selectedIds: string[] }[] = []
  private max = 100
  private coalescing = false
  private doc: Document

  constructor(doc: Document) {
    this.doc = doc
  }

  /** Push current document state before a mutating action. */
  push(): void {
    this.undoStack.push(this.doc.snapshot())
    if (this.undoStack.length > this.max) this.undoStack.shift()
    this.redoStack.length = 0
  }

  /**
   * For continuous gestures (drag): push once at start.
   * Call beginGesture() on pointerdown, endGesture() is optional.
   */
  beginGesture(): void {
    if (this.coalescing) return
    this.push()
    this.coalescing = true
  }

  endGesture(): void {
    this.coalescing = false
  }

  undo(): boolean {
    const prev = this.undoStack.pop()
    if (!prev) return false
    this.redoStack.push(this.doc.snapshot())
    this.doc.replaceAll(prev.nodes, prev.selectedIds)
    this.coalescing = false
    return true
  }

  redo(): boolean {
    const next = this.redoStack.pop()
    if (!next) return false
    this.undoStack.push(this.doc.snapshot())
    this.doc.replaceAll(next.nodes, next.selectedIds)
    this.coalescing = false
    return true
  }

  canUndo(): boolean {
    return this.undoStack.length > 0
  }

  canRedo(): boolean {
    return this.redoStack.length > 0
  }
}
