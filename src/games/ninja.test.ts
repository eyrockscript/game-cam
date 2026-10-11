import { describe, expect, it } from 'vitest'
import type { FrameInput, Player } from '../core/types'
import { type Collider, worldFor } from '../game/physics'
import { type Item, type NinjaState, fruitRadius, ninjaGame, sliceSpeed } from './ninja'

const world = worldFor(1920, 1080)
const random = () => 0.5

function hand(x: number, y: number, speed: number): Collider {
  return { x, y, vx: speed, vy: 0, r: 40 }
}

function player(hands: Collider[]): Player {
  return { id: 1, color: '#fff', joints: {}, colliders: hands, hands, head: null }
}

function input(players: Player[], dt = 1 / 60): FrameInput {
  return { players, dt, now: 0 }
}

function item(kind: Item['kind'], overrides: Partial<Item> = {}): Item {
  return { id: 1, kind, style: 0, x: 900, y: 500, vx: 0, vy: 0, r: fruitRadius(world), ...overrides }
}

function stateWith(items: Item[], overrides: Partial<NinjaState> = {}): NinjaState {
  return { ...ninjaGame.start(world, random), items, spawnTimer: 99, ...overrides }
}

const fast = sliceSpeed(world) * 1.5
const slow = sliceSpeed(world) * 0.3

describe('ninja', () => {
  it('slices a fruit with a fast hand: +1 and two halves', () => {
    const { state, events } = ninjaGame.step(stateWith([item('fruit')]), input([player([hand(900, 500, fast)])]), world, random)
    expect(state.score).toBe(1)
    expect(state.items).toHaveLength(0)
    expect(state.halves).toHaveLength(2)
    expect(events).toContain('slice')
  })

  it('does not slice with a slow hand', () => {
    const { state } = ninjaGame.step(stateWith([item('fruit')]), input([player([hand(900, 500, slow)])]), world, random)
    expect(state.score).toBe(0)
    expect(state.items).toHaveLength(1)
  })

  it('costs a life when a fast hand touches a bomb', () => {
    const { state, events, finished } = ninjaGame.step(stateWith([item('bomb')]), input([player([hand(900, 500, fast)])]), world, random)
    expect(state.lives).toBe(2)
    expect(state.flashes).toHaveLength(1)
    expect(events).toContain('bomb')
    expect(finished).toBe(false)
  })

  it('finishes when lives reach 0', () => {
    const { state, finished } = ninjaGame.step(
      stateWith([item('bomb')], { lives: 1 }),
      input([player([hand(900, 500, fast)])]),
      world,
      random,
    )
    expect(state.lives).toBe(0)
    expect(finished).toBe(true)
  })

  it('removes fruit that falls off the bottom without penalty', () => {
    const fallen = item('fruit', { y: world.height + 200, vy: 500 })
    const { state, finished } = ninjaGame.step(stateWith([fallen]), input([]), world, random)
    expect(state.items).toHaveLength(0)
    expect(state.lives).toBe(3)
    expect(state.score).toBe(0)
    expect(finished).toBe(false)
  })

  it('tosses new items when the spawn timer expires', () => {
    const { state } = ninjaGame.step(stateWith([], { spawnTimer: 0 }), input([]), world, random)
    expect(state.items.length).toBeGreaterThan(0)
    expect(state.items[0].y).toBeGreaterThan(world.height)
  })

  it('does not mutate the input state', () => {
    const before = stateWith([item('fruit'), item('bomb', { id: 2, x: 300 })])
    const snapshot = JSON.stringify(before)
    ninjaGame.step(before, input([player([hand(900, 500, fast)])]), world, random)
    expect(JSON.stringify(before)).toBe(snapshot)
  })
})
