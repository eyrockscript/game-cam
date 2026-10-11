import type { Collider, World } from '../game/physics'

export type JointName =
  | 'nose'
  | 'leftShoulder'
  | 'rightShoulder'
  | 'leftElbow'
  | 'rightElbow'
  | 'leftWrist'
  | 'rightWrist'
  | 'leftHip'
  | 'rightHip'
  | 'leftKnee'
  | 'rightKnee'
  | 'leftAnkle'
  | 'rightAnkle'

/** Raw skeleton point in canvas pixels; score is the model confidence 0..1. */
export interface Joint {
  readonly x: number
  readonly y: number
  readonly score: number
}

/** One tracked person in canvas pixel coordinates. */
export interface Player {
  /** Visible skeleton joints (anatomical left/right as seen by the model). */
  readonly joints: Readonly<Partial<Record<JointName, Joint>>>
  /** Stable id while the person stays in frame. */
  readonly id: number
  /** CSS color assigned to this player. */
  readonly color: string
  /** Every tracked body part (head, shoulders, elbows, hands, knees, feet). */
  readonly colliders: readonly Collider[]
  /** Just the two hands, placed on the estimated palm (subset of colliders), velocity in px/s. */
  readonly hands: readonly Collider[]
  /** Head collider, when visible. */
  readonly head: Collider | null
}

export interface FrameInput {
  readonly players: readonly Player[]
  /** Seconds since the previous frame (already clamped). */
  readonly dt: number
  /** Monotonic timestamp in ms. */
  readonly now: number
}

export interface GameStatus {
  readonly score: number
  readonly lives?: number
  readonly secondsLeft?: number
}

export interface StepResult<S> {
  readonly state: S
  /** Free-form event names, e.g. 'hit', 'pop', 'bomb'. Used for effects only. */
  readonly events: readonly string[]
  /** True when the round is over (out of lives or time). */
  readonly finished: boolean
}

/**
 * A playable mini-game. Implementations must be pure: never mutate the input
 * state, never touch the DOM except inside render().
 */
export interface MiniGame<S> {
  readonly id: string
  /** i18n keys (see src/i18n/es.json → games.<id>.title / .description). */
  readonly titleKey: string
  readonly descriptionKey: string
  start(world: World, random: () => number): S
  step(state: S, input: FrameInput, world: World, random: () => number): StepResult<S>
  render(ctx: CanvasRenderingContext2D, state: S, world: World): void
  status(state: S): GameStatus
}

/** Methods above are bivariant, so any MiniGame<S> fits here. */
export type AnyMiniGame = MiniGame<unknown>
