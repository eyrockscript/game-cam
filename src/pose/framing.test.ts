import { describe, expect, it } from 'vitest'
import type { Joint, Player } from '../core/types'
import { FRAMING_HOLD_MS, type FramingState, initialFraming, isFullBody, updateFraming } from './framing'

const joint: Joint = { x: 0, y: 0, score: 0.9 }

function upper(id = 1): Player {
  return { id, color: '#fff', joints: { nose: joint, leftShoulder: joint, rightShoulder: joint }, colliders: [], hands: [], head: null }
}

function full(id = 1): Player {
  const base = upper(id)
  return { ...base, joints: { ...base.joints, leftKnee: joint, rightKnee: joint } }
}

function feed(state: FramingState, players: Player[], frames: number, dtMs = 100): FramingState {
  return Array.from({ length: frames }).reduce<FramingState>((s) => updateFraming(s, players, dtMs), state)
}

describe('isFullBody', () => {
  it('needs both knees or both ankles', () => {
    expect(isFullBody(full())).toBe(true)
    expect(isFullBody(upper())).toBe(false)
    const oneKnee = { ...upper(), joints: { ...upper().joints, leftKnee: joint } }
    expect(isFullBody(oneKnee)).toBe(false)
    const ankles = { ...upper(), joints: { ...upper().joints, leftAnkle: joint, rightAnkle: joint } }
    expect(isFullBody(ankles)).toBe(true)
  })
})

describe('updateFraming', () => {
  it('starts as full body', () => {
    expect(initialFraming.framing).toBe('full')
  })

  it(`switches to upper only after ${FRAMING_HOLD_MS} ms without legs`, () => {
    expect(feed(initialFraming, [upper()], 9).framing).toBe('full')
    expect(feed(initialFraming, [upper()], 10).framing).toBe('upper')
  })

  it('stays full while any player shows their legs', () => {
    expect(feed(initialFraming, [upper(1), full(2)], 20).framing).toBe('full')
  })

  it('restarts the hold when the condition is interrupted', () => {
    const almost = feed(initialFraming, [upper()], 9)
    const interrupted = updateFraming(almost, [full()], 100)
    expect(feed(interrupted, [upper()], 9).framing).toBe('full')
  })

  it('switches back to full with the same hold', () => {
    const small = feed(initialFraming, [upper()], 10)
    expect(feed(small, [full()], 9).framing).toBe('upper')
    expect(feed(small, [full()], 10).framing).toBe('full')
  })

  it('keeps its state when nobody is visible', () => {
    const pending = feed(initialFraming, [upper()], 5)
    expect(updateFraming(pending, [], 100)).toBe(pending)
  })
})
