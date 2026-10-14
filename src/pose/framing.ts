import type { Framing, JointName, Player } from '../core/types'

export interface FramingState {
  readonly framing: Framing
  /** How long the opposite framing has been observed without interruption. */
  readonly pendingMs: number
}

/** Framing must hold this long before switching, so a crouch or a step doesn't flicker it. */
export const FRAMING_HOLD_MS = 1000

export const initialFraming: FramingState = { framing: 'full', pendingMs: 0 }

/** Player joints only contain confidently visible keypoints (see players.ts → namedJoints). */
function seen(player: Player, a: JointName, b: JointName): boolean {
  return player.joints[a] !== undefined && player.joints[b] !== undefined
}

export function isFullBody(player: Player): boolean {
  return seen(player, 'leftKnee', 'rightKnee') || seen(player, 'leftAnkle', 'rightAnkle')
}

/** Full when anyone shows their legs; switching either way needs FRAMING_HOLD_MS. Pure. */
export function updateFraming(state: FramingState, players: readonly Player[], dtMs: number): FramingState {
  if (players.length === 0) return state
  const observed: Framing = players.some(isFullBody) ? 'full' : 'upper'
  if (observed === state.framing) return state.pendingMs === 0 ? state : { framing: state.framing, pendingMs: 0 }
  const pendingMs = state.pendingMs + dtMs
  return pendingMs >= FRAMING_HOLD_MS ? { framing: observed, pendingMs: 0 } : { framing: state.framing, pendingMs }
}
