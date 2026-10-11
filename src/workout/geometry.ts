import type { Joint, JointName, Player } from '../core/types'

export type Joints = Player['joints']

export interface Point {
  readonly x: number
  readonly y: number
}

/** Joints below this model confidence are treated as missing. */
export const MIN_JOINT_SCORE = 0.3

/** Returns the joint only when it is present and confident enough. */
export function reliable(joints: Joints, name: JointName): Joint | null {
  const joint = joints[name]
  return joint && joint.score >= MIN_JOINT_SCORE ? joint : null
}

/** Returns all requested joints, or null if any of them is missing / unreliable. */
export function reliableAll<N extends JointName>(joints: Joints, names: readonly N[]): Record<N, Joint> | null {
  const out = {} as Record<N, Joint>
  for (const name of names) {
    const joint = reliable(joints, name)
    if (!joint) return null
    out[name] = joint
  }
  return out
}

export function distance(a: Point, b: Point): number {
  return Math.hypot(a.x - b.x, a.y - b.y)
}

export function midpoint(a: Point, b: Point): Point {
  return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }
}

/** Interior angle at `vertex` (degrees, 0..180) formed by a–vertex–c. */
export function angleDeg(a: Point, vertex: Point, c: Point): number {
  const ux = a.x - vertex.x
  const uy = a.y - vertex.y
  const vx = c.x - vertex.x
  const vy = c.y - vertex.y
  const lengths = Math.hypot(ux, uy) * Math.hypot(vx, vy)
  if (lengths === 0) return 180
  const cos = Math.max(-1, Math.min(1, (ux * vx + uy * vy) / lengths))
  return (Math.acos(cos) * 180) / Math.PI
}

/** Distance from the shoulder midpoint to the hip midpoint: the body-size unit. */
export function torsoLength(ls: Point, rs: Point, lh: Point, rh: Point): number {
  return distance(midpoint(ls, rs), midpoint(lh, rh))
}
