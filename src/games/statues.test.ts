import { describe, expect, it } from 'vitest'
import type { Player } from '../core/types'
import { worldFor } from '../game/physics'
import { FAR, NEAR, place, player, standing, without } from '../workout/__fixtures__/skeleton'
import {
  FREEZE_MIN_SECONDS,
  FREEZE_START_SECONDS,
  INITIAL_LIVES,
  RESULT_SECONDS,
  type StatuesState,
  frameMotion,
  statuesGame,
} from './statues'

const world = worldFor(1920, 1080)
const random = () => 0 // shortest dance: 5 s

/** A standing player shifted `dx` px right (NEAR: shoulder width = 240 px). */
const at = (id: number, dx = 0, base = NEAR): Player => player(id, place(standing(), { ...base, x: base.x + dx }))

function run(state: StatuesState, frames: Player[][], dt: number): { state: StatuesState; events: string[]; finished: boolean } {
  return frames.reduce(
    (acc, players) => {
      const r = statuesGame.step(acc.state, { players, dt, now: 0 }, world, random)
      return { state: r.state, events: [...acc.events, ...r.events], finished: r.finished }
    },
    { state, events: [] as string[], finished: false },
  )
}

const repeat = (players: Player[], n: number): Player[][] => Array.from({ length: n }, () => players)

/** Dances the full 5 s with `players` standing still, ending at the start of the freeze. */
function frozen(players: Player[]): StatuesState {
  const r = run(statuesGame.start(world, random), repeat(players, 20), 0.25)
  expect(r.state.phase).toBe('freeze')
  return r.state
}

/** Freeze lasts 3 s = 24 frames of 0.125 s. Grace = the first 4 frames. */
const FREEZE_FRAMES = 24

describe('frameMotion', () => {
  it('is mean joint displacement in shoulder widths', () => {
    const a = place(standing())
    const b = place(standing(), { ...NEAR, x: NEAR.x + 24 })
    expect(frameMotion(a, b)).toBeCloseTo(0.1)
  })

  it('drops displacements below the jitter floor', () => {
    expect(frameMotion(place(standing()), place(standing(), { ...NEAR, x: NEAR.x + 3 }))).toBe(0)
  })

  it('is null without both shoulders', () => {
    expect(frameMotion(place(standing()), place(without(standing(), 'leftShoulder')))).toBeNull()
  })
})

describe('statues', () => {
  it('starts dancing with the music on and full lives', () => {
    const state = statuesGame.start(world, random)
    expect(state.phase).toBe('dance')
    expect(statuesGame.status(state)).toEqual({ score: 0, lives: INITIAL_LIVES, music: 'on' })
  })

  it('stops the music and freezes when the dance time runs out', () => {
    const r = run(statuesGame.start(world, random), repeat([at(1)], 20), 0.25)
    expect(r.state.phase).toBe('freeze')
    expect(r.events).toEqual(['freeze'])
    expect(statuesGame.status(r.state).music).toBe('off')
  })

  it('scores everyone who stayed still and keeps the lives', () => {
    const r = run(frozen([at(1), at(2, 0, FAR)]), repeat([at(1), at(2, 0, FAR)], FREEZE_FRAMES), 0.125)
    expect(r.state.phase).toBe('result')
    expect(r.events).toEqual(['safe'])
    expect(r.state.score).toBe(2)
    expect(r.state.lives).toBe(INITIAL_LIVES)
  })

  it('ignores movement during the grace period', () => {
    const settling = [30, 60, 90, 120].map((dx) => [at(1, dx)])
    const r = run(frozen([at(1)]), [...settling, ...repeat([at(1, 120)], FREEZE_FRAMES - 4)], 0.125)
    expect(r.events).toEqual(['safe'])
  })

  it('ignores camera jitter', () => {
    const jitter = Array.from({ length: FREEZE_FRAMES }, (_, i) => [at(1, i % 2 === 0 ? 3 : 0)])
    expect(run(frozen([at(1)]), jitter, 0.125).events).toEqual(['safe'])
  })

  it('catches a player who moves after the grace period, once', () => {
    const still = repeat([at(1)], 4)
    const moving = Array.from({ length: 8 }, (_, i) => [at(1, (i + 1) * 30)])
    const rest = repeat([at(1, 240)], FREEZE_FRAMES - 12)
    const r = run(frozen([at(1)]), [...still, ...moving, ...rest], 0.125)
    expect(r.events.filter((e) => e === 'moved')).toHaveLength(1)
    expect(r.events.at(-1)).toBe('caught')
    expect(r.state.lives).toBe(INITIAL_LIVES - 1)
    expect(r.state.score).toBe(0)
    expect(r.state.labels.map((l) => l.playerId)).toEqual([1])
  })

  it('costs one life per round even when several players move', () => {
    const moving = Array.from({ length: FREEZE_FRAMES }, (_, i) => [at(1, i * 30), at(2, i * 30, FAR)])
    const r = run(frozen([at(1), at(2, 0, FAR)]), moving, 0.125)
    expect(r.state.lives).toBe(INITIAL_LIVES - 1)
  })

  it('does not judge players who join during the freeze', () => {
    const joiner = Array.from({ length: FREEZE_FRAMES }, (_, i) => [at(1), at(2, i * 30, FAR)])
    const r = run(frozen([at(1)]), joiner, 0.125)
    expect(r.events).toEqual(['safe'])
    expect(r.state.score).toBe(1)
  })

  it('dances again after the result and shortens the next freeze', () => {
    const afterFreeze = run(frozen([at(1)]), repeat([at(1)], FREEZE_FRAMES), 0.125).state
    expect(afterFreeze.freezeSeconds).toBeCloseTo(FREEZE_START_SECONDS - 0.1)
    const r = run(afterFreeze, repeat([at(1)], Math.ceil(RESULT_SECONDS / 0.125)), 0.125)
    expect(r.state.phase).toBe('dance')
    expect(r.events).toEqual(['dance'])
    expect(statuesGame.status(r.state).music).toBe('on')
  })

  it(`never shortens the freeze below ${FREEZE_MIN_SECONDS} s`, () => {
    const state: StatuesState = { ...frozen([at(1)]), freezeSeconds: FREEZE_MIN_SECONDS, phaseLeft: 0.1 }
    expect(run(state, [[at(1)]], 0.125).state.freezeSeconds).toBe(FREEZE_MIN_SECONDS)
  })

  it('ends after the result screen of the round that took the last life', () => {
    const lastLife: StatuesState = { ...frozen([at(1)]), lives: 1, phaseLeft: 0.1, phaseElapsed: 1, motion: { 1: 5 } }
    const caught = run(lastLife, [[at(1)]], 0.125)
    expect(caught.state.lives).toBe(0)
    expect(caught.finished).toBe(false)
    const over = run(caught.state, repeat([at(1)], Math.ceil(RESULT_SECONDS / 0.125)), 0.125)
    expect(over.finished).toBe(true)
  })

  it('never mutates the previous state', () => {
    const state = Object.freeze(frozen([at(1)]))
    const snapshot = JSON.stringify(state)
    run(state, repeat([at(1, 50)], 6), 0.125)
    expect(JSON.stringify(state)).toBe(snapshot)
  })
})
