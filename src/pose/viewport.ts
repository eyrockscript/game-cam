import { type ViewMapping, coverMapping } from './bodyColliders'

/** The play area inside the canvas, in canvas pixels. */
export interface Stage {
  readonly x: number
  readonly y: number
  readonly width: number
  readonly height: number
}

export interface Viewport {
  readonly stage: Stage
  /** Maps camera coordinates into stage coordinates (origin at the stage corner). */
  readonly mapping: ViewMapping
}

/**
 * Above this cropped fraction we letterbox instead: e.g. a 16:9 camera on a
 * portrait phone would lose ~68% of its width, so players at the sides vanish.
 */
export const MAX_CROP = 0.3

/** Fraction of the video (width or height, whichever is worse) hidden by object-fit: cover. */
export function coverCrop(videoW: number, videoH: number, canvasW: number, canvasH: number): number {
  const scale = Math.max(canvasW / videoW, canvasH / videoH)
  return 1 - Math.min(canvasW / (videoW * scale), canvasH / (videoH * scale))
}

export function viewport(videoW: number, videoH: number, canvasW: number, canvasH: number): Viewport {
  const whole: Stage = { x: 0, y: 0, width: canvasW, height: canvasH }
  if (videoW <= 0 || videoH <= 0 || coverCrop(videoW, videoH, canvasW, canvasH) <= MAX_CROP) {
    return { stage: whole, mapping: coverMapping(videoW, videoH, canvasW, canvasH) }
  }
  const scale = Math.min(canvasW / videoW, canvasH / videoH)
  const width = Math.round(videoW * scale)
  const height = Math.round(videoH * scale)
  const stage: Stage = { x: Math.round((canvasW - width) / 2), y: Math.round((canvasH - height) / 2), width, height }
  return { stage, mapping: coverMapping(videoW, videoH, width, height) }
}
