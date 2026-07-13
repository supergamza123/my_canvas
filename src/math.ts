export type Vec2 = { x: number; y: number }

export type AABB = { x: number; y: number; w: number; h: number }

export function snap(v: number, step = 1): number {
  return Math.round(v / step) * step
}

export function snapPoint(p: Vec2, step = 1): Vec2 {
  return { x: snap(p.x, step), y: snap(p.y, step) }
}

export function clamp(v: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, v))
}

export function dist(a: Vec2, b: Vec2): number {
  const dx = a.x - b.x
  const dy = a.y - b.y
  return Math.hypot(dx, dy)
}

export function normalizeRect(x0: number, y0: number, x1: number, y1: number): AABB {
  const x = Math.min(x0, x1)
  const y = Math.min(y0, y1)
  return { x, y, w: Math.abs(x1 - x0), h: Math.abs(y1 - y0) }
}

export function pointInAABB(p: Vec2, b: AABB): boolean {
  return p.x >= b.x && p.x <= b.x + b.w && p.y >= b.y && p.y <= b.y + b.h
}

export function aabbUnion(a: AABB, b: AABB): AABB {
  const x = Math.min(a.x, b.x)
  const y = Math.min(a.y, b.y)
  const r = Math.max(a.x + a.w, b.x + b.w)
  const bot = Math.max(a.y + a.h, b.y + b.h)
  return { x, y, w: r - x, h: bot - y }
}

export function expandAABB(b: AABB, pad: number): AABB {
  return { x: b.x - pad, y: b.y - pad, w: b.w + pad * 2, h: b.h + pad * 2 }
}

/** Shift-constrain a point relative to origin (horizontal / vertical). */
export function constrainAxis(origin: Vec2, point: Vec2): Vec2 {
  const dx = Math.abs(point.x - origin.x)
  const dy = Math.abs(point.y - origin.y)
  if (dx >= dy) return { x: point.x, y: origin.y }
  return { x: origin.x, y: point.y }
}
