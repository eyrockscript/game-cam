import type { World } from '../../game/physics'
import { COLORS, unit } from '../../render/theme'
import { type SphereColors, drawGroundShadow, drawRing, drawSphere, drawSpecular, progressOf } from '../../render/fx'
import type { KeepUpState } from '../keepUp'

const BALL_COLORS: SphereColors = ['#ffd2a8', '#ec7a2c', '#a8460f']
const SEAM_COLOR = 'rgba(58, 24, 6, 0.75)'
const IMPACT_MS = 380

/** Rolling-ball angle derived from the horizontal position (no state needed). */
export function ballAngle(x: number, r: number): number {
  return (x / Math.max(1, r)) * 0.85
}

function drawSeams(ctx: CanvasRenderingContext2D, r: number): void {
  ctx.lineWidth = Math.max(1.5, r * 0.07)
  ctx.strokeStyle = SEAM_COLOR
  ctx.lineCap = 'round'
  ctx.beginPath()
  ctx.moveTo(0, -r)
  ctx.lineTo(0, r)
  ctx.moveTo(-r, 0)
  ctx.lineTo(r, 0)
  ctx.stroke()
  ctx.beginPath()
  ctx.arc(-r * 1.45, 0, r * 1.05, -0.85, 0.85)
  ctx.stroke()
  ctx.beginPath()
  ctx.arc(r * 1.45, 0, r * 1.05, Math.PI - 0.85, Math.PI + 0.85)
  ctx.stroke()
}

function drawBallBody(ctx: CanvasRenderingContext2D, x: number, y: number, r: number): void {
  drawSphere(ctx, x, y, r, BALL_COLORS)
  ctx.save()
  ctx.translate(x, y)
  ctx.beginPath()
  ctx.arc(0, 0, r, 0, Math.PI * 2)
  ctx.clip()
  ctx.rotate(ballAngle(x, r))
  drawSeams(ctx, r)
  ctx.restore()
  drawSpecular(ctx, x, y, r, 0.45)
  ctx.save()
  ctx.lineWidth = Math.max(1.5, r * 0.06)
  ctx.strokeStyle = 'rgba(58, 24, 6, 0.55)'
  ctx.beginPath()
  ctx.arc(x, y, r - ctx.lineWidth / 2, 0, Math.PI * 2)
  ctx.stroke()
  ctx.restore()
}

function drawShadow(ctx: CanvasRenderingContext2D, x: number, r: number, y: number, world: World): void {
  const closeness = Math.min(1, Math.max(0, y / world.height))
  const groundY = world.height - unit(world) * 0.025
  const rx = r * (0.7 + 0.5 * closeness)
  drawGroundShadow(ctx, x, groundY, rx, rx * 0.22, 0.12 + 0.38 * closeness)
}

export function renderKeepUp(ctx: CanvasRenderingContext2D, state: KeepUpState, world: World): void {
  const now = performance.now()
  for (const ball of state.balls) drawShadow(ctx, ball.x, ball.r, ball.y, world)
  for (const ball of state.balls) {
    drawBallBody(ctx, ball.x, ball.y, ball.r)
    const t = progressOf(now - (state.lastImpactAt[ball.id] ?? -Infinity), IMPACT_MS)
    if (t < 1) drawRing(ctx, ball.x, ball.y, ball.r, ball.r * 2.1, t, COLORS.text, ball.r * 0.16)
  }
}
