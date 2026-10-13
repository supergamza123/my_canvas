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

export type ParsedColor = { hex: string; alpha: number }

/** Parse #rgb/#rrggbb/#rrggbbaa or rgb()/rgba() into hex + alpha (0–100). */
export function parseColor(input: string): ParsedColor {
  const s = input.trim()
  if (s === 'transparent') return { hex: '#000000', alpha: 0 }

  const hexMatch = s.match(/^#([0-9a-f]{3}|[0-9a-f]{6}|[0-9a-f]{8})$/i)
  if (hexMatch) {
    let h = hexMatch[1]
    if (h.length === 3) h = h.split('').map((c) => c + c).join('')
    if (h.length === 6) return { hex: `#${h.toLowerCase()}`, alpha: 100 }
    const rgb = h.slice(0, 6).toLowerCase()
    const a = Math.round((parseInt(h.slice(6, 8), 16) / 255) * 100)
    return { hex: `#${rgb}`, alpha: a }
  }

  const rgba = s.match(/^rgba?\(\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)(?:\s*,\s*([\d.]+))?\s*\)$/i)
  if (rgba) {
    const r = clamp(Math.round(Number(rgba[1])), 0, 255)
    const g = clamp(Math.round(Number(rgba[2])), 0, 255)
    const b = clamp(Math.round(Number(rgba[3])), 0, 255)
    const a = rgba[4] === undefined ? 1 : clamp(Number(rgba[4]), 0, 1)
    return {
      hex: `#${[r, g, b].map((v) => v.toString(16).padStart(2, '0')).join('')}`,
      alpha: Math.round(a * 100),
    }
  }

  return { hex: '#000000', alpha: 100 }
}

/** Combine #rrggbb + alpha (0–100) into rgba() for canvas drawing. */
export function colorWithAlpha(hex: string, alphaPct: number): string {
  const { hex: h } = parseColor(hex)
  const r = parseInt(h.slice(1, 3), 16)
  const g = parseInt(h.slice(3, 5), 16)
  const b = parseInt(h.slice(5, 7), 16)
  const a = clamp(alphaPct, 0, 100) / 100
  if (a >= 1) return h
  if (a <= 0) return 'transparent'
  return `rgba(${r}, ${g}, ${b}, ${a})`
}
