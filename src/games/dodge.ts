import type { FrameInput, MiniGame, StepResult } from '../core/types'
import type { Collider, World } from '../game/physics'
import { DEBRIS_SECONDS, INVULNERABLE_SECONDS, WARNING_SECONDS, renderDodge } from './render/dodge'

export { INVULNERABLE_SECONDS, WARNING_SECONDS }

export interface Rock {
  readonly id: number
  readonly x: number
  readonly y: number
  readonly r: number
  /** Fall speed in px/s */
  readonly vy: number
  readonly angle: number
  /** Rotation speed in rad/s */
  readonly spin: number
  /** Per-vertex radius multipliers, fixed at spawn so the stone shape is stable */
  readonly shape: readonly number[]
}

/** A rock announced at the top edge; it drops when `ttl` runs out. */
export interface Warning {
  readonly rock: Rock
  /** Seconds until the rock drops */
  readonly ttl: number
}

export interface Debris {
  readonly x: number
  readonly y: number
  readonly vx: number
  readonly vy: number
  readonly size: number
  /** Remaining seconds */
  readonly life: number
}

export interface DodgeState {
  readonly rocks: readonly Rock[]
  readonly warnings: readonly Warning[]
  readonly debris: readonly Debris[]
  /** Rocks that left the bottom without hitting anyone */
  readonly score: number
  readonly lives: number
  readonly nextId: number
  /** Seconds survived, drives the difficulty ramp */
  readonly elapsed: number
  /** Seconds until the next warning is issued */
  readonly spawnTimer: number
  /** Remaining invulnerability seconds */
  readonly invulnerable: number
}

export const INITIAL_LIVES = 3
const FIRST_SPAWN_SECONDS = 1
const START_INTERVAL = 1.6
const MIN_INTERVAL = 0.45
const INTERVAL_SHRINK_PER_SECOND = 0.02
const PLAYER_RATE_BONUS = 0.12
const MAX_PLAYER_BONUS = 4
const HIT_FORGIVENESS = 0.85
const DEBRIS_PIECES = 8
const SHAPE_VERTICES = 9

/** Scales sizes and speeds so portrait and landscape feel alike. */
function scaleOf(world: World): number {
  return Math.min(world.width, world.height) / world.height
}

export function spawnInterval(elapsed: number, playerCount: number): number {
  const base = Math.max(MIN_INTERVAL, START_INTERVAL - elapsed * INTERVAL_SHRINK_PER_SECOND)
  const extraPlayers = Math.min(MAX_PLAYER_BONUS, Math.max(0, playerCount - 1))
  return base / (1 + extraPlayers * PLAYER_RATE_BONUS)
}

export function fallSpeed(elapsed: number, world: World): number {
  const ramp = 0.35 + Math.min(0.5, elapsed * 0.006)
  return world.height * ramp * scaleOf(world)
}

function createRock(id: number, elapsed: number, world: World, random: () => number): Rock {
  const r = Math.min(world.width, world.height) * (0.04 + random() * 0.05)
  const x = r + random() * (world.width - 2 * r)
  const vy = fallSpeed(elapsed, world) * (0.85 + random() * 0.3)
  const spin = (random() - 0.5) * 1.6
  const angle = random() * Math.PI * 2
  const shape = Array.from({ length: SHAPE_VERTICES }, () => 0.7 + random() * 0.3)
  return { id, x, y: -r, r, vy, angle, spin, shape }
}

function shatter(rock: Rock, random: () => number): Debris[] {
  return Array.from({ length: DEBRIS_PIECES }, () => {
    const dir = random() * Math.PI * 2
    const speed = rock.r * (2 + random() * 4)
    return {
      x: rock.x,
      y: rock.y,
      vx: Math.cos(dir) * speed,
      vy: Math.sin(dir) * speed,
      size: rock.r * (0.1 + random() * 0.15),
      life: DEBRIS_SECONDS,
    }
  })
}

function advanceDebris(debris: readonly Debris[], dt: number): Debris[] {
  return debris
    .map((d) => ({ ...d, x: d.x + d.vx * dt, y: d.y + d.vy * dt, vy: d.vy + 400 * dt, life: d.life - dt }))
    .filter((d) => d.life > 0)
}

function touches(rock: Rock, colliders: readonly Collider[]): boolean {
  return colliders.some((c) => Math.hypot(rock.x - c.x, rock.y - c.y) < rock.r * HIT_FORGIVENESS + c.r)
}

function advanceWarnings(
  warnings: readonly Warning[],
  dt: number,
): { pending: Warning[]; dropped: Rock[] } {
  const pending: Warning[] = []
  const dropped: Rock[] = []
  for (const w of warnings) {
    const ttl = w.ttl - dt
    if (ttl > 0) pending.push({ ...w, ttl })
    else dropped.push(w.rock)
  }
  return { pending, dropped }
}

function issueWarnings(
  state: DodgeState,
  pending: Warning[],
  playerCount: number,
  world: World,
  random: () => number,
): { warnings: Warning[]; spawnTimer: number; nextId: number } {
  const warnings = [...pending]
  let spawnTimer = state.spawnTimer
  let nextId = state.nextId
  while (spawnTimer <= 0) {
    warnings.push({ rock: createRock(nextId, state.elapsed, world, random), ttl: WARNING_SECONDS })
    nextId += 1
    spawnTimer += spawnInterval(state.elapsed, playerCount)
  }
  return { warnings, spawnTimer, nextId }
}

interface RockOutcome {
  readonly rocks: Rock[]
  readonly debris: Debris[]
  readonly score: number
  readonly lives: number
  readonly invulnerable: number
  readonly events: string[]
}

function resolveRocks(
  rocks: readonly Rock[],
  input: FrameInput,
  world: World,
  state: DodgeState,
  invulnerableLeft: number,
  random: () => number,
): RockOutcome {
  const out: RockOutcome = {
    rocks: [], debris: [], score: state.score, lives: state.lives, invulnerable: invulnerableLeft, events: [],
  }
  const colliders = input.players.flatMap((p) => p.colliders)
  let { score, lives, invulnerable } = out
  for (const rock of rocks) {
    const moved: Rock = { ...rock, y: rock.y + rock.vy * input.dt, angle: rock.angle + rock.spin * input.dt }
    if (invulnerable <= 0 && touches(moved, colliders)) {
      lives -= 1
      invulnerable = INVULNERABLE_SECONDS
      out.debris.push(...shatter(moved, random))
      out.events.push('hit')
    } else if (moved.y - moved.r > world.height) {
      score += 1
      out.events.push('dodged')
    } else {
      out.rocks.push(moved)
    }
  }
  return { ...out, score, lives, invulnerable }
}

function step(state: DodgeState, input: FrameInput, world: World, random: () => number): StepResult<DodgeState> {
  const elapsed = state.elapsed + input.dt
  const invulnerableLeft = Math.max(0, state.invulnerable - input.dt)
  const { pending, dropped } = advanceWarnings(state.warnings, input.dt)
  const resolved = resolveRocks([...state.rocks, ...dropped], input, world, state, invulnerableLeft, random)
  const timed: DodgeState = { ...state, elapsed, spawnTimer: state.spawnTimer - input.dt }
  const issued = issueWarnings(timed, pending, input.players.length, world, random)

  const next: DodgeState = {
    rocks: resolved.rocks,
    warnings: issued.warnings,
    debris: [...advanceDebris(state.debris, input.dt), ...resolved.debris],
    score: resolved.score,
    lives: Math.max(0, resolved.lives),
    nextId: issued.nextId,
    elapsed,
    spawnTimer: issued.spawnTimer,
    invulnerable: resolved.invulnerable,
  }
  return { state: next, events: resolved.events, finished: next.lives <= 0 }
}

export const dodgeGame: MiniGame<DodgeState> = {
  id: 'dodge',
  titleKey: 'games.dodge.title',
  descriptionKey: 'games.dodge.description',
  start: () => ({
    rocks: [],
    warnings: [],
    debris: [],
    score: 0,
    lives: INITIAL_LIVES,
    nextId: 1,
    elapsed: 0,
    spawnTimer: FIRST_SPAWN_SECONDS,
    invulnerable: 0,
  }),
  step,
  render: renderDodge,
  status: (state) => ({ score: state.score, lives: state.lives }),
}
