import type { Vec2 } from './math'
import { clamp } from './math'

export class Camera {
  x = 0
  y = 0
  zoom = 1

  readonly minZoom = 0.1
  readonly maxZoom = 64

  screenToWorld(sx: number, sy: number): Vec2 {
    return {
      x: (sx - this.x) / this.zoom,
      y: (sy - this.y) / this.zoom,
    }
  }

  worldToScreen(wx: number, wy: number): Vec2 {
    return {
      x: wx * this.zoom + this.x,
      y: wy * this.zoom + this.y,
    }
  }

  pan(dx: number, dy: number): void {
    this.x += dx
    this.y += dy
  }

  /** Zoom toward a screen-space point (cursor). */
  zoomAt(sx: number, sy: number, factor: number): void {
    const before = this.screenToWorld(sx, sy)
    this.zoom = clamp(this.zoom * factor, this.minZoom, this.maxZoom)
    const after = this.screenToWorld(sx, sy)
    this.x += (after.x - before.x) * this.zoom
    this.y += (after.y - before.y) * this.zoom
  }

  /**
   * Map world → canvas buffer pixels.
   * Camera x/y/zoom are in CSS pixels; multiply by dpr for HiDPI canvases.
   */
  apply(ctx: CanvasRenderingContext2D, dpr = 1): void {
    ctx.setTransform(
      this.zoom * dpr,
      0,
      0,
      this.zoom * dpr,
      this.x * dpr,
      this.y * dpr,
    )
  }
}
