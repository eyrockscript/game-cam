import { describe, expect, it } from 'vitest'
import type { FrameInput, Player } from '../core/types'
import { worldFor } from '../game/physics'
import { workoutGame } from '../games/workout'
import { FAR, NEAR, armsUp, place, player, squatDown, standing, without } from './__fixtures__/skeleton'
import { DEFAULT_ORDER, UPPER_BODY_ORDER, blockAt, buildRoutine, totalSeconds } from './routine'
import { POP_DURATION_MS, type WorkoutState, advance, headAnchor, initialState, repsOf } from './state'

const world = worldFor(1920, 1080)
const random = () => 0.5

function input(players: Player[], dt = 0.05): FrameInput {
  return { players, dt, now: 0 }
}

function feed(state: WorkoutState, frames: Player[][], dt = 0.05): WorkoutState {
  return frames.reduce((s, players) => advance(s, players, dt).state, state)
}

describe('routine', () => {
  it('alternates exercise and rest blocks, ending on an exercise', () => {
    const routine = buildRoutine()
    expect(routine.map((b) => b.kind)).toEqual(['exercise', 'rest', 'exercise', 'rest', 'exercise', 'rest', 'exercise'])
    expect(routine[1]).toEqual({ kind: 'rest', nextExerciseId: DEFAULT_ORDER[1], seconds: 10 })
    expect(totalSeconds(routine)).toBe(4 * 30 + 3 * 10)
  })

  it('locates the active block and its remaining time', () => {
    const routine = buildRoutine()
    expect(blockAt(routine, 0)).toMatchObject({ index: 0, remaining: 30, progress: 0 })
    expect(blockAt(routine, 35)).toMatchObject({ index: 1, remaining: 5, progress: 0.5 })
    expect(blockAt(routine, 40)?.index).toBe(2)
    expect(blockAt(routine, totalSeconds(routine))).toBeNull()
  })
})

describe('workout game', () => {
  it('starts on the first exercise with zero score and full block time', () => {
    const s = workoutGame.start(world, random)
    expect(workoutGame.id).toBe('workout')
    expect(workoutGame.status(s)).toEqual({ score: 0, secondsLeft: 30 })
  })

  it('counts reps per player id independently and sums them into the score', () => {
    const a = (pose: ReturnType<typeof standing>) => player(1, place(pose, NEAR), '#f00')
    const b = (pose: ReturnType<typeof standing>) => player(2, place(pose, FAR), '#0f0')
    const s = feed(initialState(), [
      [a(standing()), b(standing())],
      [a(squatDown()), b(standing())],
      [a(standing()), b(squatDown())],
      [a(squatDown()), b(standing())],
      [a(standing()), b(standing())],
    ])
    expect(repsOf(s.reps, 'squats', 1)).toBe(2)
    expect(repsOf(s.reps, 'squats', 2)).toBe(1)
    expect(s.score).toBe(3)
    expect(workoutGame.status(s).score).toBe(3)
  })

  it('keeps counts of players who leave the frame', () => {
    const s = feed(initialState(), [
      [player(7, place(standing()))],
      [player(7, place(squatDown()))],
      [player(7, place(standing()))],
      [],
    ])
    expect(repsOf(s.reps, 'squats', 7)).toBe(1)
    expect(s.badges).toHaveLength(0)
  })

  it('emits rep events and a fading +1 pop near the head', () => {
    const s1 = feed(initialState(), [[player(1, place(standing()))], [player(1, place(squatDown()))]])
    const res = advance(s1, [player(1, place(standing()))], 0.05)
    expect(res.events).toContain('rep')
    expect(res.state.pops).toHaveLength(1)
    const later = advance(res.state, [], POP_DURATION_MS / 1000)
    expect(later.state.pops).toHaveLength(0)
  })

  it('does not count reps during rest blocks and resets trackers per block', () => {
    const inRest = { ...initialState(), elapsed: 31, blockIndex: 1 }
    const s = feed(inRest, [[player(1, place(standing()))], [player(1, place(armsUp()))], [player(1, place(standing()))]])
    expect(s.score).toBe(0)
    const next = advance({ ...s, elapsed: 39.99 }, [player(1, place(standing()))], 0.05)
    expect(next.events).toContain('block')
    expect(next.state.blockIndex).toBe(2)
  })

  it('reports seconds left in the current block and finishes after the last exercise', () => {
    const routine = buildRoutine()
    const s = { ...initialState(routine), elapsed: 32.2, blockIndex: 1 }
    expect(workoutGame.status(s).secondsLeft).toBe(8)
    const end = workoutGame.step({ ...s, elapsed: totalSeconds(routine) - 0.01, blockIndex: routine.length - 1 }, input([], 0.05), world, random)
    expect(end.finished).toBe(true)
    expect(workoutGame.status(end.state).secondsLeft).toBe(0)
  })

  it('never mutates the input state', () => {
    const s0 = feed(initialState(), [[player(1, place(standing()))], [player(1, place(squatDown()))]])
    const snapshot = JSON.stringify(s0)
    workoutGame.step(s0, input([player(1, place(standing()))]), world, random)
    expect(JSON.stringify(s0)).toBe(snapshot)
  })
})

describe('headAnchor', () => {
  it('uses the nose and falls back to the shoulder midpoint', () => {
    const full = place(standing())
    expect(headAnchor(player(1, full))).toEqual(full.nose)
    const noFace = place(without(standing(), 'nose'))
    expect(headAnchor(player(1, noFace))).toEqual({ x: 900, y: 150 })
    expect(headAnchor(player(1, {}))).toBeNull()
  })
})

describe('routine selection', () => {
  const exercises = (s: WorkoutState) => s.routine.flatMap((b) => (b.kind === 'exercise' ? [b.exerciseId] : []))

  it('uses the full-body routine by default', () => {
    expect(exercises(workoutGame.start(world, random))).toEqual([...DEFAULT_ORDER])
    expect(exercises(workoutGame.start(world, random, { framing: 'full' }))).toEqual([...DEFAULT_ORDER])
  })

  it('uses only upper-body exercises when legs are out of view', () => {
    expect(exercises(workoutGame.start(world, random, { framing: 'upper' }))).toEqual([...UPPER_BODY_ORDER])
  })
})
