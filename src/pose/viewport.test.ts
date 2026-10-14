import { describe, expect, it } from 'vitest'
import { toCanvas } from './bodyColliders'
import { MAX_CROP, coverCrop, viewport } from './viewport'

describe('coverCrop', () => {
  it('is zero when aspect ratios match', () => {
    expect(coverCrop(1280, 720, 1920, 1080)).toBeCloseTo(0)
  })

  it('is the fraction of the video lost to cropping', () => {
    expect(coverCrop(1280, 720, 1024, 768)).toBeCloseTo(0.25)
  })
})

describe('viewport', () => {
  it('fills the screen when little would be cropped', () => {
    const { stage } = viewport(1280, 720, 1024, 768)
    expect(coverCrop(1280, 720, 1024, 768)).toBeLessThanOrEqual(MAX_CROP)
    expect(stage).toEqual({ x: 0, y: 0, width: 1024, height: 768 })
  })

  it('letterboxes a landscape camera on a portrait phone', () => {
    const { stage } = viewport(1280, 720, 1080, 1920)
    expect(stage).toEqual({ x: 0, y: 656, width: 1080, height: 608 })
  })

  it('maps the camera corners onto the stage edges in fit mode', () => {
    const { mapping } = viewport(1280, 720, 1080, 1920)
    const corner = toCanvas({ x: 0, y: 1 }, mapping)
    // Stage size is rounded to whole pixels, so allow sub-pixel slack.
    expect(Math.abs(corner.x - 1080)).toBeLessThan(1)
    expect(Math.abs(corner.y - 608)).toBeLessThan(1)
  })

  it('uses the whole screen before the camera has a frame', () => {
    expect(viewport(0, 0, 1080, 1920).stage).toEqual({ x: 0, y: 0, width: 1080, height: 1920 })
  })
})
