import type { ViewMapping } from '../pose/bodyColliders'

const VIDEO_DIM = 'rgba(15, 17, 21, 0.25)'

export function drawMirroredVideo(ctx: CanvasRenderingContext2D, video: HTMLVideoElement, m: ViewMapping): void {
  const w = m.videoWidth * m.scale
  const h = m.videoHeight * m.scale
  ctx.save()
  ctx.translate(m.canvasWidth, 0)
  ctx.scale(-1, 1)
  ctx.drawImage(video, m.offsetX, m.offsetY, w, h)
  ctx.restore()
  ctx.fillStyle = VIDEO_DIM
  ctx.fillRect(0, 0, ctx.canvas.width, ctx.canvas.height)
}
