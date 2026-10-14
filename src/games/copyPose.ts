import type { FrameInput, MiniGame, Player, StepResult } from '../core/types'
import { headAnchor } from '../workout/state'
import { POSES, matchesPose } from './poses'
import { renderCopyPose } from './render/copyPose'

export interface PlayerHold {
  /** Matching time accumulated this round. */
  readonly holdMs: number
  /** Time since the last matching frame. */
  readonly missMs: number
}

export interface PoseBadge {
  readonly playerId: number
  readonly color: string
  readonly x: number
  readonly y: number
  /** 0..1 toward HOLD_MS. */
  readonly progress: number
  readonly done: boolean
}

export interface CopyPoseState {
  readonly phase: 'pose' | 'result'
  readonly poseIndex: number
  readonly phaseLeft: number
  readonly roundSeconds: number
  readonly round: number
  readonly score: number
  readonly lives: number
  readonly holds: Readonly<Record<number, PlayerHold>>
  readonly scored: readonly number[]
  readonly badges: readonly PoseBadge[]
}

export const INITIAL_LIVES = 3
export const ROUND_START_SECONDS = 5
export const ROUND_MIN_SECONDS = 3
export const ROUND_SHRINK_SECONDS = 0.25
export const HOLD_MS = 1000
/** A hold survives losing the pose for this long (model flicker, small wobble). */
export const BREAK_MS = 250
export const RESULT_SECONDS = 1

/** Random pose index different from `previous`. */
export function nextPoseIndex(previous: number, random: () => number): number {
  const i = Math.floor(random() * (POSES.length - 1))
  return i >= previous ? i + 1 : i
}

function updateHold(hold: PlayerHold, matching: boolean, dtMs: number): PlayerHold {
  if (matching) return { holdMs: hold.holdMs + dtMs, missMs: 0 }
  const missMs = hold.missMs + dtMs
  return { holdMs: missMs > BREAK_MS ? 0 : hold.holdMs, missMs }
}

function badgesFor(players: readonly Player[], holds: CopyPoseState['holds'], scored: readonly number[]): PoseBadge[] {
  return players.flatMap((p) => {
    const head = headAnchor(p)
    if (!head) return []
    const done = scored.includes(p.id)
    const progress = done ? 1 : Math.min(1, (holds[p.id]?.holdMs ?? 0) / HOLD_MS)
    return [{ playerId: p.id, color: p.color, x: head.x, y: head.y, progress, done }]
  })
}

type Step = StepResult<CopyPoseState>

function stepPose(state: CopyPoseState, input: FrameInput): Step {
  const target = POSES[state.poseIndex]
  const dtMs = input.dt * 1000
  const holds: Record<number, PlayerHold> = { ...state.holds }
  const scored = [...state.scored]
  const events: string[] = []
  for (const p of input.players) {
    if (scored.includes(p.id)) continue
    const hold = updateHold(holds[p.id] ?? { holdMs: 0, missMs: 0 }, matchesPose(p.joints, target), dtMs)
    holds[p.id] = hold
    if (hold.holdMs >= HOLD_MS) {
      scored.push(p.id)
      events.push('match')
    }
  }
  const score = state.score + scored.length - state.scored.length
  const phaseLeft = state.phaseLeft - input.dt
  const badges = badgesFor(input.players, holds, scored)
  const next: CopyPoseState = { ...state, holds, scored, score, phaseLeft, badges }
  if (phaseLeft > 0) return { state: next, events, finished: false }
  const missed = scored.length === 0
  return {
    state: { ...next, phase: 'result', phaseLeft: RESULT_SECONDS, round: state.round + 1, lives: missed ? state.lives - 1 : state.lives },
    events: [...events, missed ? 'miss' : 'roundClear'],
    finished: false,
  }
}

function stepResult(state: CopyPoseState, input: FrameInput, random: () => number): Step {
  const phaseLeft = state.phaseLeft - input.dt
  const badges = badgesFor(input.players, state.holds, state.scored)
  if (phaseLeft > 0) return { state: { ...state, phaseLeft, badges }, events: [], finished: false }
  if (state.lives <= 0) return { state: { ...state, phaseLeft: 0, badges }, events: ['finish'], finished: true }
  const roundSeconds = Math.max(ROUND_MIN_SECONDS, state.roundSeconds - ROUND_SHRINK_SECONDS)
  return {
    state: {
      ...state,
      phase: 'pose',
      poseIndex: nextPoseIndex(state.poseIndex, random),
      phaseLeft: roundSeconds,
      roundSeconds,
      holds: {},
      scored: [],
      badges: [],
    },
    events: ['pose'],
    finished: false,
  }
}

export const copyPoseGame: MiniGame<CopyPoseState> = {
  id: 'copyPose',
  titleKey: 'games.copyPose.title',
  descriptionKey: 'games.copyPose.description',
  mood: 'calm',
  start: (_world, random) => ({
    phase: 'pose',
    poseIndex: Math.floor(random() * POSES.length),
    phaseLeft: ROUND_START_SECONDS,
    roundSeconds: ROUND_START_SECONDS,
    round: 0,
    score: 0,
    lives: INITIAL_LIVES,
    holds: {},
    scored: [],
    badges: [],
  }),
  step: (state, input, _world, random) => (state.phase === 'pose' ? stepPose(state, input) : stepResult(state, input, random)),
  render: renderCopyPose,
  status: (state) => ({
    score: state.score,
    lives: state.lives,
    secondsLeft: state.phase === 'pose' ? Math.max(0, Math.ceil(state.phaseLeft)) : 0,
  }),
}
