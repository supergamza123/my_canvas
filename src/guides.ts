import type { AABB } from './math'
import type { CanvasNode } from './nodes'
import { nodeBounds } from './nodes'

export type Guide = { orientation: 'v' | 'h'; pos: number }

const THRESH = 6

export type SnapResult = {
  dx: number
  dy: number
  guides: Guide[]
}

/** Snap moving AABB against other nodes' edges/centers. */
export function snapAABB(
  moving: AABB,
  others: CanvasNode[],
  excludeIds: Set<string>,
  threshold = THRESH,
): SnapResult {
  const edgesX: number[] = []
  const edgesY: number[] = []

  for (const n of others) {
    if (!n.visible || excludeIds.has(n.id)) continue
    const b = nodeBounds(n)
    edgesX.push(b.x, b.x + b.w / 2, b.x + b.w)
    edgesY.push(b.y, b.y + b.h / 2, b.y + b.h)
  }

  const mx = [moving.x, moving.x + moving.w / 2, moving.x + moving.w]
  const my = [moving.y, moving.y + moving.h / 2, moving.y + moving.h]

  let bestDx = 0
  let bestDy = 0
  let bestAbsDx = threshold + 1
  let bestAbsDy = threshold + 1
  const guides: Guide[] = []

  for (const ex of edgesX) {
    for (const px of mx) {
      const d = ex - px
      const ad = Math.abs(d)
      if (ad < bestAbsDx) {
        bestAbsDx = ad
        bestDx = d
      }
    }
  }

  for (const ey of edgesY) {
    for (const py of my) {
      const d = ey - py
      const ad = Math.abs(d)
      if (ad < bestAbsDy) {
        bestAbsDy = ad
        bestDy = d
      }
    }
  }

  const snapped: AABB = {
    x: moving.x + (bestAbsDx <= threshold ? bestDx : 0),
    y: moving.y + (bestAbsDy <= threshold ? bestDy : 0),
    w: moving.w,
    h: moving.h,
  }

  const sx = [snapped.x, snapped.x + snapped.w / 2, snapped.x + snapped.w]
  const sy = [snapped.y, snapped.y + snapped.h / 2, snapped.y + snapped.h]

  const usedV = new Set<number>()
  const usedH = new Set<number>()

  if (bestAbsDx <= threshold) {
    for (const ex of edgesX) {
      for (const px of sx) {
        if (Math.abs(ex - px) < 0.5 && !usedV.has(ex)) {
          usedV.add(ex)
          guides.push({ orientation: 'v', pos: ex })
        }
      }
    }
  }
  if (bestAbsDy <= threshold) {
    for (const ey of edgesY) {
      for (const py of sy) {
        if (Math.abs(ey - py) < 0.5 && !usedH.has(ey)) {
          usedH.add(ey)
          guides.push({ orientation: 'h', pos: ey })
        }
      }
    }
  }

  return {
    dx: bestAbsDx <= threshold ? bestDx : 0,
    dy: bestAbsDy <= threshold ? bestDy : 0,
    guides,
  }
}
