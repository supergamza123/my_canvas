import type { AABB, Vec2 } from './math'
import { aabbUnion, expandAABB, pointInAABB } from './math'

export type ToolId =
  | 'select'
  | 'hand'
  | 'rect'
  | 'ellipse'
  | 'line'
  | 'text'
  | 'brush'

export type NodeType = 'rect' | 'ellipse' | 'line' | 'text' | 'brush'

export interface BaseNode {
  id: string
  name: string
  type: NodeType
  visible: boolean
}

export interface RectNode extends BaseNode {
  type: 'rect'
  x: number
  y: number
  w: number
  h: number
  fill: string
  stroke: string
  strokeWidth: number
}

export interface EllipseNode extends BaseNode {
  type: 'ellipse'
  x: number
  y: number
  w: number
  h: number
  fill: string
  stroke: string
  strokeWidth: number
}

export interface LineNode extends BaseNode {
  type: 'line'
  x1: number
  y1: number
  x2: number
  y2: number
  stroke: string
  strokeWidth: number
}

export interface TextNode extends BaseNode {
  type: 'text'
  x: number
  y: number
  w: number
  h: number
  text: string
  fontSize: number
  fill: string
}

export interface BrushNode extends BaseNode {
  type: 'brush'
  points: Vec2[]
  stroke: string
  strokeWidth: number
}

export type CanvasNode = RectNode | EllipseNode | LineNode | TextNode | BrushNode

let _id = 1
export function nextId(prefix = 'n'): string {
  return `${prefix}${_id++}`
}

export function nodeBounds(node: CanvasNode): AABB {
  switch (node.type) {
    case 'rect':
    case 'ellipse':
    case 'text':
      return { x: node.x, y: node.y, w: node.w, h: node.h }
    case 'line': {
      const x = Math.min(node.x1, node.x2)
      const y = Math.min(node.y1, node.y2)
      return {
        x,
        y,
        w: Math.max(1, Math.abs(node.x2 - node.x1)),
        h: Math.max(1, Math.abs(node.y2 - node.y1)),
      }
    }
    case 'brush': {
      if (node.points.length === 0) return { x: 0, y: 0, w: 0, h: 0 }
      let minX = Infinity
      let minY = Infinity
      let maxX = -Infinity
      let maxY = -Infinity
      for (const p of node.points) {
        minX = Math.min(minX, p.x)
        minY = Math.min(minY, p.y)
        maxX = Math.max(maxX, p.x)
        maxY = Math.max(maxY, p.y)
      }
      const pad = node.strokeWidth / 2
      return {
        x: minX - pad,
        y: minY - pad,
        w: maxX - minX + pad * 2,
        h: maxY - minY + pad * 2,
      }
    }
  }
}

export function selectionBounds(nodes: CanvasNode[]): AABB | null {
  if (nodes.length === 0) return null
  let b = nodeBounds(nodes[0])
  for (let i = 1; i < nodes.length; i++) {
    b = aabbUnion(b, nodeBounds(nodes[i]))
  }
  return b
}

export function hitNode(node: CanvasNode, p: Vec2, pad = 4): boolean {
  if (!node.visible) return false
  const b = expandAABB(nodeBounds(node), pad)
  if (!pointInAABB(p, b)) return false

  switch (node.type) {
    case 'ellipse': {
      const cx = node.x + node.w / 2
      const cy = node.y + node.h / 2
      const rx = node.w / 2 || 1
      const ry = node.h / 2 || 1
      const nx = (p.x - cx) / (rx + pad)
      const ny = (p.y - cy) / (ry + pad)
      return nx * nx + ny * ny <= 1
    }
    case 'line': {
      return distToSegment(p, { x: node.x1, y: node.y1 }, { x: node.x2, y: node.y2 }) <=
        Math.max(pad, node.strokeWidth / 2 + 2)
    }
    case 'brush': {
      const thresh = Math.max(pad, node.strokeWidth / 2 + 2)
      for (let i = 1; i < node.points.length; i++) {
        if (distToSegment(p, node.points[i - 1], node.points[i]) <= thresh) return true
      }
      if (node.points.length === 1) {
        const q = node.points[0]
        return Math.hypot(p.x - q.x, p.y - q.y) <= thresh
      }
      return false
    }
    default:
      return true
  }
}

function distToSegment(p: Vec2, a: Vec2, b: Vec2): number {
  const dx = b.x - a.x
  const dy = b.y - a.y
  const len2 = dx * dx + dy * dy
  if (len2 === 0) return Math.hypot(p.x - a.x, p.y - a.y)
  let t = ((p.x - a.x) * dx + (p.y - a.y) * dy) / len2
  t = Math.max(0, Math.min(1, t))
  return Math.hypot(p.x - (a.x + t * dx), p.y - (a.y + t * dy))
}

export function translateNode(node: CanvasNode, dx: number, dy: number): void {
  switch (node.type) {
    case 'rect':
    case 'ellipse':
    case 'text':
      node.x += dx
      node.y += dy
      break
    case 'line':
      node.x1 += dx
      node.y1 += dy
      node.x2 += dx
      node.y2 += dy
      break
    case 'brush':
      for (const p of node.points) {
        p.x += dx
        p.y += dy
      }
      break
  }
}

export function cloneNode(node: CanvasNode): CanvasNode {
  if (node.type === 'brush') {
    return { ...node, points: node.points.map((p) => ({ ...p })) }
  }
  return { ...node }
}

export function defaultName(type: NodeType, index: number): string {
  const labels: Record<NodeType, string> = {
    rect: 'Rectangle',
    ellipse: 'Ellipse',
    line: 'Line',
    text: 'Text',
    brush: 'Brush',
  }
  return `${labels[type]} ${index}`
}
