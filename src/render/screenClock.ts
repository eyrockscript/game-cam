/**
 * Render-only clock that remembers when the current screen kind started.
 * Session screens are recreated every frame (immutable), so we key on the
 * screen kind (plus game index) instead of object identity. This never feeds
 * back into game logic; it only drives entrance animations.
 */
import type { Screen } from '../app/session'

let currentKey = ''
let enteredAt = 0

function keyFor(screen: Screen): string {
  return screen.kind === 'menu' ? 'menu' : `${screen.kind}:${screen.gameIndex}`
}

/** Milliseconds since `screen` (by kind) became active. Call once per frame. */
export function screenAge(screen: Screen, now: number): number {
  const key = keyFor(screen)
  if (key !== currentKey) {
    currentKey = key
    enteredAt = now
  }
  return Math.max(0, now - enteredAt)
}
