/**
 * "Console arcade" design system for everything drawn on the canvas.
 * One accent (orange). Charcoal tiles over a dimmed camera feed.
 * All sizes derive from `unit(world)` = min(width, height) so the same code
 * reads well on a 4K TV from the couch and on a phone.
 */
import { CANVAS_FONT } from './shapes'

export const COLORS = {
  backdrop: 'rgba(12, 13, 17, 0.45)',
  tile: 'rgba(24, 26, 33, 0.86)',
  tileRaised: 'rgba(34, 37, 47, 0.94)',
  edge: 'rgba(244, 244, 245, 0.10)',
  edgeHighlight: 'rgba(255, 255, 255, 0.14)',
  text: '#f4f4f5',
  muted: '#a1a1aa',
  accent: '#ff7a1a',
  accentDeep: '#c2410c',
  accentTint: 'rgba(255, 122, 26, 0.22)',
  /** Text drawn on top of an accent fill. */
  onAccent: '#16181d',
  danger: '#ef4444',
  shadow: 'rgba(5, 6, 9, 0.55)',
} as const

/** Text scale as fractions of unit(world). */
export const TYPE = {
  hero: 0.16,
  display: 0.085,
  title: 0.05,
  body: 0.027,
  caption: 0.02,
} as const

export interface Rect {
  readonly x: number
  readonly y: number
  readonly w: number
  readonly h: number
}

export function unit(world: { width: number; height: number }): number {
  return Math.min(world.width, world.height)
}

export function font(weight: number, size: number): string {
  return `${weight} ${size}px ${CANVAS_FONT}`
}

// ---------------------------------------------------------------- motion

/** Overshooting ease (spring-like settle) for pop-ins: 0 → 1 with a small bounce. */
export function easeOutBack(t: number): number {
  const c = 1.70158
  const x = Math.min(1, Math.max(0, t)) - 1
  return 1 + (c + 1) * x * x * x + c * x * x
}

export function easeOutCubic(t: number): number {
  const x = 1 - Math.min(1, Math.max(0, t))
  return 1 - x * x * x
}

/** 0..1 breathing value for idle "alive" motion. */
export function pulse(nowMs: number, periodMs = 1600): number {
  return 0.5 - 0.5 * Math.cos((nowMs / periodMs) * Math.PI * 2)
}

// ---------------------------------------------------------------- surfaces

export interface TileStyle {
  readonly radius: number
  /** 0..1: lifts the tile (bigger shadow, raised fill). */
  readonly lift?: number
  /** Draws the accent outline (keyboard focus / selected). */
  readonly focused?: boolean
  readonly fill?: string
}

/** Rounded charcoal tile with a tinted drop shadow and a 1px top highlight (glass edge). */
export function drawTile(ctx: CanvasRenderingContext2D, r: Rect, style: TileStyle): void {
  const lift = style.lift ?? 0
  ctx.save()
  ctx.shadowColor = COLORS.shadow
  ctx.shadowBlur = style.radius * (0.8 + lift * 0.8)
  ctx.shadowOffsetY = style.radius * (0.25 + lift * 0.25)
  ctx.beginPath()
  ctx.roundRect(r.x, r.y, r.w, r.h, style.radius)
  ctx.fillStyle = style.fill ?? (lift > 0 ? COLORS.tileRaised : COLORS.tile)
  ctx.fill()
  ctx.restore()

  ctx.save()
  ctx.beginPath()
  ctx.roundRect(r.x + 0.5, r.y + 0.5, r.w - 1, r.h - 1, style.radius)
  ctx.lineWidth = 1
  ctx.strokeStyle = COLORS.edge
  ctx.stroke()
  ctx.beginPath()
  ctx.moveTo(r.x + style.radius, r.y + 1.5)
  ctx.lineTo(r.x + r.w - style.radius, r.y + 1.5)
  ctx.strokeStyle = COLORS.edgeHighlight
  ctx.stroke()
  if (style.focused) {
    ctx.beginPath()
    ctx.roundRect(r.x - 4, r.y - 4, r.w + 8, r.h + 8, style.radius + 4)
    ctx.lineWidth = Math.max(3, style.radius * 0.12)
    ctx.strokeStyle = COLORS.accent
    ctx.stroke()
  }
  ctx.restore()
}

/** Fills a tile from the bottom up as a hand-hold progress indicator. */
export function drawHoldFill(ctx: CanvasRenderingContext2D, r: Rect, radius: number, progress: number): void {
  if (progress <= 0) return
  ctx.save()
  ctx.beginPath()
  ctx.roundRect(r.x, r.y, r.w, r.h, radius)
  ctx.clip()
  ctx.fillStyle = COLORS.accentTint
  const h = r.h * Math.min(1, progress)
  ctx.fillRect(r.x, r.y + r.h - h, r.w, h)
  ctx.fillStyle = COLORS.accent
  ctx.fillRect(r.x, r.y + r.h - h, r.w, Math.max(3, radius * 0.08))
  ctx.restore()
}

// ---------------------------------------------------------------- text

export interface TextStyle {
  readonly size: number
  readonly weight?: number
  readonly color?: string
  readonly align?: CanvasTextAlign
  readonly baseline?: CanvasTextBaseline
  /** Dark outline so text stays readable over the live camera. */
  readonly outline?: boolean
}

export function drawText(ctx: CanvasRenderingContext2D, text: string, x: number, y: number, s: TextStyle): void {
  ctx.save()
  ctx.font = font(s.weight ?? 800, s.size)
  ctx.textAlign = s.align ?? 'left'
  ctx.textBaseline = s.baseline ?? 'alphabetic'
  if (s.outline) {
    ctx.lineJoin = 'round'
    ctx.lineWidth = s.size * 0.16
    ctx.strokeStyle = COLORS.shadow
    ctx.strokeText(text, x, y)
  }
  ctx.fillStyle = s.color ?? COLORS.text
  ctx.fillText(text, x, y)
  ctx.restore()
}

/** Shrinks the font until `text` fits `maxWidth`; returns the size used. */
export function fitTextSize(ctx: CanvasRenderingContext2D, text: string, size: number, maxWidth: number, weight = 800): number {
  ctx.save()
  ctx.font = font(weight, size)
  const width = ctx.measureText(text).width
  ctx.restore()
  return width <= maxWidth ? size : size * (maxWidth / width)
}
