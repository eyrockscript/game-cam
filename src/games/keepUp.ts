import type { FrameInput, MiniGame, StepResult } from '../core/types'
import { type Ball, type World, collide, hasFallen, stepBall } from '../game/physics'
import { renderKeepUp } from './render/keepUp'

export interface KeepUpState {
  readonly balls: readonly Ball[]
  readonly score: number
  readonly lives: number
  readonly nextId: number
  /** Last scoring impact per ball id, to avoid counting one touch many times */
  readonly lastImpactAt: Readonly<Record<number, number>>
}

export const INITIAL_LIVES = 3
const HIT_COOLDOWN_MS = 200
const POINTS_PER_EXTRA_BALL = 15
const MAX_BALLS = 4

export function ballRadius(world: World): number {
  return Math.min(world.width, world.height) * 0.05
}

export function spawnBall(id: number, world: World, random: () => number): Ball {
  const r = ballRadius(world)
  return {
    id,
    r,
    x: world.width * (0.25 + random() * 0.5),
    y: r * 2,
    vx: (random() - 0.5) * world.width * 0.2,
    vy: 0,
  }
}

function targetBallCount(score: number, players: number): number {
  const base = Math.max(1, Math.ceil(players / 2))
  return Math.min(MAX_BALLS, base + Math.floor(score / POINTS_PER_EXTRA_BALL))
}

function advanceBall(ball: Ball, input: FrameInput, world: World): { ball: Ball; impact: boolean } {
  let next = stepBall(ball, world, input.dt)
  let impact = false
  for (const player of input.players) {
    for (const collider of player.colliders) {
      const contact = collide(next, collider, world)
      if (contact) {
        next = contact.ball
        impact = impact || contact.impact
      }
    }
  }
  return { ball: next, impact }
}

function step(state: KeepUpState, input: FrameInput, world: World, random: () => number): StepResult<KeepUpState> {
  const events: string[] = []
  const kept: Ball[] = []
  const lastImpactAt = { ...state.lastImpactAt }
  let score = state.score
  let lives = state.lives

  for (const ball of state.balls) {
    const { ball: next, impact } = advanceBall(ball, input, world)
    if (hasFallen(next, world)) {
      lives -= 1
      events.push('lost')
      continue
    }
    if (impact && input.now - (lastImpactAt[ball.id] ?? -Infinity) > HIT_COOLDOWN_MS) {
      lastImpactAt[ball.id] = input.now
      score += 1
      events.push('hit')
    }
    kept.push(next)
  }

  if (lives <= 0) {
    return { state: { ...state, balls: [], score, lives: 0 }, events, finished: true }
  }

  let nextId = state.nextId
  while (kept.length < targetBallCount(score, input.players.length)) {
    kept.push(spawnBall(nextId, world, random))
    nextId += 1
  }
  return { state: { ...state, balls: kept, score, lives, nextId, lastImpactAt }, events, finished: false }
}

export const keepUpGame: MiniGame<KeepUpState> = {
  id: 'keepUp',
  titleKey: 'games.keepUp.title',
  descriptionKey: 'games.keepUp.description',
  start: (world, random) => ({
    balls: [spawnBall(1, world, random)],
    score: 0,
    lives: INITIAL_LIVES,
    nextId: 2,
    lastImpactAt: {},
  }),
  step,
  render: renderKeepUp,
  status: (state) => ({ score: state.score, lives: state.lives }),
}
