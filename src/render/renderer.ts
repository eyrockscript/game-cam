import type { ViewMapping } from '../pose/bodyColliders'
import type { Stage } from '../pose/viewport'

const VIDEO_DIM = 'rgba(15, 17, 21, 0.25)'
/** Same as the PWA theme_color, so bars blend with the page. */
const LETTERBOX = '#0f1115'

/** Paints the bars around a letterboxed stage (no-op when the stage fills the canvas). */
export function drawLetterbox(ctx: CanvasRenderingContext2D, stage: Stage): void {
  const { width, height } = ctx.canvas
  if (stage.x === 0 && stage.y === 0 && stage.width === width && stage.height === height) return
  ctx.fillStyle = LETTERBOX
  ctx.fillRect(0, 0, width, height)
}

/** Draws in stage coordinates: call after translating the context to the stage corner. */
export function drawMirroredVideo(ctx: CanvasRenderingContext2D, video: HTMLVideoElement, m: ViewMapping, stage: Stage): void {
  const w = m.videoWidth * m.scale
  const h = m.videoHeight * m.scale
  ctx.save()
  ctx.translate(m.canvasWidth, 0)
  ctx.scale(-1, 1)
  ctx.drawImage(video, m.offsetX, m.offsetY, w, h)
  ctx.restore()
  ctx.fillStyle = VIDEO_DIM
  ctx.fillRect(0, 0, stage.width, stage.height)
}
