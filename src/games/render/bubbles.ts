import { COLORS, drawText, easeOutBack, easeOutCubic, unit } from '../../render/theme'
import type { World } from '../../game/physics'
import { drawDroplets, drawRing, drawSparkle, progressOf } from '../../render/fx'
import type { Bubble, BubblesState, PopEffect, ScoreText } from '../bubbles'

export const POP_DURATION_MS = 280
export const SCORE_TEXT_MS = 750

const GOLD = '#e8b93f'
const GOLD_LIGHT = '#fbe4a0'
const GLASS = '176, 214, 232'
const IRIDESCENT: readonly string[] = ['rgba(222, 168, 196, 0.55)', 'rgba(164, 214, 190, 0.5)']
const bodyCache = new Map<string, CanvasGradient>()

/** Radial body gradient at the origin: clear center, tinted rim. Cached per radius and kind. */
function bodyGradient(ctx: CanvasRenderingContext2D, r: number, golden: boolean): CanvasGradient {
  const key = `${Math.round(r)}|${golden}`
  const cached = bodyCache.get(key)
  if (cached) return cached
  if (bodyCache.size > 48) bodyCache.clear()
  const g = ctx.createRadialGradient(-r * 0.2, -r * 0.25, r * 0.15, 0, 0, r)
  if (golden) {
    g.addColorStop(0, 'rgba(255, 240, 190, 0.55)')
    g.addColorStop(0.7, 'rgba(236, 186, 60, 0.5)')
    g.addColorStop(1, 'rgba(190, 128, 20, 0.85)')
  } else {
    g.addColorStop(0, `rgba(${GLASS}, 0.04)`)
    g.addColorStop(0.7, `rgba(${GLASS}, 0.16)`)
    g.addColorStop(1, `rgba(${GLASS}, 0.5)`)
  }
  bodyCache.set(key, g)
  return g
}

function drawIridescence(ctx: CanvasRenderingContext2D, r: number): void {
  ctx.lineWidth = Math.max(1.5, r * 0.07)
  ctx.lineCap = 'round'
  ctx.strokeStyle = IRIDESCENT[0]
  ctx.beginPath()
  ctx.arc(0, 0, r * 0.84, Math.PI * 0.05, Math.PI * 0.55)
  ctx.stroke()
  ctx.strokeStyle = IRIDESCENT[1]
  ctx.beginPath()
  ctx.arc(0, 0, r * 0.84, Math.PI * 1.1, Math.PI * 1.5)
  ctx.stroke()
}

function drawGoldenSparkles(ctx: CanvasRenderingContext2D, r: number, now: number): void {
  for (let i = 0; i < 2; i += 1) {
    const a = now / 900 + i * Math.PI
    ctx.save()
    ctx.translate(Math.cos(a) * r * 0.55, Math.sin(a) * r * 0.55)
    ctx.rotate(now / 600)
    drawSparkle(ctx, r * (0.22 + 0.06 * Math.sin(now / 160 + i)), '#fff6d6')
    ctx.restore()
  }
}

function drawBubble(ctx: CanvasRenderingContext2D, b: Bubble, now: number): void {
  const { r } = b
  ctx.save()
  ctx.translate(b.x, b.y)
  ctx.beginPath()
  ctx.arc(0, 0, r, 0, Math.PI * 2)
  ctx.fillStyle = bodyGradient(ctx, r, b.golden)
  ctx.fill()
  ctx.lineWidth = Math.max(2, r * (b.golden ? 0.1 : 0.05))
  ctx.strokeStyle = b.golden ? GOLD : 'rgba(226, 244, 252, 0.8)'
  ctx.stroke()
  if (!b.golden) drawIridescence(ctx, r)
  ctx.lineCap = 'round'
  ctx.lineWidth = Math.max(2, r * 0.09)
  ctx.strokeStyle = b.golden ? GOLD_LIGHT : 'rgba(255, 255, 255, 0.85)'
  ctx.beginPath()
  ctx.arc(0, 0, r * 0.68, Math.PI * 1.12, Math.PI * 1.42)
  ctx.stroke()
  ctx.fillStyle = 'rgba(255, 255, 255, 0.8)'
  ctx.beginPath()
  ctx.arc(r * 0.42, r * 0.38, r * 0.07, 0, Math.PI * 2)
  ctx.fill()
  if (b.golden) drawGoldenSparkles(ctx, r, now)
  ctx.restore()
}

function drawPop(ctx: CanvasRenderingContext2D, p: PopEffect): void {
  const t = progressOf(p.ageMs, POP_DURATION_MS)
  const color = p.golden ? GOLD_LIGHT : 'rgba(236, 248, 255, 1)'
  drawRing(ctx, p.x, p.y, p.r, p.r * 1.7, t, color, p.r * 0.14)
  drawDroplets(ctx, p.x, p.y, p.golden ? 10 : 7, p.r * 0.9, p.r * 1.9, Math.max(2, p.r * 0.09), t, color, p.x)
}

function drawScoreText(ctx: CanvasRenderingContext2D, s: ScoreText, size: number): void {
  const t = progressOf(s.ageMs, SCORE_TEXT_MS)
  const scale = 0.4 + 0.6 * easeOutBack(Math.min(1, t * 4))
  ctx.save()
  ctx.globalAlpha = t < 0.6 ? 1 : 1 - (t - 0.6) / 0.4
  ctx.translate(s.x, s.y - size * 1.6 * easeOutCubic(t))
  ctx.scale(scale, scale)
  const big = s.golden ? size * 1.35 : size
  drawText(ctx, `+${s.points}`, 0, 0, {
    size: big,
    color: s.golden ? GOLD_LIGHT : COLORS.text,
    align: 'center',
    baseline: 'middle',
    outline: true,
  })
  ctx.restore()
}

export function renderBubbles(ctx: CanvasRenderingContext2D, state: BubblesState, world: World): void {
  const now = performance.now()
  const size = unit(world) * TEXT_SCALE
  ctx.save()
  state.bubbles.forEach((b) => drawBubble(ctx, b, now))
  state.pops.forEach((p) => drawPop(ctx, p))
  state.scoreTexts?.forEach((s) => drawScoreText(ctx, s, size))
  ctx.restore()
}

const TEXT_SCALE = 0.05
