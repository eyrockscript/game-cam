/**
 * Reusable canvas widgets built on the theme: pills, hold rings, wrapped text,
 * pop-in transforms and the icon + label action tile used by results and the
 * in-game corner button.
 */
import type { Hover, Zone } from '../app/zones'
import { type IconId, drawIcon } from './icons'
import { COLORS, type Rect, drawHoldFill, drawText, drawTile, easeOutBack, easeOutCubic, font, fitTextSize } from './theme'

/** 0..1 hold progress of `zone` for the current hover. */
export function holdProgress(hover: Hover | null, zone: Zone, holdMs: number): number {
  return hover?.zoneId === zone.id ? Math.min(1, hover.ms / holdMs) : 0
}

/** Greedy word wrap; the last allowed line is ellipsized if text overflows. */
export function wrapLines(
  ctx: CanvasRenderingContext2D,
  text: string,
  size: number,
  maxWidth: number,
  maxLines: number,
  weight = 500,
): string[] {
  ctx.save()
  ctx.font = font(weight, size)
  const fits = (s: string): boolean => ctx.measureText(s).width <= maxWidth
  const lines = text.split(' ').reduce<string[]>((acc, word) => {
    const last = acc[acc.length - 1]
    return last !== undefined && fits(`${last} ${word}`) ? [...acc.slice(0, -1), `${last} ${word}`] : [...acc, word]
  }, [])
  const kept = lines.slice(0, maxLines)
  if (lines.length > maxLines) kept[maxLines - 1] = ellipsize(kept[maxLines - 1], fits)
  ctx.restore()
  return kept
}

function ellipsize(line: string, fits: (s: string) => boolean): string {
  let words = line.split(' ')
  while (words.length > 1 && !fits(`${words.join(' ')}...`)) words = words.slice(0, -1)
  return `${words.join(' ')}...`
}

export interface PillStyle {
  readonly size: number
  readonly fill: string
  readonly color: string
  readonly align?: 'left' | 'center' | 'right'
}

/** Rounded label chip; (x, y) is the anchor edge per `align`, y is the vertical center. Returns its rect. */
export function drawPill(ctx: CanvasRenderingContext2D, text: string, x: number, y: number, s: PillStyle): Rect {
  ctx.save()
  ctx.font = font(700, s.size)
  const w = ctx.measureText(text).width + s.size * 1.4
  ctx.restore()
  const h = s.size * 1.9
  const left = s.align === 'right' ? x - w : s.align === 'center' ? x - w / 2 : x
  const rect = { x: left, y: y - h / 2, w, h }
  ctx.save()
  ctx.beginPath()
  ctx.roundRect(rect.x, rect.y, rect.w, rect.h, h / 2)
  ctx.fillStyle = s.fill
  ctx.fill()
  ctx.restore()
  drawText(ctx, text, left + w / 2, y, { size: s.size, weight: 700, color: s.color, align: 'center', baseline: 'middle' })
  return rect
}

/** Circular countdown ring (track + accent arc from 12 o'clock). */
export function drawHoldRing(ctx: CanvasRenderingContext2D, cx: number, cy: number, r: number, progress: number, width: number): void {
  if (progress <= 0) return
  ctx.save()
  ctx.lineWidth = width
  ctx.lineCap = 'round'
  ctx.beginPath()
  ctx.arc(cx, cy, r, 0, Math.PI * 2)
  ctx.strokeStyle = COLORS.edgeHighlight
  ctx.stroke()
  ctx.beginPath()
  ctx.arc(cx, cy, r, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * Math.min(1, progress))
  ctx.strokeStyle = COLORS.accent
  ctx.stroke()
  ctx.restore()
}

/** Icon badge: soft disc behind an icon, with the hold ring wrapped around it. */
export function drawIconBadge(
  ctx: CanvasRenderingContext2D,
  icon: IconId,
  cx: number,
  cy: number,
  size: number,
  progress: number,
  color: string = COLORS.accent,
): void {
  ctx.save()
  ctx.beginPath()
  ctx.arc(cx, cy, size / 2, 0, Math.PI * 2)
  ctx.fillStyle = progress > 0 ? COLORS.accentTint : COLORS.edge
  ctx.fill()
  ctx.restore()
  drawIcon(ctx, icon, cx, cy, size * 0.68, color)
  drawHoldRing(ctx, cx, cy, size / 2 + size * 0.07, progress, Math.max(3, size * 0.06))
}

/**
 * Runs `draw` scaled around the rect center by an easeOutBack pop that starts
 * after `delayMs` of `ageMs`. Opacity eases in alongside.
 */
export function withPop(ctx: CanvasRenderingContext2D, r: Rect, ageMs: number, delayMs: number, draw: () => void): void {
  const t = (ageMs - delayMs) / 420
  if (t <= 0) return
  const scale = 0.82 + 0.18 * easeOutBack(t)
  const cx = r.x + r.w / 2
  const cy = r.y + r.h / 2
  ctx.save()
  ctx.globalAlpha *= easeOutCubic(t * 1.6)
  ctx.translate(cx, cy)
  ctx.scale(scale, scale)
  ctx.translate(-cx, -cy)
  draw()
  ctx.restore()
}

export interface ActionTileSpec {
  readonly zone: Zone
  readonly icon: IconId
  readonly label: string
  readonly progress: number
  readonly focused: boolean
  /** 'stack' = icon above label (big tiles); 'row' = icon left of label (compact). */
  readonly layout: 'stack' | 'row'
}

/** Icon + label tile with hand-hold fill and ring; used by results and the in-game button. */
export function drawActionTile(ctx: CanvasRenderingContext2D, spec: ActionTileSpec): void {
  const { zone, progress } = spec
  const s = Math.min(zone.w, zone.h)
  const radius = Math.min(s * 0.28, Math.max(zone.w, zone.h) * 0.12)
  drawTile(ctx, zone, { radius, lift: progress > 0 ? 1 : 0, focused: spec.focused })
  drawHoldFill(ctx, zone, radius, progress)
  if (spec.layout === 'stack') {
    const iconSize = s * 0.36
    const cx = zone.x + zone.w / 2
    drawIconBadge(ctx, spec.icon, cx, zone.y + zone.h * 0.4, iconSize, progress)
    const size = fitTextSize(ctx, spec.label, s * 0.15, zone.w * 0.84)
    drawText(ctx, spec.label, cx, zone.y + zone.h * 0.4 + iconSize * 0.62 + size * 1.1, { size, align: 'center' })
    return
  }
  const iconSize = zone.h * 0.56
  const iconX = zone.x + zone.h * 0.5
  drawIconBadge(ctx, spec.icon, iconX, zone.y + zone.h / 2, iconSize, progress, COLORS.text)
  const textX = iconX + iconSize * 0.5 + zone.h * 0.18
  const size = fitTextSize(ctx, spec.label, zone.h * 0.34, zone.x + zone.w - textX - zone.h * 0.2)
  drawText(ctx, spec.label, textX, zone.y + zone.h / 2, { size, baseline: 'middle' })
}
