import { describe, expect, it } from 'vitest'
import {
  FAR,
  NEAR,
  type Placement,
  arms,
  armsUp,
  jack,
  jackOpen,
  knee,
  kneeAngle,
  kneeRaised,
  place,
  squatDown,
  standing,
  without,
} from './__fixtures__/skeleton'
import { EXERCISES, type ExerciseId, type Tracker, initialTracker, updateTracker } from './exercises'
import type { Joints } from './geometry'

/** Feeds frames through a detector and returns the total reps and final tracker. */
function run(id: ExerciseId, frames: readonly Joints[]): { reps: number; tracker: Tracker } {
  const ex = EXERCISES[id]
  return frames.reduce(
    (acc, joints) => {
      const r = updateTracker(ex, acc.tracker, joints)
      return { reps: acc.reps + r.reps, tracker: r.tracker }
    },
    { reps: 0, tracker: initialTracker(ex) },
  )
}

const at = (poses: ReturnType<typeof standing>[], p: Placement = NEAR): Joints[] => poses.map((pose) => place(pose, p))

describe('squats', () => {
  it('counts one full down-up motion as exactly one rep', () => {
    expect(run('squats', at([standing(), squatDown(), standing()])).reps).toBe(1)
    expect(run('squats', at([standing(), squatDown(), standing(), squatDown(), standing()])).reps).toBe(2)
  })

  it('does not count a squat that never comes back up', () => {
    expect(run('squats', at([standing(), squatDown(), kneeAngle(140)])).reps).toBe(0)
  })

  it('ignores jitter around the thresholds (hysteresis)', () => {
    const jitter = [standing(), kneeAngle(105), kneeAngle(115), kneeAngle(108), kneeAngle(150), kneeAngle(100), kneeAngle(155), standing()]
    expect(run('squats', at(jitter)).reps).toBe(1)
  })

  it('keeps the phase when leg joints are missing or unreliable', () => {
    const frames = [
      place(standing()),
      place(squatDown()),
      place(without(standing(), 'leftKnee', 'rightKnee')),
      place(standing(), NEAR, 0.1),
      place(standing()),
    ]
    expect(run('squats', frames).reps).toBe(1)
  })

  it('uses whichever leg is visible', () => {
    const oneLeg = (pose: ReturnType<typeof standing>) => without(pose, 'rightHip', 'rightKnee', 'rightAnkle')
    expect(run('squats', at([oneLeg(standing()), oneLeg(squatDown()), oneLeg(standing())])).reps).toBe(1)
  })
})

describe('jumping jacks', () => {
  it('counts open then closed as one rep', () => {
    expect(run('jumpingJacks', at([standing(), jackOpen(), standing()])).reps).toBe(1)
  })

  it('requires both arms up and feet apart to be open', () => {
    expect(run('jumpingJacks', at([standing(), armsUp(), standing()])).reps).toBe(0)
    expect(run('jumpingJacks', at([standing(), jack(1, 0.8), standing()])).reps).toBe(0)
  })

  it('ignores jitter in the in-between zone', () => {
    const frames = [standing(), jackOpen(), jack(-0.2, 0.5), jackOpen(), jack(-0.2, 0.5), standing()]
    expect(run('jumpingJacks', at(frames)).reps).toBe(1)
  })
})

describe('high knees', () => {
  it('counts each raise of either knee', () => {
    const frames = [standing(), kneeRaised('left'), standing(), kneeRaised('right'), standing(), kneeRaised('left')]
    expect(run('highKnees', at(frames)).reps).toBe(3)
  })

  it('tracks each leg independently', () => {
    const both = { ...kneeRaised('left'), rightKnee: kneeRaised('right').rightKnee }
    expect(run('highKnees', at([standing(), both])).reps).toBe(2)
  })

  it('does not double count a knee hovering near the threshold', () => {
    const frames = [standing(), kneeRaised('left'), knee('left', 1.45), kneeRaised('left'), knee('left', 1.5), standing()]
    expect(run('highKnees', at(frames)).reps).toBe(1)
  })

  it('does not count a knee already raised when first seen', () => {
    expect(run('highKnees', at([kneeRaised('left'), standing()])).reps).toBe(0)
  })
})

describe('arm raises', () => {
  it('counts up then down as one rep', () => {
    expect(run('armRaises', at([standing(), armsUp(), standing()])).reps).toBe(1)
  })

  it('ignores jitter between shoulders and nose', () => {
    const frames = [standing(), armsUp(), arms(-0.2), armsUp(), arms(-0.1), standing(), arms(0.2)]
    expect(run('armRaises', at(frames)).reps).toBe(1)
  })

  it('keeps the phase when the nose is not visible', () => {
    const frames = [place(standing()), place(armsUp()), place(without(standing(), 'nose')), place(standing())]
    expect(run('armRaises', frames).reps).toBe(1)
  })
})

describe('scale invariance', () => {
  const sequences: Record<ExerciseId, ReturnType<typeof standing>[]> = {
    squats: [standing(), squatDown(), standing(), squatDown(), standing()],
    jumpingJacks: [standing(), jackOpen(), standing(), jackOpen(), standing()],
    highKnees: [standing(), kneeRaised('left'), standing(), kneeRaised('right'), standing()],
    armRaises: [standing(), armsUp(), standing(), armsUp(), standing()],
  }

  for (const id of Object.keys(sequences) as ExerciseId[]) {
    it(`${id} counts the same near and far from the camera`, () => {
      const near = run(id, at(sequences[id], NEAR)).reps
      const far = run(id, at(sequences[id], FAR)).reps
      expect(near).toBe(2)
      expect(far).toBe(near)
    })
  }
})

describe('updateTracker purity', () => {
  it('never mutates the input tracker or joints', () => {
    const ex = EXERCISES.highKnees
    const tracker = Object.freeze(initialTracker(ex))
    const joints = Object.freeze(place(kneeRaised('left')))
    const snapshot = JSON.stringify(joints)
    const result = updateTracker(ex, tracker, joints)
    expect(tracker).toEqual(['unknown', 'unknown'])
    expect(JSON.stringify(joints)).toBe(snapshot)
    expect(result.tracker).not.toBe(tracker)
  })
})
