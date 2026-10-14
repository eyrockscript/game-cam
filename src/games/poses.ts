import type { Joint, JointName } from '../core/types'
import { type Joints, reliableAll } from '../workout/geometry'

/** Arm segments by screen side: upper = shoulder→elbow, fore = elbow→wrist. */
export type ArmSegment = 'leftUpper' | 'leftFore' | 'rightUpper' | 'rightFore'
export const SEGMENTS: readonly ArmSegment[] = ['leftUpper', 'leftFore', 'rightUpper', 'rightFore']

export type PoseId =
  | 'tPose'
  | 'yPose'
  | 'armsUp'
  | 'flex'
  | 'handsOnHead'
  | 'leftUp'
  | 'rightUp'
  | 'diagonalLeft'
  | 'diagonalRight'
  | 'handsOnHips'

export interface TargetPose {
  readonly id: PoseId
  /** Degrees in screen space: 0 right, 90 down, -90 up, 180 left. */
  readonly angles: Readonly<Record<ArmSegment, number>>
}

export const TOLERANCE_DEG = 25

function pose(id: PoseId, leftUpper: number, leftFore: number, rightUpper: number, rightFore: number): TargetPose {
  return { id, angles: { leftUpper, leftFore, rightUpper, rightFore } }
}

/** Upper-body only, so they work in small rooms. Pairwise distinct beyond the tolerance (tested). */
export const POSES: readonly TargetPose[] = [
  pose('tPose', 180, 180, 0, 0),
  pose('yPose', -135, -135, -45, -45),
  pose('armsUp', -90, -90, -90, -90),
  pose('flex', 180, -90, 0, -90),
  pose('handsOnHead', -150, -30, -30, -150),
  pose('leftUp', -90, -90, 90, 90),
  pose('rightUp', 90, 90, -90, -90),
  pose('diagonalLeft', -135, -135, 45, 45),
  pose('diagonalRight', 135, 135, -45, -45),
  pose('handsOnHips', 135, 45, 45, 135),
]

/** Smallest absolute difference between two angles, 0..180. */
export function angleDiff(a: number, b: number): number {
  const d = Math.abs(a - b) % 360
  return d > 180 ? 360 - d : d
}

type Point = Readonly<{ x: number; y: number }>
const degrees = (from: Point, to: Point): number => (Math.atan2(to.y - from.y, to.x - from.x) * 180) / Math.PI

const ARM_JOINTS = ['leftShoulder', 'rightShoulder', 'leftElbow', 'rightElbow', 'leftWrist', 'rightWrist'] as const

export function armAngles(joints: Joints): Record<ArmSegment, number> | null {
  const j = reliableAll(joints, ARM_JOINTS)
  if (!j) return null
  const anatomicalLeftOnScreenLeft = j.leftShoulder.x <= j.rightShoulder.x
  const a = { shoulder: j.leftShoulder, elbow: j.leftElbow, wrist: j.leftWrist }
  const b = { shoulder: j.rightShoulder, elbow: j.rightElbow, wrist: j.rightWrist }
  const [left, right] = anatomicalLeftOnScreenLeft ? [a, b] : [b, a]
  return {
    leftUpper: degrees(left.shoulder, left.elbow),
    leftFore: degrees(left.elbow, left.wrist),
    rightUpper: degrees(right.shoulder, right.elbow),
    rightFore: degrees(right.elbow, right.wrist),
  }
}

export function matchesPose(joints: Joints, target: TargetPose, tolerance: number = TOLERANCE_DEG): boolean {
  const angles = armAngles(joints)
  return angles !== null && SEGMENTS.every((s) => angleDiff(angles[s], target.angles[s]) <= tolerance)
}

const HALF_SHOULDERS = 0.4
const UPPER_ARM = 0.9
const FOREARM = 0.8

/**
 * Skeleton (head, shoulders, arms, hips) for a target pose: used to draw the
 * reference silhouette and as a test fixture. `scale` = pixels per body unit
 * (torso length = 1); (x, y) = shoulder midpoint. Screen-left side uses the
 * `left*` joint names.
 */
export function poseJoints(target: TargetPose, at: { x: number; y: number; scale: number }): Partial<Record<JointName, Joint>> {
  const p = (x: number, y: number): Joint => ({ x: at.x + x * at.scale, y: at.y + y * at.scale, score: 0.9 })
  const along = (from: Joint, deg: number, length: number): Joint => {
    const r = (deg * Math.PI) / 180
    return { x: from.x + Math.cos(r) * length * at.scale, y: from.y + Math.sin(r) * length * at.scale, score: 0.9 }
  }
  const leftShoulder = p(-HALF_SHOULDERS, 0)
  const rightShoulder = p(HALF_SHOULDERS, 0)
  const leftElbow = along(leftShoulder, target.angles.leftUpper, UPPER_ARM)
  const rightElbow = along(rightShoulder, target.angles.rightUpper, UPPER_ARM)
  return {
    nose: p(0, -0.45),
    leftShoulder,
    rightShoulder,
    leftElbow,
    rightElbow,
    leftWrist: along(leftElbow, target.angles.leftFore, FOREARM),
    rightWrist: along(rightElbow, target.angles.rightFore, FOREARM),
    leftHip: p(-0.25, 1),
    rightHip: p(0.25, 1),
  }
}
