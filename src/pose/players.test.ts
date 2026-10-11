import { describe, expect, it } from 'vitest'
import { type Landmark, coverMapping } from './bodyColliders'
import { MAX_PLAYERS, PLAYER_COLORS, emptyTracker, matchPoses, trackPlayers } from './players'

const mapping = coverMapping(1000, 1000, 1000, 1000)

/** A minimal visible person standing at normalized x (camera space). */
function person(x: number): Landmark[] {
  return Array.from({ length: 17 }, (_, i) =>
    [0, 5, 6, 9, 10, 11, 12].includes(i) ? { x, y: 0.5, visibility: 0.9 } : { x, y: 0.5, visibility: 0 },
  )
}

describe('matchPoses', () => {
  const prev = (x: number) => ({ id: 1, color: 'a', center: { x, y: 0 }, positions: new Map() })

  it('pairs each pose with the nearest previous player', () => {
    expect(matchPoses([{ x: 900, y: 0 }, { x: 100, y: 0 }], [prev(110), prev(880)], 200)).toEqual([1, 0])
  })

  it('treats far-away poses as new people', () => {
    expect(matchPoses([{ x: 900, y: 0 }], [prev(100)], 200)).toEqual([-1])
  })
})

describe('trackPlayers', () => {
  it('keeps ids and colors stable across frames', () => {
    const first = trackPlayers([person(0.2), person(0.8)], emptyTracker, mapping, 20, 1 / 60)
    const second = trackPlayers([person(0.81), person(0.21)], first.tracker, mapping, 20, 1 / 60)
    const byX = (ps: typeof first.players) => [...ps].sort((a, b) => a.head!.x - b.head!.x)
    expect(byX(second.players).map((p) => [p.id, p.color])).toEqual(byX(first.players).map((p) => [p.id, p.color]))
  })

  it('gives every person a distinct color', () => {
    const { players } = trackPlayers([0.1, 0.3, 0.5, 0.7, 0.9].map(person), emptyTracker, mapping, 20, 1 / 60)
    expect(new Set(players.map((p) => p.color)).size).toBe(5)
    expect(players.every((p) => (PLAYER_COLORS as readonly string[]).includes(p.color))).toBe(true)
  })

  it(`caps tracking at ${MAX_PLAYERS} people`, () => {
    const { players } = trackPlayers([0.1, 0.25, 0.4, 0.55, 0.7, 0.85].map(person), emptyTracker, mapping, 20, 1 / 60)
    expect(players).toHaveLength(MAX_PLAYERS)
  })

  it('exposes hands with per-person velocity', () => {
    const first = trackPlayers([person(0.5)], emptyTracker, mapping, 20, 0.1)
    const second = trackPlayers([person(0.45)], first.tracker, mapping, 20, 0.1)
    expect(second.players[0].hands).toHaveLength(2)
    expect(second.players[0].hands[0].vx).toBeCloseTo(500)
  })
})
