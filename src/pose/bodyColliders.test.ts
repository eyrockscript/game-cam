import { describe, expect, it } from 'vitest'
import { type Landmark, buildBody, coverMapping, toCanvas } from './bodyColliders'

const mapping = coverMapping(1280, 720, 1280, 720)

function pose(overrides: Record<number, Landmark>): Landmark[] {
  return Array.from({ length: 17 }, (_, i) => overrides[i] ?? { x: 0.5, y: 0.5, visibility: 0 })
}

describe('toCanvas', () => {
  it('mirrors horizontally like a selfie view', () => {
    expect(toCanvas({ x: 0.25, y: 0.5 }, mapping)).toEqual({ x: 960, y: 360 })
  })

  it('accounts for cover cropping', () => {
    const tall = coverMapping(1280, 720, 720, 720)
    expect(toCanvas({ x: 0.5, y: 0 }, tall).x).toBeCloseTo(360)
  })
})

describe('buildBody', () => {
  it('skips landmarks with low visibility', () => {
    const { parts } = buildBody(pose({ 9: { x: 0.5, y: 0.5, visibility: 0.9 } }), new Map(), mapping, 20, 1 / 60)
    expect([...parts.keys()]).toEqual([9])
  })

  it('moves the hand from the wrist to the estimated palm along the forearm', () => {
    const lm = pose({
      7: { x: 0.5, y: 0.5, visibility: 0.9 }, // elbow
      9: { x: 0.5, y: 0.3, visibility: 0.9 }, // wrist above it (arm raised)
    })
    const hand = buildBody(lm, new Map(), mapping, 20, 0.1).parts.get(9)!
    // wrist y = 216px, elbow y = 360px → palm 35% of the forearm further up
    expect(hand.y).toBeCloseTo(216 - 144 * 0.35)
    expect(hand.x).toBeCloseTo(640)
  })

  it('derives velocity from the previous frame', () => {
    const lm = pose({ 9: { x: 0.5, y: 0.5, visibility: 0.9 } })
    const previous = new Map([[9, { x: 630, y: 360 }]])
    const { parts } = buildBody(lm, previous, mapping, 20, 0.1)
    expect(parts.get(9)!.vx).toBeCloseTo(100)
  })
})
