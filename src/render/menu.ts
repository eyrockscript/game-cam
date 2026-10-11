/**
 * Game picker: bento tiles from layoutMenu. Each tile shows the game icon,
 * title, a one-line description and the personal best. Tiles pop in with a
 * stagger when the menu opens; the featured tile's icon floats gently.
 */
import type { Session } from '../app/session'
import { HOVER_SELECT_MS, type Zone, layoutMenu } from '../app/zones'
import type { AnyMiniGame } from '../core/types'
import type { World } from '../game/physics'
import { t } from '../i18n'
import { iconForGame } from './icons'
import { COLORS, TYPE, drawHoldFill, drawText, drawTile, easeOutCubic, fitTextSize, pulse, unit } from './theme'
import { drawIconBadge, drawPill, holdProgress, withPop, wrapLines } from './widgets'

const STAGGER_MS = 70

interface MenuTile {
  readonly zone: Zone
  readonly game: AnyMiniGame
  readonly best: number
  readonly featured: boolean
  readonly progress: number
  readonly focused: boolean
}

/** Compact tiles put a large icon on the right so it still reads from the couch. */
function compactIconSize(zone: Zone): number {
  return Math.min(zone.h * 0.46, zone.w * 0.26)
}

function drawTileText(ctx: CanvasRenderingContext2D, tile: MenuTile, u: number, pad: number): number {
  const { zone, featured } = tile
  const maxW = zone.w - pad * 2 - (featured ? 0 : compactIconSize(zone) + pad * 0.5)
  const descSize = Math.min(u * (featured ? TYPE.body : TYPE.caption * 1.1), zone.h * 0.11)
  const lines = wrapLines(ctx, t(tile.game.descriptionKey), descSize, maxW, 2)
  const lineH = descSize * 1.3
  const lastBaseline = zone.y + zone.h - pad * 0.95
  lines.forEach((line, i) => {
    const y = lastBaseline - (lines.length - 1 - i) * lineH
    drawText(ctx, line, zone.x + pad, y, { size: descSize, weight: 500, color: COLORS.muted })
  })
  const title = t(tile.game.titleKey)
  const baseTitle = Math.min(u * (featured ? TYPE.display : TYPE.title), zone.h * (featured ? 0.2 : 0.22))
  const titleSize = fitTextSize(ctx, title, baseTitle, maxW)
  const titleBaseline = lastBaseline - lines.length * lineH - descSize * 0.35
  drawText(ctx, title, zone.x + pad, titleBaseline, { size: titleSize })
  return titleBaseline - titleSize
}

function drawMenuTile(ctx: CanvasRenderingContext2D, tile: MenuTile, u: number, now: number): void {
  const { zone, featured, progress } = tile
  const s = Math.min(zone.w, zone.h)
  const radius = Math.min(u * 0.04, s * 0.16)
  const pad = s * (featured ? 0.11 : 0.12)
  drawTile(ctx, zone, { radius, lift: progress > 0 ? 1 : 0, focused: tile.focused })
  drawHoldFill(ctx, zone, radius, progress)

  const textTop = drawTileText(ctx, tile, u, pad)
  const icon = iconForGame(tile.game.id)
  if (featured) {
    const room = textTop - zone.y - pad * 1.25
    const iconSize = Math.max(s * 0.14, Math.min(s * 0.42, room))
    const float = (pulse(now, 2400) - 0.5) * s * 0.035
    drawIconBadge(ctx, icon, zone.x + pad + iconSize / 2, zone.y + pad + iconSize / 2 + float, iconSize, progress)
  } else {
    const iconSize = compactIconSize(zone)
    drawIconBadge(ctx, icon, zone.x + zone.w - pad - iconSize / 2, zone.y + zone.h * 0.58, iconSize, progress)
  }

  if (tile.best > 0) {
    const size = Math.min(u * TYPE.caption, s * 0.075)
    drawPill(ctx, t('menu.best', { score: tile.best }), zone.x + zone.w - pad * 0.8, zone.y + pad * 0.8 + size, {
      size,
      fill: COLORS.edge,
      color: COLORS.text,
      align: 'right',
    })
  }
}

/** Hovered tile grows slightly so the selection reads from across the room. */
function withHoverScale(ctx: CanvasRenderingContext2D, zone: Zone, progress: number, draw: () => void): void {
  const scale = 1 + 0.035 * easeOutCubic(progress * 3)
  const cx = zone.x + zone.w / 2
  const cy = zone.y + zone.h / 2
  ctx.save()
  ctx.translate(cx, cy)
  ctx.scale(scale, scale)
  ctx.translate(-cx, -cy)
  draw()
  ctx.restore()
}

function drawHint(ctx: CanvasRenderingContext2D, zones: readonly Zone[], world: World, ageMs: number): void {
  const u = unit(world)
  const bottom = Math.max(...zones.map((z) => z.y + z.h))
  const size = fitTextSize(ctx, t('menu.pick'), u * TYPE.body * 1.1, world.width * 0.8, 700)
  ctx.save()
  ctx.globalAlpha = easeOutCubic((ageMs - 300) / 500)
  drawPill(ctx, t('menu.pick'), world.width / 2, bottom + u * 0.07, { size, fill: COLORS.tile, color: COLORS.text, align: 'center' })
  ctx.restore()
}

export function renderMenu(
  ctx: CanvasRenderingContext2D,
  session: Session,
  games: readonly AnyMiniGame[],
  world: World,
  now: number,
  ageMs: number,
): void {
  if (session.screen.kind !== 'menu') return
  const u = unit(world)
  const { hover, focus } = session.screen
  const zones = layoutMenu(world, games.map((g) => g.id))
  zones.forEach((zone, i) => {
    const game = games[i]
    const progress = holdProgress(hover, zone, HOVER_SELECT_MS)
    const tile: MenuTile = { zone, game, best: session.bests[game.id] ?? 0, featured: i === 0, progress, focused: focus === i }
    withPop(ctx, zone, ageMs, i * STAGGER_MS, () => withHoverScale(ctx, zone, progress, () => drawMenuTile(ctx, tile, u, now)))
  })
  if (zones.length > 0) drawHint(ctx, zones, world, ageMs)
}
