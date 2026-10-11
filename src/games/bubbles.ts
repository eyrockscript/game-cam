import type { FrameInput, MiniGame, StepResult } from '../core/types'
import type { World } from '../game/physics'
import { POP_DURATION_MS, SCORE_TEXT_MS, renderBubbles } from './render/bubbles'

export { POP_DURATION_MS }

export interface Bubble {
  readonly id: number
  /** Horizontal center around which the bubble wobbles. */
  readonly baseX: number
  readonly x: number
  readonly y: number
  readonly r: number
  /** Rise speed in px/s (upwards). */
  readonly speed: number
  readonly phase: number
  readonly wobbleAmp: number
  readonly points: number
  readonly golden: boolean
}

export interface PopEffect {
  readonly x: number
  readonly y: number
  readonly r: number
  /** Milliseconds since the pop. */
  readonly ageMs: number
  /** Visual only: golden pops use warm colors. */
  readonly golden?: boolean
}

/** Floating "+N" score text (visual only). */
export interface ScoreText {
  readonly x: number
  readonly y: number
  readonly points: number
  readonly golden: boolean
  readonly ageMs: number
}

export interface BubblesState {
  readonly bubbles: readonly Bubble[]
  readonly pops: readonly PopEffect[]
  /** Visual only; absent means none. */
  readonly scoreTexts?: readonly ScoreText[]
  readonly score: number
  readonly elapsed: number
  readonly spawnClock: number
  readonly nextId: number
}

export const ROUND_SECONDS = 60
const GOLDEN_CHANCE = 0.04
const GOLDEN_POINTS = 5
const WOBBLE_FREQ = 2
/** [radius, rise speed] as fractions of the smaller world side; index = points - 1. */
const SIZE_CLASSES: readonly (readonly [number, number])[] = [
  [0.085, 0.16],
  [0.06, 0.22],
  [0.04, 0.3],
]

function minSide(world: World): number {
  return Math.min(world.width, world.height)
}

/** Seconds between spawns: shrinks as the round advances and as more people play. */
export function spawnInterval(elapsed: number, players: number): number {
  const progress = Math.min(1, elapsed / ROUND_SECONDS)
  const crowd = 1 + 0.6 * Math.max(0, players - 1)
  return 0.9 / ((1 + progress * 1.5) * crowd)
}

function maxBubbles(players: number): number {
  return 8 + 4 * Math.max(1, players)
}

export function spawnBubble(id: number, world: World, random: () => number): Bubble {
  const golden = random() < GOLDEN_CHANCE
  const roll = random()
  const points = golden ? GOLDEN_POINTS : roll < 0.4 ? 1 : roll < 0.75 ? 2 : 3
  const [radiusK, speedK] = golden ? [0.05, 0.28] : SIZE_CLASSES[points - 1]
  const side = minSide(world)
  const r = side * radiusK
  const wobbleAmp = side * 0.02
  const baseX = wobbleAmp + r + random() * Math.max(0, world.width - 2 * (wobbleAmp + r))
  const phase = random() * Math.PI * 2
  return {
    id,
    baseX,
    x: baseX + Math.sin(phase) * wobbleAmp,
    y: world.height + r,
    r,
    speed: side * speedK,
    phase,
    wobbleAmp,
    points,
    golden,
  }
}

function moveBubble(b: Bubble, dt: number): Bubble {
  const phase = b.phase + WOBBLE_FREQ * dt
  return { ...b, phase, y: b.y - b.speed * dt, x: b.baseX + Math.sin(phase) * b.wobbleAmp }
}

function isTouched(b: Bubble, input: FrameInput): boolean {
  return input.players.some((p) =>
    p.colliders.some((c) => Math.hypot(b.x - c.x, b.y - c.y) < b.r + c.r),
  )
}

function ageEffects(pops: readonly PopEffect[], dt: number): PopEffect[] {
  return pops
    .map((p) => ({ ...p, ageMs: p.ageMs + dt * 1000 }))
    .filter((p) => p.ageMs < POP_DURATION_MS)
}

function ageScoreTexts(texts: readonly ScoreText[] | undefined, dt: number): ScoreText[] {
  return (texts ?? [])
    .map((s) => ({ ...s, ageMs: s.ageMs + dt * 1000 }))
    .filter((s) => s.ageMs < SCORE_TEXT_MS)
}

function step(state: BubblesState, input: FrameInput, world: World, random: () => number): StepResult<BubblesState> {
  const events: string[] = []
  const pops = ageEffects(state.pops, input.dt)
  const scoreTexts = ageScoreTexts(state.scoreTexts, input.dt)
  const kept: Bubble[] = []
  let score = state.score

  for (const bubble of state.bubbles) {
    const next = moveBubble(bubble, input.dt)
    if (isTouched(next, input)) {
      score += next.points
      pops.push({ x: next.x, y: next.y, r: next.r, ageMs: 0, golden: next.golden })
      scoreTexts.push({ x: next.x, y: next.y - next.r, points: next.points, golden: next.golden, ageMs: 0 })
      events.push(next.golden ? 'golden' : 'pop')
    } else if (next.y + next.r >= 0) {
      kept.push(next)
    }
  }

  const elapsed = state.elapsed + input.dt
  const finished = elapsed >= ROUND_SECONDS
  let spawnClock = state.spawnClock + input.dt
  let nextId = state.nextId
  const interval = spawnInterval(elapsed, input.players.length)
  while (!finished && spawnClock >= interval && kept.length < maxBubbles(input.players.length)) {
    kept.push(spawnBubble(nextId, world, random))
    nextId += 1
    spawnClock -= interval
  }
  spawnClock = Math.min(spawnClock, interval)

  return { state: { bubbles: kept, pops, scoreTexts, score, elapsed, spawnClock, nextId }, events, finished }
}

export const bubblesGame: MiniGame<BubblesState> = {
  id: 'bubbles',
  titleKey: 'games.bubbles.title',
  descriptionKey: 'games.bubbles.description',
  start: (world, random) => ({
    bubbles: [spawnBubble(1, world, random), spawnBubble(2, world, random)],
    pops: [],
    scoreTexts: [],
    score: 0,
    elapsed: 0,
    spawnClock: 0,
    nextId: 3,
  }),
  step,
  render: renderBubbles,
  status: (state) => ({
    score: state.score,
    secondsLeft: Math.max(0, Math.ceil(ROUND_SECONDS - state.elapsed)),
  }),
}
