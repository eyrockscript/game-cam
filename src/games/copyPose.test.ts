import { describe, expect, it } from 'vitest'
import type { Player } from '../core/types'
import { worldFor } from '../game/physics'
import { player } from '../workout/__fixtures__/skeleton'
import {
  type CopyPoseState,
  HOLD_MS,
  INITIAL_LIVES,
  RESULT_SECONDS,
  ROUND_MIN_SECONDS,
  ROUND_START_SECONDS,
  copyPoseGame,
  nextPoseIndex,
} from './copyPose'
import { POSES, poseJoints } from './poses'

const world = worldFor(1920, 1080)
const random = () => 0 // first pose = POSES[0]
const DT = 0.125
const at = { x: 900, y: 400, scale: 200 }

const doing = (id: number, poseIndex: number): Player => player(id, poseJoints(POSES[poseIndex], at))
/** Any pose other than the target. */
const wrong = (id: number, poseIndex: number): Player => doing(id, (poseIndex + 1) % POSES.length)

interface RunResult {
  state: CopyPoseState
  events: string[]
  finished: boolean
}

function run(state: CopyPoseState, frames: Player[][]): RunResult {
  return frames.reduce<RunResult>(
    (acc, players) => {
      const r = copyPoseGame.step(acc.state, { players, dt: DT, now: 0 }, world, random)
      return { state: r.state, events: [...acc.events, ...r.events], finished: r.finished }
    },
    { state, events: [], finished: false },
  )
}

const frames = (n: number, players: Player[]): Player[][] => Array.from({ length: n }, () => players)
const holdFrames = HOLD_MS / 1000 / DT // 8

describe('nextPoseIndex', () => {
  it('never repeats the previous pose', () => {
    for (let previous = 0; previous < POSES.length; previous += 1) {
      for (const r of [0, 0.3, 0.5, 0.999]) {
        const next = nextPoseIndex(previous, () => r)
        expect(next).not.toBe(previous)
        expect(next).toBeGreaterThanOrEqual(0)
        expect(next).toBeLessThan(POSES.length)
      }
    }
  })
})

describe('copy the pose', () => {
  const start = () => copyPoseGame.start(world, random)

  it('starts a round with full time and lives', () => {
    const s = start()
    expect(s.phase).toBe('pose')
    expect(s.poseIndex).toBe(0)
    expect(copyPoseGame.status(s)).toEqual({ score: 0, lives: INITIAL_LIVES, secondsLeft: ROUND_START_SECONDS })
  })

  it('scores a player once after holding the pose for 1 s', () => {
    const r = run(start(), frames(holdFrames + 4, [doing(1, 0)]))
    expect(r.events.filter((e) => e === 'match')).toHaveLength(1)
    expect(r.state.score).toBe(1)
    expect(r.state.badges[0]).toMatchObject({ playerId: 1, done: true, progress: 1 })
  })

  it('forgives a short break in the hold', () => {
    const r = run(start(), [...frames(4, [doing(1, 0)]), ...frames(2, [wrong(1, 0)]), ...frames(4, [doing(1, 0)])])
    expect(r.state.score).toBe(1)
  })

  it('restarts the hold after a long break', () => {
    const r = run(start(), [...frames(4, [doing(1, 0)]), ...frames(3, [wrong(1, 0)]), ...frames(4, [doing(1, 0)])])
    expect(r.state.score).toBe(0)
  })

  it('costs a life when nobody matches before time runs out', () => {
    const r = run(start(), frames(ROUND_START_SECONDS / DT, [wrong(1, 0)]))
    expect(r.state.phase).toBe('result')
    expect(r.events.at(-1)).toBe('miss')
    expect(r.state.lives).toBe(INITIAL_LIVES - 1)
  })

  it('keeps the lives when anyone matched', () => {
    const r = run(start(), [...frames(holdFrames, [doing(1, 0), wrong(2, 0)]), ...frames(ROUND_START_SECONDS / DT - holdFrames, [wrong(1, 0)])])
    expect(r.events.at(-1)).toBe('roundClear')
    expect(r.state.lives).toBe(INITIAL_LIVES)
  })

  it('moves to a different pose with less time after the result', () => {
    const missed = run(start(), frames(ROUND_START_SECONDS / DT, [wrong(1, 0)])).state
    const next = run(missed, frames(RESULT_SECONDS / DT, [wrong(1, 0)]))
    expect(next.events).toEqual(['pose'])
    expect(next.state.phase).toBe('pose')
    expect(next.state.poseIndex).not.toBe(0)
    expect(next.state.roundSeconds).toBeCloseTo(ROUND_START_SECONDS - 0.25)
    expect(next.state.score).toBe(0)
  })

  it(`never gives less than ${ROUND_MIN_SECONDS} s per pose`, () => {
    const s: CopyPoseState = { ...start(), phase: 'result', phaseLeft: DT / 2, roundSeconds: ROUND_MIN_SECONDS }
    expect(run(s, [[wrong(1, 0)]]).state.roundSeconds).toBe(ROUND_MIN_SECONDS)
  })

  it('ends after the result of the round that took the last life', () => {
    const s: CopyPoseState = { ...start(), lives: 1, phaseLeft: DT / 2 }
    const lost = run(s, [[wrong(1, 0)]])
    expect(lost.state.lives).toBe(0)
    expect(lost.finished).toBe(false)
    expect(run(lost.state, frames(RESULT_SECONDS / DT, [wrong(1, 0)])).finished).toBe(true)
  })
})
