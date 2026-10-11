/**
 * Intermediate screens: countdown (game card + popping number), the "go"
 * banner over the first moments of play, results, and the compact in-game
 * "Menú" corner tile.
 */
import { COUNTDOWN_MS, type Session } from '../app/session'
import { HOVER_SELECT_MS, type Hover, IN_GAME_HOLD_MS, PLAY_AGAIN, layoutGameOver, layoutInGameMenu } from '../app/zones'
import type { AnyMiniGame } from '../core/types'
import type { World } from '../game/physics'
import { t } from '../i18n'
import { iconForGame } from './icons'
import { COLORS, type Rect, TYPE, drawText, drawTile, easeOutBack, easeOutCubic, fitTextSize, unit } from './theme'
import { drawActionTile, drawIconBadge, drawPill, holdProgress, withPop } from './widgets'

const GO_MS = 750

/** Centered card with the game icon, title and description. Returns its rect. */
function drawGameCard(ctx: CanvasRenderingContext2D, game: AnyMiniGame, world: World, top: number, ageMs: number): Rect {
  const u = unit(world)
  const w = Math.min(world.width * 0.9, u * 1.15)
  const h = u * 0.2
  const card = { x: (world.width - w) / 2, y: top, w, h }
  withPop(ctx, card, ageMs, 0, () => {
    drawTile(ctx, card, { radius: h * 0.28 })
    const pad = h * 0.18
    const iconSize = h - pad * 2
    drawIconBadge(ctx, iconForGame(game.id), card.x + pad + iconSize / 2, card.y + h / 2, iconSize, 0)
    const textX = card.x + pad * 2 + iconSize
    const maxW = card.x + w - pad - textX
    const title = t(game.titleKey)
    const desc = t(game.descriptionKey)
    drawText(ctx, title, textX, card.y + h * 0.47, { size: fitTextSize(ctx, title, u * TYPE.title * 1.1, maxW) })
    const descSize = fitTextSize(ctx, desc, u * TYPE.body, maxW, 500)
    drawText(ctx, desc, textX, card.y + h * 0.76, { size: descSize, weight: 500, color: COLORS.muted })
  })
  return card
}

/** Huge number that pops on every second, ringed by the time left in that second. */
function drawBeat(ctx: CanvasRenderingContext2D, text: string, cx: number, cy: number, size: number, beat: number, ring: number): void {
  const scale = 0.55 + 0.45 * easeOutBack(beat / 0.32)
  const r = size * 0.78
  ctx.save()
  ctx.translate(cx, cy)
  ctx.beginPath()
  ctx.arc(0, 0, r, 0, Math.PI * 2)
  ctx.fillStyle = COLORS.tile
  ctx.fill()
  ctx.lineWidth = size * 0.05
  ctx.lineCap = 'round'
  ctx.beginPath()
  ctx.arc(0, 0, r, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * ring)
  ctx.strokeStyle = COLORS.accent
  ctx.stroke()
  ctx.scale(scale, scale)
  drawText(ctx, text, 0, size * 0.04, { size, weight: 800, align: 'center', baseline: 'middle' })
  ctx.restore()
}

export function renderCountdown(
  ctx: CanvasRenderingContext2D,
  session: Session,
  games: readonly AnyMiniGame[],
  world: World,
  ageMs: number,
): void {
  if (session.screen.kind !== 'countdown') return
  const u = unit(world)
  const card = drawGameCard(ctx, games[session.screen.gameIndex], world, world.height * 0.16, ageMs)
  const msLeft = Math.max(0, session.screen.msLeft)
  const elapsedInSecond = (COUNTDOWN_MS - msLeft) % 1000
  const remainingInSecond = 1 - elapsedInSecond / 1000
  const size = u * TYPE.hero * 1.5
  const cy = card.y + card.h + (world.height - card.y - card.h) * 0.36
  drawBeat(ctx, String(Math.max(1, Math.ceil(msLeft / 1000))), world.width / 2, cy, size, elapsedInSecond / 1000, remainingInSecond)
}

/** "¡Ya!" pops over the first moments of play, then fades out. */
export function renderGoBanner(ctx: CanvasRenderingContext2D, world: World, ageMs: number): void {
  if (ageMs >= GO_MS) return
  const u = unit(world)
  const p = ageMs / GO_MS
  const size = u * TYPE.hero * 1.4
  ctx.save()
  ctx.globalAlpha = 1 - easeOutCubic((p - 0.55) / 0.45)
  ctx.translate(world.width / 2, world.height * 0.45)
  const scale = 0.5 + 0.5 * easeOutBack(p / 0.4)
  ctx.scale(scale, scale)
  drawText(ctx, t('countdown.go'), 0, 0, { size, color: COLORS.accent, align: 'center', baseline: 'middle', outline: true })
  ctx.restore()
}

function drawScorePanel(ctx: CanvasRenderingContext2D, session: Session, games: readonly AnyMiniGame[], world: World, ageMs: number): void {
  if (session.screen.kind !== 'gameOver') return
  const { score, newBest, gameIndex } = session.screen
  const u = unit(world)
  const w = Math.min(world.width * 0.9, u * 0.95)
  const h = u * 0.46
  const panel = { x: (world.width - w) / 2, y: world.height * 0.4, w, h }
  const cx = world.width / 2
  withPop(ctx, panel, ageMs, 120, () => {
    drawTile(ctx, panel, { radius: u * 0.05, lift: 1 })
    drawText(ctx, t('results.score').toUpperCase(), cx, panel.y + h * 0.17, { size: u * TYPE.caption * 1.2, weight: 700, color: COLORS.muted, align: 'center' })
    const shown = Math.round(score * easeOutCubic((ageMs - 250) / 900))
    drawText(ctx, String(shown), cx, panel.y + h * 0.56, { size: u * TYPE.hero * 1.3, align: 'center', baseline: 'middle' })
    const best = session.bests[games[gameIndex].id] ?? 0
    const label = newBest ? t('messages.newBest') : t('results.best', { score: best })
    const pillStyle = newBest
      ? { size: u * TYPE.body, fill: COLORS.accent, color: COLORS.onAccent, align: 'center' as const }
      : { size: u * TYPE.body, fill: COLORS.edge, color: COLORS.muted, align: 'center' as const }
    drawPill(ctx, label, cx, panel.y + h * 0.86, pillStyle)
  })
}

export function renderGameOver(ctx: CanvasRenderingContext2D, session: Session, games: readonly AnyMiniGame[], world: World, ageMs: number): void {
  if (session.screen.kind !== 'gameOver') return
  const { hover, focus } = session.screen
  layoutGameOver(world).forEach((zone, i) => {
    const again = zone.id === PLAY_AGAIN
    withPop(ctx, zone, ageMs, 280 + i * 80, () =>
      drawActionTile(ctx, {
        zone,
        icon: again ? 'replay' : 'home',
        label: again ? t('actions.playAgain') : t('actions.menu'),
        progress: holdProgress(hover, zone, HOVER_SELECT_MS),
        focused: focus === i,
        layout: 'stack',
      }),
    )
  })
  drawScorePanel(ctx, session, games, world, ageMs)
}

/** Compact corner tile; translucent until a hand starts holding it. */
export function renderInGameMenuButton(ctx: CanvasRenderingContext2D, hover: Hover | null, world: World): void {
  layoutInGameMenu(world).forEach((zone) => {
    const progress = holdProgress(hover, zone, IN_GAME_HOLD_MS)
    ctx.save()
    ctx.globalAlpha = progress > 0 ? 1 : 0.78
    drawActionTile(ctx, { zone, icon: 'home', label: t('actions.menu'), progress, focused: false, layout: 'row' })
    ctx.restore()
  })
}
