import type { Vec2 } from './math'
import type { CanvasNode } from './nodes'
import { hitNode } from './nodes'

/** Top-most node under point (nodes drawn bottom→top). */
export function hitTestTop(nodes: CanvasNode[], p: Vec2, pad = 4): CanvasNode | null {
  for (let i = nodes.length - 1; i >= 0; i--) {
    if (hitNode(nodes[i], p, pad)) return nodes[i]
  }
  return null
}

export function hitTestAll(nodes: CanvasNode[], p: Vec2, pad = 4): CanvasNode[] {
  const out: CanvasNode[] = []
  for (let i = nodes.length - 1; i >= 0; i--) {
    if (hitNode(nodes[i], p, pad)) out.push(nodes[i])
  }
  return out
}
