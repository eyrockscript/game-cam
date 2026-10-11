import { describe, expect, it } from 'vitest'
import type { FrameInput, Player } from '../core/types'
import type { Collider } from '../game/physics'
import { worldFor } from '../game/physics'
import { ROUND_SECONDS, type BubblesState, bubblesGame, spawnBubble, spawnInterval } from './bubbles'

const world = worldFor(1920, 1080)
const random = () => 0.5

function player(id: number, colliders: Collider[]): Player {
  return { id, color: '#fff', joints: {}, colliders, hands: [], head: null }
}

function input(players: Player[], dt = 0.016): FrameInput {
  return { players, dt, now: 0 }
}

function baseState(over: Partial<BubblesState> = {}): BubblesState {
  return { bubbles: [], pops: [], score: 0, elapsed: 0, spawnClock: 0, nextId: 100, ...over }
}

describe('bubblesGame', () => {
  it('has the expected identity and starts clean', () => {
    const s = bubblesGame.start(world, random)
    expect(bubblesGame.id).toBe('bubbles')
    expect(s.score).toBe(0)
    expect(bubblesGame.status(s).secondsLeft).toBe(ROUND_SECONDS)
  })

  it('scores points when a body part touches a bubble', () => {
    const b = spawnBubble(1, world, random)
    const state = baseState({ bubbles: [{ ...b, y: 500 }] })
    const hand: Collider = { x: b.x, y: 500, vx: 0, vy: 0, r: 30 }
    const res = bubblesGame.step(state, input([player(1, [hand])]), world, random)
    expect(res.state.score).toBe(b.points)
    expect(res.state.bubbles).toHaveLength(0)
    expect(res.state.pops).toHaveLength(1)
    expect(res.events).toContain('pop')
  })

  it('pays more for smaller bubbles and 5 for golden ones', () => {
    const big = spawnBubble(1, world, () => 0.1 + 0.05)
    const small = spawnBubble(2, world, (() => {
      const seq = [0.5, 0.9]
      return () => seq.shift() ?? 0.5
    })())
    const golden = spawnBubble(3, world, () => 0.0)
    expect(big.points).toBe(1)
    expect(small.points).toBe(3)
    expect(small.r).toBeLessThan(big.r)
    expect(golden.points).toBe(5)
  })

  it('does not pop bubbles that are not touched', () => {
    const b = { ...spawnBubble(1, world, random), y: 500 }
    const far: Collider = { x: b.x + 1000, y: 500, vx: 0, vy: 0, r: 30 }
    const res = bubblesGame.step(baseState({ bubbles: [b] }), input([player(1, [far])]), world, random)
    expect(res.state.score).toBe(0)
    expect(res.state.bubbles).toHaveLength(1)
    expect(res.state.bubbles[0].y).toBeLessThan(500)
  })

  it('finishes the round when time is up', () => {
    const mid = bubblesGame.step(baseState({ elapsed: 10 }), input([]), world, random)
    expect(mid.finished).toBe(false)
    const end = bubblesGame.step(baseState({ elapsed: ROUND_SECONDS - 0.01 }), input([], 0.05), world, random)
    expect(end.finished).toBe(true)
    expect(bubblesGame.status(end.state).secondsLeft).toBe(0)
  })

  it('removes bubbles that leave the top without penalty', () => {
    const b = { ...spawnBubble(1, world, random), y: -500 }
    const res = bubblesGame.step(baseState({ bubbles: [b], score: 7 }), input([]), world, random)
    expect(res.state.bubbles.find((x) => x.id === 1)).toBeUndefined()
    expect(res.state.score).toBe(7)
  })

  it('spawns bubbles over time and faster with more players', () => {
    const res = bubblesGame.step(baseState(), input([], 2), world, random)
    expect(res.state.bubbles.length).toBeGreaterThan(0)
    expect(spawnInterval(30, 5)).toBeLessThan(spawnInterval(30, 1))
    expect(spawnInterval(50, 1)).toBeLessThan(spawnInterval(0, 1))
  })

  it('expires pop effects after the animation', () => {
    const pop = { x: 1, y: 1, r: 10, ageMs: 240 }
    const res = bubblesGame.step(baseState({ pops: [pop] }), input([], 0.05), world, random)
    expect(res.state.pops).toHaveLength(0)
  })

  it('never mutates the input state', () => {
    const b = { ...spawnBubble(1, world, random), y: 500 }
    const state = baseState({ bubbles: [b], pops: [{ x: 1, y: 1, r: 5, ageMs: 10 }] })
    const snapshot = JSON.stringify(state)
    const hand: Collider = { x: b.x, y: 500, vx: 0, vy: 0, r: 30 }
    bubblesGame.step(state, input([player(1, [hand])], 1), world, random)
    expect(JSON.stringify(state)).toBe(snapshot)
  })
})
