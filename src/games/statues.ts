import type { FrameInput, JointName, MiniGame, Player, StepResult } from '../core/types'
import { headAnchor } from '../workout/state'
import { renderStatues } from './render/statues'

export type StatuesPhase = 'dance' | 'freeze' | 'result'

type Point = Readonly<{ x: number; y: number }>
/** Joint positions of one player in one frame. */
export type PoseFrame = Readonly<Partial<Record<JointName, Point>>>

export interface MoverLabel {
  readonly playerId: number
  readonly color: string
  readonly x: number
  readonly y: number
}

export interface StatuesState {
  readonly phase: StatuesPhase
  /** Seconds left in the current phase. */
  readonly phaseLeft: number
  readonly phaseElapsed: number
  /** Length of the next freeze; shrinks every round. */
  readonly freezeSeconds: number
  readonly round: number
  readonly score: number
  readonly lives: number
  /** Player ids present when the freeze started: only they are judged. */
  readonly judged: readonly number[]
  /** Accumulated motion per judged player during this freeze, in shoulder widths. */
  readonly motion: Readonly<Record<number, number>>
  readonly lastPoses: Readonly<Record<number, PoseFrame>>
  /** Where to draw "¡Te moviste!" (movers this round). */
  readonly labels: readonly MoverLabel[]
  /** Result phase: whether anyone moved. */
  readonly caught: boolean
}

export const INITIAL_LIVES = 3
export const DANCE_MIN_SECONDS = 5
export const DANCE_MAX_SECONDS = 12
export const FREEZE_START_SECONDS = 3
export const FREEZE_MIN_SECONDS = 2
export const FREEZE_SHRINK_SECONDS = 0.1
/** Lets people finish their last dance move once the music stops. */
export const GRACE_SECONDS = 0.5
export const RESULT_SECONDS = 1.2
/** Accumulated shoulder widths of movement that count as "moved". Tune with real captures. */
export const MOVE_THRESHOLD = 0.6
/** Per-frame displacements below this (in shoulder widths) are model noise. */
export const JITTER = 0.02

export function danceSeconds(random: () => number): number {
  return DANCE_MIN_SECONDS + random() * (DANCE_MAX_SECONDS - DANCE_MIN_SECONDS)
}

export function poseFrame(player: Player): PoseFrame {
  return Object.fromEntries(
    Object.entries(player.joints).flatMap(([name, joint]) => (joint ? [[name, { x: joint.x, y: joint.y }]] : [])),
  )
}

/** Mean displacement of the joints seen in both frames, in shoulder widths; null without shoulders. */
export function frameMotion(previous: PoseFrame, current: PoseFrame): number | null {
  const ls = current.leftShoulder
  const rs = current.rightShoulder
  if (!ls || !rs) return null
  const width = Math.hypot(ls.x - rs.x, ls.y - rs.y)
  if (width === 0) return null
  const moves = (Object.keys(current) as JointName[]).flatMap((name) => {
    const a = previous[name]
    const b = current[name]
    if (!a || !b) return []
    const d = Math.hypot(b.x - a.x, b.y - a.y) / width
    return [d < JITTER ? 0 : d]
  })
  return moves.length === 0 ? null : moves.reduce((sum, d) => sum + d, 0) / moves.length
}

function moversOf(judged: readonly number[], motion: Readonly<Record<number, number>>): number[] {
  return judged.filter((id) => (motion[id] ?? 0) >= MOVE_THRESHOLD)
}

function labelsFor(ids: readonly number[], players: readonly Player[]): MoverLabel[] {
  return players
    .filter((p) => ids.includes(p.id))
    .flatMap((p) => {
      const head = headAnchor(p)
      return head ? [{ playerId: p.id, color: p.color, x: head.x, y: head.y }] : []
    })
}

type Step = StepResult<StatuesState>
const keep = (state: StatuesState, events: string[] = []): Step => ({ state, events, finished: false })

function stepDance(s: StatuesState, input: FrameInput): Step {
  if (s.phaseLeft > 0) return keep(s)
  const judged = input.players.map((p) => p.id)
  return keep({ ...s, phase: 'freeze', phaseLeft: s.freezeSeconds, phaseElapsed: 0, judged, motion: {}, labels: [], caught: false }, [
    'freeze',
  ])
}

function accumulate(s: StatuesState, input: FrameInput, previous: StatuesState['lastPoses']): Record<number, number> {
  const motion = { ...s.motion }
  if (s.phaseElapsed <= GRACE_SECONDS) return motion
  for (const player of input.players) {
    const before = previous[player.id]
    if (!s.judged.includes(player.id) || !before) continue
    const m = frameMotion(before, poseFrame(player))
    if (m !== null) motion[player.id] = (motion[player.id] ?? 0) + m
  }
  return motion
}

function stepFreeze(s: StatuesState, input: FrameInput, previous: StatuesState['lastPoses']): Step {
  const motion = accumulate(s, input, previous)
  const movers = moversOf(s.judged, motion)
  const newMovers = movers.filter((id) => !moversOf(s.judged, s.motion).includes(id))
  const events = newMovers.map(() => 'moved')
  const labels = labelsFor(movers, input.players)
  if (s.phaseLeft > 0) return keep({ ...s, motion, labels }, events)
  const caught = movers.length > 0
  return keep(
    {
      ...s,
      phase: 'result',
      phaseLeft: RESULT_SECONDS,
      phaseElapsed: 0,
      motion,
      labels,
      caught,
      lives: caught ? s.lives - 1 : s.lives,
      score: s.score + s.judged.length - movers.length,
      round: s.round + 1,
      freezeSeconds: Math.max(FREEZE_MIN_SECONDS, s.freezeSeconds - FREEZE_SHRINK_SECONDS),
    },
    [...events, caught ? 'caught' : 'safe'],
  )
}

function stepResult(s: StatuesState, input: FrameInput, random: () => number): Step {
  const labels = labelsFor(moversOf(s.judged, s.motion), input.players)
  if (s.phaseLeft > 0) return keep({ ...s, labels })
  if (s.lives <= 0) return { state: { ...s, labels }, events: ['finish'], finished: true }
  return keep(
    { ...s, phase: 'dance', phaseLeft: danceSeconds(random), phaseElapsed: 0, judged: [], motion: {}, labels: [], caught: false },
    ['dance'],
  )
}

function step(state: StatuesState, input: FrameInput, _world: unknown, random: () => number): Step {
  const lastPoses = { ...state.lastPoses, ...Object.fromEntries(input.players.map((p) => [p.id, poseFrame(p)])) }
  const advanced: StatuesState = { ...state, phaseLeft: state.phaseLeft - input.dt, phaseElapsed: state.phaseElapsed + input.dt }
  const result =
    state.phase === 'dance'
      ? stepDance(advanced, input)
      : state.phase === 'freeze'
        ? stepFreeze(advanced, input, state.lastPoses)
        : stepResult(advanced, input, random)
  return { ...result, state: { ...result.state, lastPoses } }
}

export const statuesGame: MiniGame<StatuesState> = {
  id: 'statues',
  titleKey: 'games.statues.title',
  descriptionKey: 'games.statues.description',
  mood: 'upbeat',
  start: (_world, random) => ({
    phase: 'dance',
    phaseLeft: danceSeconds(random),
    phaseElapsed: 0,
    freezeSeconds: FREEZE_START_SECONDS,
    round: 0,
    score: 0,
    lives: INITIAL_LIVES,
    judged: [],
    motion: {},
    lastPoses: {},
    labels: [],
    caught: false,
  }),
  step,
  render: renderStatues,
  status: (state) => ({ score: state.score, lives: state.lives, music: state.phase === 'dance' ? 'on' : 'off' }),
}
