import { describe, expect, it } from 'vitest'
import { clamp01, lerp, progressOf } from './fx'

describe('fx helpers', () => {
  it('clamps to 0..1', () => {
    expect(clamp01(-2)).toBe(0)
    expect(clamp01(3)).toBe(1)
    expect(clamp01(0.4)).toBe(0.4)
  })

  it('interpolates linearly', () => {
    expect(lerp(10, 20, 0.5)).toBe(15)
  })

  it('computes effect progress safely', () => {
    expect(progressOf(50, 100)).toBe(0.5)
    expect(progressOf(500, 100)).toBe(1)
    expect(progressOf(10, 0)).toBe(1)
  })
})
