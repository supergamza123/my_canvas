import type { Camera } from './camera'

export function drawGrid(
  ctx: CanvasRenderingContext2D,
  camera: Camera,
  width: number,
  height: number,
  dpr = 1,
): void {
  const z = camera.zoom
  if (z < 0.4) return

  const step = z >= 8 ? 1 : z >= 2 ? 8 : 32
  const majorEvery = step === 1 ? 8 : step === 8 ? 4 : 4

  const topLeft = camera.screenToWorld(0, 0)
  const bottomRight = camera.screenToWorld(width, height)

  const startX = Math.floor(topLeft.x / step) * step
  const startY = Math.floor(topLeft.y / step) * step

  ctx.save()
  camera.apply(ctx, dpr)

  for (let x = startX; x <= bottomRight.x; x += step) {
    const major = Math.round(x / step) % majorEvery === 0
    ctx.beginPath()
    ctx.strokeStyle = major ? 'rgba(255,255,255,0.08)' : 'rgba(255,255,255,0.04)'
    ctx.lineWidth = 1 / z
    ctx.moveTo(x, topLeft.y)
    ctx.lineTo(x, bottomRight.y)
    ctx.stroke()
  }

  for (let y = startY; y <= bottomRight.y; y += step) {
    const major = Math.round(y / step) % majorEvery === 0
    ctx.beginPath()
    ctx.strokeStyle = major ? 'rgba(255,255,255,0.08)' : 'rgba(255,255,255,0.04)'
    ctx.lineWidth = 1 / z
    ctx.moveTo(topLeft.x, y)
    ctx.lineTo(bottomRight.x, y)
    ctx.stroke()
  }

  // origin crosshair
  ctx.beginPath()
  ctx.strokeStyle = 'rgba(96,165,250,0.35)'
  ctx.lineWidth = 1 / z
  ctx.moveTo(0, topLeft.y)
  ctx.lineTo(0, bottomRight.y)
  ctx.moveTo(topLeft.x, 0)
  ctx.lineTo(bottomRight.x, 0)
  ctx.stroke()

  ctx.restore()
}
