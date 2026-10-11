export interface Ball {
  readonly id: number
  readonly x: number
  readonly y: number
  readonly vx: number
  readonly vy: number
  readonly r: number
}

/** A body part acting as a solid circle (hand, head, foot...). */
export interface Collider {
  readonly x: number
  readonly y: number
  readonly vx: number
  readonly vy: number
  readonly r: number
}

export interface World {
  readonly width: number
  readonly height: number
  /** px/s² */
  readonly gravity: number
  /** 0..1 bounciness on body contact */
  readonly restitution: number
  /** Minimum upward speed after a hit from below, px/s */
  readonly minKick: number
  /** Speed cap so a fast swing can't launch the ball off-screen, px/s */
  readonly maxSpeed: number
}

export interface Contact {
  readonly ball: Ball
  /** True when the ball was approaching the collider (a real hit, not resting contact). */
  readonly impact: boolean
}

export function worldFor(width: number, height: number): World {
  return {
    width,
    height,
    gravity: height * 1.1,
    restitution: 0.75,
    minKick: height * 0.9,
    maxSpeed: height * 2.2,
  }
}

function clampSpeed(vx: number, vy: number, max: number): [number, number] {
  const speed = Math.hypot(vx, vy)
  if (speed <= max) return [vx, vy]
  const k = max / speed
  return [vx * k, vy * k]
}

/** Integrates gravity and bounces off the side walls and the ceiling (the floor is open). */
export function stepBall(ball: Ball, world: World, dt: number): Ball {
  let vx = ball.vx
  let vy = ball.vy + world.gravity * dt
  let x = ball.x + vx * dt
  let y = ball.y + vy * dt

  if (x < ball.r) {
    x = ball.r
    vx = Math.abs(vx) * 0.9
  } else if (x > world.width - ball.r) {
    x = world.width - ball.r
    vx = -Math.abs(vx) * 0.9
  }
  if (y < ball.r) {
    y = ball.r
    vy = Math.abs(vy) * 0.9
  }
  return { ...ball, x, y, vx, vy }
}

/** Resolves a ball/collider overlap. Returns null when they don't touch. */
export function collide(ball: Ball, c: Collider, world: World): Contact | null {
  const dx = ball.x - c.x
  const dy = ball.y - c.y
  const dist = Math.hypot(dx, dy)
  const minDist = ball.r + c.r
  if (dist >= minDist) return null

  const nx = dist > 0 ? dx / dist : 0
  const ny = dist > 0 ? dy / dist : -1
  const x = c.x + nx * minDist
  const y = c.y + ny * minDist

  const relVx = ball.vx - c.vx
  const relVy = ball.vy - c.vy
  const approach = relVx * nx + relVy * ny
  if (approach >= 0) return { ball: { ...ball, x, y }, impact: false }

  const j = (1 + world.restitution) * approach
  let vx = relVx - j * nx + c.vx
  let vy = relVy - j * ny + c.vy

  // Hit from below: guarantee a playable upward kick.
  if (ny < -0.3) vy = Math.min(vy, -world.minKick)
  ;[vx, vy] = clampSpeed(vx, vy, world.maxSpeed)

  return { ball: { ...ball, x, y, vx, vy }, impact: true }
}

export function hasFallen(ball: Ball, world: World): boolean {
  return ball.y - ball.r > world.height
}
