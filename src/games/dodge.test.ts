import { describe, expect, it } from 'vitest'
import type { FrameInput, Player } from '../core/types'
import { worldFor } from '../game/physics'
import {
  INITIAL_LIVES,
  INVULNERABLE_SECONDS,
  type DodgeState,
  type Rock,
  WARNING_SECONDS,
  dodgeGame,
} from './dodge'

const world = worldFor(1920, 1080)
const random = () => 0.5

function playerAt(x: number, y: number): Player {
  const body = { x, y, vx: 0, vy: 0, r: 40 }
  return { id: 1, color: '#fff', joints: {}, colliders: [body], hands: [], head: body }
}

function input(players: Player[], dt = 1 / 60, now = 0): FrameInput {
  return { players, dt, now }
}

function rockAt(id: number, x: number, y: number): Rock {
  return { id, x, y, r: 50, vy: 400, angle: 0, spin: 0, shape: [1, 1, 1, 1, 1, 1, 1, 1, 1] }
}

function withRocks(rocks: Rock[], patch: Partial<DodgeState> = {}): DodgeState {
  return { ...dodgeGame.start(world, random), spawnTimer: 99, rocks, ...patch }
}

describe('dodge', () => {
  it('starts with full lives and no score', () => {
    const state = dodgeGame.start(world, random)
    expect(dodgeGame.status(state)).toEqual({ score: 0, lives: INITIAL_LIVES })
  })

  it('shows a warning before the rock drops', () => {
    let state = dodgeGame.start(world, random)
    let frames = 0
    while (state.warnings.length === 0 && frames < 1000) {
      state = dodgeGame.step(state, input([]), world, random).state
      frames += 1
    }
    expect(state.warnings).toHaveLength(1)
    expect(state.rocks).toHaveLength(0)

    const ticks = Math.ceil(WARNING_SECONDS * 60) + 1
    for (let i = 0; i < ticks; i += 1) {
      state = dodgeGame.step(state, input([]), world, random).state
    }
    expect(state.rocks.length).toBeGreaterThanOrEqual(1)
  })

  it('costs a life and shatters the rock on contact', () => {
    const state = withRocks([rockAt(1, 500, 500)])
    const result = dodgeGame.step(state, input([playerAt(500, 505)]), world, random)
    expect(result.state.lives).toBe(INITIAL_LIVES - 1)
    expect(result.state.rocks).toHaveLength(0)
    expect(result.state.debris.length).toBeGreaterThan(0)
    expect(result.events).toContain('hit')
    expect(result.finished).toBe(false)
  })

  it('does not hit twice while invulnerable', () => {
    const state = withRocks([rockAt(1, 500, 500), rockAt(2, 500, 500)])
    const first = dodgeGame.step(state, input([playerAt(500, 505)]), world, random)
    expect(first.state.lives).toBe(INITIAL_LIVES - 1)
    expect(first.state.invulnerable).toBeGreaterThan(0)

    const again = { ...first.state, rocks: [rockAt(3, 500, 500)] }
    const second = dodgeGame.step(again, input([playerAt(500, 505)]), world, random)
    expect(second.state.lives).toBe(INITIAL_LIVES - 1)
    expect(second.state.rocks).toHaveLength(1)
    expect(INVULNERABLE_SECONDS).toBeGreaterThan(0)
  })

  it('scores a rock that leaves the bottom untouched', () => {
    const state = withRocks([rockAt(1, 300, world.height + 60)])
    const result = dodgeGame.step(state, input([playerAt(1500, 200)]), world, random)
    expect(result.state.score).toBe(1)
    expect(result.state.rocks).toHaveLength(0)
    expect(result.state.lives).toBe(INITIAL_LIVES)
  })

  it('finishes when lives reach zero', () => {
    const state = withRocks([rockAt(1, 500, 500)], { lives: 1 })
    const result = dodgeGame.step(state, input([playerAt(500, 500)]), world, random)
    expect(result.state.lives).toBe(0)
    expect(result.finished).toBe(true)
  })

  it('never mutates the input state', () => {
    const state = withRocks([rockAt(1, 500, 500), rockAt(2, 900, 100)], { debris: [] })
    const snapshot = JSON.stringify(state)
    dodgeGame.step(state, input([playerAt(500, 505)]), world, random)
    expect(JSON.stringify(state)).toBe(snapshot)
  })
})
