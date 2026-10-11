import { COLORS } from '../../render/theme'
import { type SphereColors, clamp01, drawDroplets, drawRing, drawSparkle, drawSphere, drawSpecular, progressOf } from '../../render/fx'
import type { Flash, Half, Item, NinjaState, Slash } from '../ninja'

export const HALF_LIFETIME = 0.8
export const FLASH_LIFETIME = 0.45
export const SLASH_LIFETIME = 0.28
const JUICE_SECONDS = 0.45

interface FruitLook {
  readonly body: SphereColors
  readonly rind: string
  readonly pith: string
  readonly flesh: string
  readonly kind: 'melon' | 'citrus' | 'apple'
}

/** Desaturated fruit look per style index; the index is stored in game state. */
const LOOKS: readonly FruitLook[] = [
  { body: ['#9fd8a6', '#3f9a58', '#1d5233'], rind: '#2f7d48', pith: '#dcefc9', flesh: '#e0566a', kind: 'melon' },
  { body: ['#ffd2a8', '#ee8a30', '#b0500f'], rind: '#e07a22', pith: '#fff1dc', flesh: '#f7b25c', kind: 'citrus' },
  { body: ['#fff3b0', '#e8c640', '#a98414'], rind: '#d9b52e', pith: '#fffbe0', flesh: '#f3e07a', kind: 'citrus' },
  { body: ['#f4b6b0', '#d4524a', '#8e2a2a'], rind: '#c44440', pith: '#fbf1e0', flesh: '#f6e8cc', kind: 'apple' },
]
export const FRUIT_STYLE_COUNT = LOOKS.length

const BOMB_BODY: SphereColors = ['#6b6b75', '#2b2b32', '#0e0e12']

function drawStem(ctx: CanvasRenderingContext2D, x: number, y: number, r: number, leaf: string): void {
  ctx.save()
  ctx.lineCap = 'round'
  ctx.strokeStyle = '#6b4423'
  ctx.lineWidth = r * 0.12
  ctx.beginPath()
  ctx.moveTo(x, y - r * 0.85)
  ctx.lineTo(x + r * 0.08, y - r * 1.2)
  ctx.stroke()
  ctx.fillStyle = leaf
  ctx.beginPath()
  ctx.ellipse(x + r * 0.34, y - r * 1.08, r * 0.3, r * 0.14, -0.5, 0, Math.PI * 2)
  ctx.fill()
  ctx.restore()
}

function drawMelonStripes(ctx: CanvasRenderingContext2D, x: number, y: number, r: number): void {
  ctx.save()
  ctx.beginPath()
  ctx.arc(x, y, r, 0, Math.PI * 2)
  ctx.clip()
  ctx.strokeStyle = 'rgba(16, 60, 34, 0.45)'
  ctx.lineWidth = r * 0.16
  for (const k of [-0.55, 0, 0.55]) {
    ctx.beginPath()
    ctx.moveTo(x + r * k * 0.5, y - r)
    ctx.quadraticCurveTo(x + r * k * 1.5, y, x + r * k * 0.5, y + r)
    ctx.stroke()
  }
  ctx.restore()
}

function drawFruit(ctx: CanvasRenderingContext2D, item: Item): void {
  const look = LOOKS[item.style % LOOKS.length]
  drawSphere(ctx, item.x, item.y, item.r, look.body)
  if (look.kind === 'melon') drawMelonStripes(ctx, item.x, item.y, item.r)
  drawSpecular(ctx, item.x, item.y, item.r, 0.45)
  drawStem(ctx, item.x, item.y, item.r, look.kind === 'melon' ? '#4c9a5a' : '#58a05a')
}

function drawSegments(ctx: CanvasRenderingContext2D, r: number, color: string): void {
  ctx.strokeStyle = color
  ctx.lineWidth = Math.max(1.5, r * 0.05)
  ctx.beginPath()
  for (let i = 1; i < 6; i += 1) {
    const a = -Math.PI / 2 + (i / 6) * Math.PI * 2
    ctx.moveTo(0, 0)
    ctx.lineTo(Math.cos(a) * r * 0.74, Math.sin(a) * r * 0.74)
  }
  ctx.stroke()
}

function drawSeeds(ctx: CanvasRenderingContext2D, r: number, color: string): void {
  ctx.fillStyle = color
  for (const [sx, sy] of [[0.25, -0.35], [0.4, 0.05], [0.2, 0.4], [-0.1, 0.1]]) {
    ctx.beginPath()
    ctx.ellipse(r * sx, r * sy, r * 0.05, r * 0.09, 0.5, 0, Math.PI * 2)
    ctx.fill()
  }
}

function halfPath(ctx: CanvasRenderingContext2D, r: number, start: number): void {
  ctx.beginPath()
  ctx.arc(0, 0, r, start, start + Math.PI)
  ctx.closePath()
}

function drawHalf(ctx: CanvasRenderingContext2D, half: Half): void {
  const look = LOOKS[half.style % LOOKS.length]
  const start = half.side === 1 ? -Math.PI / 2 : Math.PI / 2
  ctx.save()
  ctx.globalAlpha = clamp01(1 - half.age / HALF_LIFETIME)
  ctx.translate(half.x, half.y)
  ctx.rotate(half.angle)
  halfPath(ctx, half.r, start)
  ctx.fillStyle = look.rind
  ctx.fill()
  halfPath(ctx, half.r * 0.88, start)
  ctx.fillStyle = look.pith
  ctx.fill()
  halfPath(ctx, half.r * 0.8, start)
  ctx.fillStyle = look.flesh
  ctx.fill()
  ctx.save()
  halfPath(ctx, half.r * 0.8, start)
  ctx.clip()
  if (look.kind === 'melon') drawSeeds(ctx, half.r * (half.side === 1 ? 1 : -1), '#2a1c1c')
  else if (look.kind === 'citrus') drawSegments(ctx, half.r, look.pith)
  else drawSeeds(ctx, half.r * 0.5 * half.side, '#5a3a22')
  ctx.restore()
  ctx.restore()
  if (half.age < JUICE_SECONDS) {
    const t = half.age / JUICE_SECONDS
    drawDroplets(ctx, half.x, half.y, 6, half.r * 0.6, half.r * 1.7, Math.max(2, half.r * 0.07), t, look.flesh, half.id)
  }
}

function drawBomb(ctx: CanvasRenderingContext2D, item: Item, now: number): void {
  const { x, y, r } = item
  drawSphere(ctx, x, y, r, BOMB_BODY)
  drawSpecular(ctx, x, y, r, 0.35)
  const tipX = x + r * 0.5
  const tipY = y - r * 1.3
  ctx.save()
  ctx.lineCap = 'round'
  ctx.strokeStyle = '#b8a98a'
  ctx.lineWidth = r * 0.12
  ctx.beginPath()
  ctx.moveTo(x + r * 0.2, y - r * 0.92)
  ctx.quadraticCurveTo(x + r * 0.55, y - r * 1.05, tipX, tipY)
  ctx.stroke()
  const blink = Math.floor(now / 90) % 2 === 0
  ctx.translate(tipX, tipY)
  ctx.rotate(now / 220)
  drawSparkle(ctx, r * (blink ? 0.42 : 0.3), blink ? '#ffe28a' : COLORS.accent)
  ctx.restore()
}

function drawFlash(ctx: CanvasRenderingContext2D, flash: Flash): void {
  const t = progressOf(flash.age, FLASH_LIFETIME)
  ctx.save()
  ctx.globalAlpha = 0.32 * (1 - t)
  ctx.fillStyle = COLORS.danger
  ctx.beginPath()
  ctx.arc(flash.x, flash.y, flash.r * (0.4 + t * 0.7), 0, Math.PI * 2)
  ctx.fill()
  ctx.restore()
  drawRing(ctx, flash.x, flash.y, flash.r * 0.3, flash.r * 1.2, t, COLORS.danger, flash.r * 0.12)
  drawRing(ctx, flash.x, flash.y, flash.r * 0.2, flash.r * 0.8, t, '#ffffff', flash.r * 0.05)
  drawDroplets(ctx, flash.x, flash.y, 10, flash.r * 0.4, flash.r * 1.3, flash.r * 0.06, t, COLORS.danger, flash.x)
}

function drawSlash(ctx: CanvasRenderingContext2D, s: Slash): void {
  const t = progressOf(s.age, SLASH_LIFETIME)
  const half = s.r * (2.2 + 1.2 * t)
  const dx = Math.cos(s.angle) * half
  const dy = Math.sin(s.angle) * half
  ctx.save()
  ctx.globalAlpha = 1 - t
  ctx.lineCap = 'round'
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.9)'
  ctx.lineWidth = Math.max(2, s.r * 0.22 * (1 - t))
  ctx.beginPath()
  ctx.moveTo(s.x - dx, s.y - dy)
  ctx.lineTo(s.x + dx, s.y + dy)
  ctx.stroke()
  ctx.restore()
}

export function renderNinja(ctx: CanvasRenderingContext2D, state: NinjaState): void {
  const now = performance.now()
  state.slashes?.forEach((s) => drawSlash(ctx, s))
  state.halves.forEach((h) => drawHalf(ctx, h))
  state.items.forEach((i) => (i.kind === 'bomb' ? drawBomb(ctx, i, now) : drawFruit(ctx, i)))
  state.flashes.forEach((f) => drawFlash(ctx, f))
}
