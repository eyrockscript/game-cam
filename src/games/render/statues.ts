import type { World } from '../../game/physics'
import { t } from '../../i18n'
import { COLORS, TYPE, drawText, easeOutBack, unit } from '../../render/theme'
import { drawHoldRing, drawPill } from '../../render/widgets'
import type { StatuesState } from '../statues'

/** Below the DOM score chips. */
const BANNER_Y = 0.24
const FROZEN_TINT = 'rgba(125, 211, 252, 0.10)'

function bannerText(state: StatuesState): string {
  if (state.phase === 'dance') return t('statues.dance')
  if (state.phase === 'freeze') return t('statues.freeze')
  return t(state.caught ? 'statues.caught' : 'statues.safe')
}

function drawBanner(ctx: CanvasRenderingContext2D, state: StatuesState, world: World): void {
  const u = unit(world)
  const pop = easeOutBack(Math.min(1, state.phaseElapsed * 4))
  const color = state.phase === 'result' && state.caught ? COLORS.danger : state.phase === 'dance' ? COLORS.accent : COLORS.text
  ctx.save()
  ctx.translate(world.width / 2, world.height * BANNER_Y)
  ctx.scale(pop, pop)
  drawText(ctx, bannerText(state), 0, 0, { size: u * TYPE.display, color, align: 'center', baseline: 'middle', outline: true })
  ctx.restore()
}

/** Countdown ring around the banner while frozen. */
function drawFreezeTimer(ctx: CanvasRenderingContext2D, state: StatuesState, world: World): void {
  const u = unit(world)
  const progress = Math.max(0, state.phaseLeft) / Math.max(0.001, state.freezeSeconds)
  drawHoldRing(ctx, world.width / 2, world.height * (BANNER_Y + 0.13), u * 0.045, progress, u * 0.012)
}

export function renderStatues(ctx: CanvasRenderingContext2D, state: StatuesState, world: World): void {
  if (state.phase !== 'dance') {
    ctx.save()
    ctx.fillStyle = FROZEN_TINT
    ctx.fillRect(0, 0, world.width, world.height)
    ctx.restore()
  }
  drawBanner(ctx, state, world)
  if (state.phase === 'freeze') drawFreezeTimer(ctx, state, world)
  const u = unit(world)
  for (const label of state.labels) {
    drawPill(ctx, t('statues.moved'), label.x, label.y - u * 0.12, {
      size: u * TYPE.body,
      fill: label.color,
      color: COLORS.onAccent,
      align: 'center',
    })
  }
}
