import { describe, expect, it } from 'vitest'
import { type Ball, collide, hasFallen, stepBall, worldFor } from './physics'

const world = worldFor(1000, 1000)
const ball = (over: Partial<Ball> = {}): Ball => ({ id: 1, x: 500, y: 500, vx: 0, vy: 0, r: 50, ...over })

describe('stepBall', () => {
  it('accelerates downward with gravity', () => {
    const next = stepBall(ball(), world, 0.1)
    expect(next.vy).toBeCloseTo(world.gravity * 0.1)
    expect(next.y).toBeGreaterThan(500)
  })

  it('bounces off the left wall', () => {
    const next = stepBall(ball({ x: 40, vx: -300 }), world, 0.01)
    expect(next.x).toBe(50)
    expect(next.vx).toBeGreaterThan(0)
  })

  it('bounces off the ceiling', () => {
    const next = stepBall(ball({ y: 40, vy: -300 }), world, 0.01)
    expect(next.y).toBe(50)
    expect(next.vy).toBeGreaterThan(0)
  })

  it('does not mutate the input ball', () => {
    const original = ball()
    stepBall(original, world, 0.1)
    expect(original.y).toBe(500)
  })
})

describe('collide', () => {
  const still = { x: 500, y: 600, vx: 0, vy: 0, r: 60 }

  it('returns null when not touching', () => {
    expect(collide(ball({ y: 300 }), still, world)).toBeNull()
  })

  it('kicks a falling ball upward when hit from below', () => {
    const contact = collide(ball({ y: 500, vy: 400 }), still, world)
    expect(contact?.impact).toBe(true)
    expect(contact!.ball.vy).toBeLessThanOrEqual(-world.minKick)
    expect(contact!.ball.y).toBeCloseTo(600 - 110)
  })

  it('transfers the hand velocity to the ball', () => {
    const swing = { ...still, x: 400, y: 500, vx: 1500 }
    const contact = collide(ball({ x: 480 }), swing, world)
    expect(contact!.ball.vx).toBeGreaterThan(1000)
  })

  it('caps the resulting speed', () => {
    const smash = { ...still, vy: -50000 }
    const contact = collide(ball({ vy: 400 }), smash, world)
    expect(Math.hypot(contact!.ball.vx, contact!.ball.vy)).toBeLessThanOrEqual(world.maxSpeed + 1e-6)
  })

  it('only separates (no impact) when already moving apart', () => {
    const contact = collide(ball({ vy: -800 }), still, world)
    expect(contact?.impact).toBe(false)
    expect(contact!.ball.vy).toBe(-800)
  })
})

describe('hasFallen', () => {
  it('is true only once the ball is fully below the floor', () => {
    expect(hasFallen(ball({ y: 1040 }), world)).toBe(false)
    expect(hasFallen(ball({ y: 1060 }), world)).toBe(true)
  })
})
