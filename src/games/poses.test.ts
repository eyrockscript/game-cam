import { describe, expect, it } from 'vitest'
import type { JointName } from '../core/types'
import { POSES, angleDiff, armAngles, matchesPose, poseJoints } from './poses'

const at = { x: 900, y: 400, scale: 200 }

describe('angleDiff', () => {
  it('wraps around ±180°', () => {
    expect(angleDiff(170, -170)).toBeCloseTo(20)
    expect(angleDiff(-90, 90)).toBeCloseTo(180)
    expect(angleDiff(10, 10)).toBe(0)
  })
})

describe('armAngles', () => {
  it('reads screen-space segment angles', () => {
    const tPose = POSES.find((p) => p.id === 'tPose')!
    const angles = armAngles(poseJoints(tPose, at))!
    expect(angleDiff(angles.leftUpper, 180)).toBeLessThan(0.01)
    expect(angleDiff(angles.rightFore, 0)).toBeLessThan(0.01)
  })

  it('uses screen sides, not the anatomical labels', () => {
    const yPose = POSES.find((p) => p.id === 'yPose')!
    const joints = poseJoints(yPose, at)
    const swap: Record<string, JointName> = {
      leftShoulder: 'rightShoulder', rightShoulder: 'leftShoulder',
      leftElbow: 'rightElbow', rightElbow: 'leftElbow',
      leftWrist: 'rightWrist', rightWrist: 'leftWrist',
    }
    const mirroredLabels = Object.fromEntries(Object.entries(joints).map(([k, v]) => [swap[k] ?? k, v]))
    expect(matchesPose(mirroredLabels, yPose)).toBe(true)
  })

  it('is null when an arm joint is missing', () => {
    const partial = Object.fromEntries(Object.entries(poseJoints(POSES[0], at)).filter(([name]) => name !== 'leftWrist'))
    expect(armAngles(partial)).toBeNull()
  })
})

describe('matchesPose', () => {
  it('matches every pose against its own skeleton', () => {
    for (const pose of POSES) expect(matchesPose(poseJoints(pose, at), pose)).toBe(true)
  })

  it('never confuses two different poses', () => {
    for (const a of POSES) {
      for (const b of POSES) {
        if (a.id !== b.id) expect(matchesPose(poseJoints(a, at), b), `${a.id} vs ${b.id}`).toBe(false)
      }
    }
  })

  it('tolerates small errors but not large ones', () => {
    const tPose = POSES.find((p) => p.id === 'tPose')!
    const close = { ...tPose, angles: { ...tPose.angles, leftFore: 180 - 20 } }
    const far = { ...tPose, angles: { ...tPose.angles, leftFore: 180 - 35 } }
    expect(matchesPose(poseJoints(close, at), tPose)).toBe(true)
    expect(matchesPose(poseJoints(far, at), tPose)).toBe(false)
  })
})
