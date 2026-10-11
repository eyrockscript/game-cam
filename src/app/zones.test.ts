import { describe, expect, it } from 'vitest'
import { worldFor } from '../game/physics'
import { MENU_BOTTOM, type Zone, layoutMenu } from './zones'

const ids = ['keepUp', 'bubbles', 'ninja', 'dodge', 'workout']

function overlaps(a: Zone, b: Zone): boolean {
  return a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h
}

describe.each([
  ['landscape TV', worldFor(1920, 1080)],
  ['portrait phone', worldFor(1080, 2340)],
])('layoutMenu (%s)', (_, world) => {
  const zones = layoutMenu(world, ids)

  it('gives every game a tile and the first one is the largest', () => {
    expect(zones.map((z) => z.id)).toEqual(ids)
    const area = (z: Zone) => z.w * z.h
    expect(zones.slice(1).every((z) => area(z) < area(zones[0]))).toBe(true)
  })

  it('never overlaps tiles and stays on screen', () => {
    zones.forEach((a, i) => zones.slice(i + 1).forEach((b) => expect(overlaps(a, b)).toBe(false)))
    zones.forEach((z) => {
      expect(z.x).toBeGreaterThanOrEqual(0)
      expect(z.x + z.w).toBeLessThanOrEqual(world.width)
    })
  })

  it('keeps every tile above hip height so resting hands never select', () => {
    zones.forEach((z) => expect(z.y + z.h).toBeLessThanOrEqual(world.height * MENU_BOTTOM + 1e-6))
  })
})
