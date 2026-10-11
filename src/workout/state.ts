import type { Player } from '../core/types'
import { EXERCISES, type ExerciseId, type Tracker, initialTracker, updateTracker } from './exercises'
import { midpoint, type Point, reliable } from './geometry'
import { type Routine, blockAt, buildRoutine } from './routine'

/** Short "+1" effect shown near a player's head. */
export interface RepPop {
  readonly playerId: number
  readonly color: string
  readonly x: number
  readonly y: number
  readonly ageMs: number
}

/** Where to draw a visible player's rep counter (top of the head). */
export interface PlayerBadge {
  readonly playerId: number
  readonly color: string
  readonly x: number
  readonly y: number
}

export type RepTable = Readonly<Partial<Record<ExerciseId, Readonly<Record<number, number>>>>>

export interface WorkoutState {
  readonly routine: Routine
  readonly elapsed: number
  /** Index of the block the trackers belong to (-1 before the first frame). */
  readonly blockIndex: number
  readonly trackers: Readonly<Record<number, Tracker>>
  /** Reps per exercise per player id; absent players keep their counts. */
  readonly reps: RepTable
  readonly score: number
  readonly pops: readonly RepPop[]
  readonly badges: readonly PlayerBadge[]
}

export const POP_DURATION_MS = 400

export function initialState(routine: Routine = buildRoutine()): WorkoutState {
  return { routine, elapsed: 0, blockIndex: 0, trackers: {}, reps: {}, score: 0, pops: [], badges: [] }
}

/** Head anchor: the nose, or the shoulder midpoint when the face is not visible. */
export function headAnchor(player: Player): Point | null {
  const nose = reliable(player.joints, 'nose')
  if (nose) return nose
  const ls = reliable(player.joints, 'leftShoulder')
  const rs = reliable(player.joints, 'rightShoulder')
  return ls && rs ? midpoint(ls, rs) : null
}

export function repsOf(reps: RepTable, exerciseId: ExerciseId, playerId: number): number {
  return reps[exerciseId]?.[playerId] ?? 0
}

export function ageParticles(pops: readonly RepPop[], dt: number): RepPop[] {
  return pops.map((p) => ({ ...p, ageMs: p.ageMs + dt * 1000 })).filter((p) => p.ageMs < POP_DURATION_MS)
}

function collectBadges(players: readonly Player[]): PlayerBadge[] {
  return players.flatMap((p) => {
    const head = headAnchor(p)
    return head ? [{ playerId: p.id, color: p.color, x: head.x, y: head.y }] : []
  })
}

interface CountResult {
  readonly trackers: Record<number, Tracker>
  readonly reps: RepTable
  readonly gained: number
  readonly pops: RepPop[]
}

/** Updates every visible player's tracker for the given exercise. Pure. */
export function countReps(
  exerciseId: ExerciseId,
  trackers: Readonly<Record<number, Tracker>>,
  reps: RepTable,
  players: readonly Player[],
): CountResult {
  const exercise = EXERCISES[exerciseId]
  const nextTrackers: Record<number, Tracker> = { ...trackers }
  const counts: Record<number, number> = { ...(reps[exerciseId] ?? {}) }
  const pops: RepPop[] = []
  let gained = 0
  for (const player of players) {
    const result = updateTracker(exercise, trackers[player.id] ?? initialTracker(exercise), player.joints)
    nextTrackers[player.id] = result.tracker
    if (result.reps === 0) continue
    gained += result.reps
    counts[player.id] = (counts[player.id] ?? 0) + result.reps
    const head = headAnchor(player)
    if (head) pops.push({ playerId: player.id, color: player.color, x: head.x, y: head.y, ageMs: 0 })
  }
  return { trackers: nextTrackers, reps: { ...reps, [exerciseId]: counts }, gained, pops }
}

export interface AdvanceResult {
  readonly state: WorkoutState
  readonly events: readonly string[]
  readonly finished: boolean
}

/** One frame of the routine: advance the clock, switch blocks, count reps. Pure. */
export function advance(state: WorkoutState, players: readonly Player[], dt: number): AdvanceResult {
  const elapsed = state.elapsed + dt
  const position = blockAt(state.routine, elapsed)
  const badges = collectBadges(players)
  const aged = ageParticles(state.pops, dt)
  if (!position) {
    return { state: { ...state, elapsed, pops: aged, badges, trackers: {} }, events: ['finish'], finished: true }
  }
  const blockChanged = position.index !== state.blockIndex
  const events: string[] = blockChanged ? ['block'] : []
  const trackers = blockChanged ? {} : state.trackers
  const base: WorkoutState = { ...state, elapsed, blockIndex: position.index, trackers, pops: aged, badges }
  if (position.block.kind !== 'exercise') return { state: base, events, finished: false }

  const counted = countReps(position.block.exerciseId, trackers, state.reps, players)
  const repEvents = counted.gained > 0 ? Array.from({ length: counted.gained }, () => 'rep') : []
  return {
    state: {
      ...base,
      trackers: counted.trackers,
      reps: counted.reps,
      score: state.score + counted.gained,
      pops: [...aged, ...counted.pops],
    },
    events: [...events, ...repEvents],
    finished: false,
  }
}
