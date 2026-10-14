import type { Joint, JointName, Player } from '../../core/types'
import type { Joints } from '../geometry'

/** Body-unit coordinates: shoulder line at y=0, torso length 1, y grows downward. */
type Pose = Partial<Record<JointName, readonly [number, number]>>

const STANDING: Pose = {
  nose: [0, -0.45],
  leftShoulder: [0.4, 0],
  rightShoulder: [-0.4, 0],
  leftElbow: [0.45, 0.5],
  rightElbow: [-0.45, 0.5],
  leftWrist: [0.45, 1],
  rightWrist: [-0.45, 1],
  leftHip: [0.25, 1],
  rightHip: [-0.25, 1],
  leftKnee: [0.25, 1.9],
  rightKnee: [-0.25, 1.9],
  leftAnkle: [0.25, 2.8],
  rightAnkle: [-0.25, 2.8],
}

export interface Placement {
  readonly scale: number
  readonly x: number
  readonly y: number
}

export const NEAR: Placement = { scale: 300, x: 900, y: 150 }
export const FAR: Placement = { scale: 90, x: 400, y: 500 }

export function place(pose: Pose, at: Placement = NEAR, score = 0.9): Joints {
  const out: Partial<Record<JointName, Joint>> = {}
  for (const [name, p] of Object.entries(pose) as [JointName, readonly [number, number]][]) {
    out[name] = { x: at.x + p[0] * at.scale, y: at.y + p[1] * at.scale, score }
  }
  return out
}

export const standing = (): Pose => ({ ...STANDING })

/** Both legs bent so the hip–knee–ankle angle equals `deg`. */
export function kneeAngle(deg: number): Pose {
  const phi = ((180 - deg) * Math.PI) / 180
  const dx = 0.9 * Math.sin(phi)
  const dy = -0.9 * Math.cos(phi)
  return { ...STANDING, leftHip: [0.25 + dx, 1.9 + dy], rightHip: [-0.25 - dx, 1.9 + dy] }
}

export const squatDown = (): Pose => kneeAngle(90)

export function arms(wristY: number): Pose {
  return { ...STANDING, leftWrist: [0.35, wristY], rightWrist: [-0.35, wristY] }
}

export const armsUp = (): Pose => arms(-0.9)

export function jack(wristY: number, feetHalfWidth: number): Pose {
  return { ...arms(wristY), leftAnkle: [feetHalfWidth, 2.8], rightAnkle: [-feetHalfWidth, 2.8] }
}

export const jackOpen = (): Pose => jack(-0.9, 0.8)

export function knee(side: 'left' | 'right', kneeY: number): Pose {
  return side === 'left' ? { ...STANDING, leftKnee: [0.3, kneeY] } : { ...STANDING, rightKnee: [-0.3, kneeY] }
}

export const kneeRaised = (side: 'left' | 'right'): Pose => knee(side, 1.2)

export function without(pose: Pose, ...names: JointName[]): Pose {
  return Object.fromEntries(Object.entries(pose).filter(([n]) => !names.includes(n as JointName))) as Pose
}

export function player(id: number, joints: Joints, color = '#ff7a1a'): Player {
  return { id, color, joints, colliders: [], hands: [], head: null }
}

/** One arm stretched out to its own side at shoulder height, `reach` body units past the shoulder. */
export function sidePunch(side: 'left' | 'right', reach = 1): Pose {
  return side === 'left'
    ? { ...STANDING, leftElbow: [0.4 + reach / 2, 0], leftWrist: [0.4 + reach, 0] }
    : { ...STANDING, rightElbow: [-0.4 - reach / 2, 0], rightWrist: [-0.4 - reach, 0] }
}

/** Both wrists at chest height, `halfWidth` body units from the center. */
export function armSpread(halfWidth: number): Pose {
  return { ...STANDING, leftWrist: [halfWidth, 0.3], rightWrist: [-halfWidth, 0.3] }
}

export const armsClosed = (): Pose => armSpread(0.15)
export const armsOpen = (): Pose => armSpread(1.3)

/** What a camera sees in a small room: no hips, knees or ankles. */
export function upperOnly(pose: Pose): Pose {
  return without(pose, 'leftHip', 'rightHip', 'leftKnee', 'rightKnee', 'leftAnkle', 'rightAnkle')
}
