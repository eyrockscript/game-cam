import { describe, expect, it } from 'vitest'
import type { FrameInput, Player } from '../core/types'
import { type Collider, worldFor } from '../game/physics'
import { INITIAL_LIVES, type KeepUpState, keepUpGame } from './keepUp'

const world = worldFor(1000, 1000)
const random = () => 0.5

function player(colliders: Collider[] = []): Player {
  return { id: 1, color: '#fff', joints: {}, colliders, hands: colliders, head: null }
}

const input = (over: Partial<FrameInput> = {}): FrameInput => ({
  players: [player()],
  dt: 1 / 60,
  now: 0,
  ...over,
})

function started(over: Partial<KeepUpState> = {}): KeepUpState {
  return { ...keepUpGame.start(world, random), ...over }
}

describe('keepUp', () => {
  it('starts with one ball and full lives', () => {
    const state = started()
    expect(state.balls).toHaveLength(1)
    expect(keepUpGame.status(state)).toEqual({ score: 0, lives: INITIAL_LIVES })
  })

  it('scores once per touch thanks to the cooldown', () => {
    const start = started()
    const b = start.balls[0]
    const hand = { x: b.x, y: b.y + b.r + 10, vx: 0, vy: -200, r: 30 }
    const first = keepUpGame.step(start, input({ players: [player([hand])], now: 1000 }), world, random)
    expect(first.state.score).toBe(1)
    const ball2 = { ...first.state.balls[0], vy: 400, y: hand.y - hand.r - b.r + 5 }
    const again = keepUpGame.step(
      { ...first.state, balls: [ball2] },
      input({ players: [player([hand])], now: 1050 }),
      world,
      random,
    )
    expect(again.state.score).toBe(1)
  })

  it('loses a life and respawns when the ball falls', () => {
    const start = started()
    const falling = { ...start.balls[0], y: 1200, vy: 500 }
    const { state, events, finished } = keepUpGame.step({ ...start, balls: [falling] }, input(), world, random)
    expect(state.lives).toBe(INITIAL_LIVES - 1)
    expect(state.balls).toHaveLength(1)
    expect(events).toContain('lost')
    expect(finished).toBe(false)
  })

  it('finishes on the last life', () => {
    const start = started({ lives: 1 })
    const falling = { ...start.balls[0], y: 1200 }
    const { finished } = keepUpGame.step({ ...start, balls: [falling] }, input(), world, random)
    expect(finished).toBe(true)
  })

  it('adds balls as the score grows and for bigger groups', () => {
    expect(keepUpGame.step(started({ score: 15 }), input(), world, random).state.balls).toHaveLength(2)
    const crowd = Array.from({ length: 5 }, () => player())
    expect(keepUpGame.step(started(), input({ players: crowd }), world, random).state.balls).toHaveLength(3)
  })

  it('does not mutate the input state', () => {
    const start = started()
    const snapshot = JSON.stringify(start)
    keepUpGame.step(start, input(), world, random)
    expect(JSON.stringify(start)).toBe(snapshot)
  })
})
