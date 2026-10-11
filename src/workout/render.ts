import type { World } from '../game/physics'
import { t } from '../i18n'
import { clamp01, progressOf } from '../render/fx'
import { COLORS, TYPE, type Rect, drawText, drawTile, easeOutBack, easeOutCubic, fitTextSize } from '../render/theme'
import { EXERCISES, type ExerciseId } from './exercises'
import { type Block, type Routine, blockAt } from './routine'
import { type RepPop, POP_DURATION_MS, type WorkoutState, repsOf } from './state'

/** The session HUD bar covers roughly this fraction of the screen top. */
/** The DOM score chips reach ~11-12% of the height; keep the header card clear of them. */
const HUD_FRACTION = 0.14
const REST_TINT = 'rgba(244, 244, 245, 0.28)'
const SEGMENT_TRACK = 'rgba(244, 244, 245, 0.12)'
const COUNTER_BUMP_MS = 320

interface Layout {
  readonly side: number
  readonly card: Rect
  readonly pad: number
  readonly titleSize: number
  readonly subtitleSize: number
  readonly bar: Rect
}

export function layoutFor(world: World): Layout {
  const side = Math.min(world.width, world.height)
  const pad = side * 0.025
  const titleSize = side * TYPE.title
  const subtitleSize = side * TYPE.body
  const barH = Math.max(8, side * 0.016)
  const w = Math.min(world.width * 0.92, side * 1.3)
  const h = pad * 2 + titleSize * 1.15 + subtitleSize * 1.35 + side * 0.02 + barH
  const card: Rect = { x: (world.width - w) / 2, y: world.height * HUD_FRACTION + side * 0.02, w, h }
  const bar: Rect = { x: card.x + pad, y: card.y + h - pad - barH, w: w - pad * 2, h: barH }
  return { side, card, pad, titleSize, subtitleSize, bar }
}

/** Index (1-based) and total of exercise blocks, ignoring rests. */
export function exerciseStep(routine: Routine, blockIndex: number): { current: number; total: number } {
  const total = routine.filter((b) => b.kind === 'exercise').length
  const current = routine.slice(0, blockIndex + 1).filter((b) => b.kind === 'exercise').length
  return { current, total }
}

function blockTexts(block: Block): { title: string; subtitle: string } {
  if (block.kind === 'rest') {
    return { title: t('workout.rest'), subtitle: t('workout.next', { name: t(EXERCISES[block.nextExerciseId].nameKey) }) }
  }
  const exercise = EXERCISES[block.exerciseId]
  return { title: t(exercise.nameKey), subtitle: t(exercise.instructionKey) }
}

/** Segmented bar: one pill per routine block, width proportional to its duration. */
function drawSegments(ctx: CanvasRenderingContext2D, routine: Routine, elapsed: number, bar: Rect): void {
  const total = routine.reduce((sum, b) => sum + b.seconds, 0)
  const gap = bar.h * 0.7
  const usable = bar.w - gap * (routine.length - 1)
  let x = bar.x
  let start = 0
  for (const block of routine) {
    const w = (block.seconds / total) * usable
    const fill = clamp01((elapsed - start) / block.seconds)
    ctx.beginPath()
    ctx.roundRect(x, bar.y, w, bar.h, bar.h / 2)
    ctx.fillStyle = SEGMENT_TRACK
    ctx.fill()
    if (fill > 0) {
      ctx.save()
      ctx.beginPath()
      ctx.roundRect(x, bar.y, w, bar.h, bar.h / 2)
      ctx.clip()
      ctx.fillStyle = block.kind === 'rest' ? REST_TINT : COLORS.accent
      ctx.fillRect(x, bar.y, w * fill, bar.h)
      ctx.restore()
    }
    x += w + gap
    start += block.seconds
  }
}

function drawHeader(ctx: CanvasRenderingContext2D, state: WorkoutState, block: Block, layout: Layout): void {
  const { card, pad } = layout
  drawTile(ctx, card, { radius: layout.side * 0.035, lift: 0.4 })
  const { title, subtitle } = blockTexts(block)
  const inner = card.w - pad * 2
  const titleY = card.y + pad + layout.titleSize
  const titleSize = fitTextSize(ctx, title, layout.titleSize, inner * 0.7)
  drawText(ctx, title, card.x + pad, titleY, { size: titleSize, color: COLORS.text })
  if (block.kind === 'exercise') {
    const step = exerciseStep(state.routine, state.blockIndex)
    const label = t('workout.step', { current: String(step.current), total: String(step.total) })
    drawText(ctx, label, card.x + card.w - pad, titleY, { size: layout.subtitleSize, color: COLORS.accent, align: 'right' })
  }
  const subSize = fitTextSize(ctx, subtitle, layout.subtitleSize, inner, 600)
  drawText(ctx, subtitle, card.x + pad, titleY + layout.subtitleSize * 1.4, { size: subSize, weight: 600, color: COLORS.muted })
  drawSegments(ctx, state.routine, state.elapsed, layout.bar)
}

/** Full-width calm overlay with a big countdown while resting. */
function drawRestScreen(ctx: CanvasRenderingContext2D, remaining: number, world: World, layout: Layout): void {
  ctx.save()
  ctx.fillStyle = COLORS.backdrop
  ctx.fillRect(0, 0, world.width, world.height)
  ctx.restore()
  const cy = world.height * 0.55
  const beat = 1 + 0.06 * Math.max(0, 1 - (remaining % 1) * 3)
  ctx.save()
  ctx.translate(world.width / 2, cy)
  ctx.scale(beat, beat)
  drawText(ctx, String(Math.ceil(remaining)), 0, 0, {
    size: layout.side * TYPE.hero,
    color: COLORS.text,
    align: 'center',
    baseline: 'middle',
    outline: true,
  })
  ctx.restore()
}

function recentPop(pops: readonly RepPop[], playerId: number): RepPop | undefined {
  return pops.find((p) => p.playerId === playerId && p.ageMs < COUNTER_BUMP_MS)
}

function drawCounters(ctx: CanvasRenderingContext2D, state: WorkoutState, exerciseId: ExerciseId, layout: Layout): void {
  const size = layout.side * 0.11
  const minY = layout.card.y + layout.card.h + size * 0.8
  for (const badge of state.badges) {
    const y = Math.max(minY, badge.y - layout.side * 0.15)
    const pop = recentPop(state.pops, badge.playerId)
    const scale = pop ? 0.75 + 0.25 * easeOutBack(progressOf(pop.ageMs, COUNTER_BUMP_MS)) : 1
    ctx.save()
    ctx.translate(badge.x, y)
    ctx.scale(scale, scale)
    drawText(ctx, String(repsOf(state.reps, exerciseId, badge.playerId)), 0, 0, {
      size,
      color: badge.color,
      align: 'center',
      baseline: 'middle',
      outline: true,
    })
    ctx.restore()
  }
}

function drawPops(ctx: CanvasRenderingContext2D, state: WorkoutState, layout: Layout): void {
  const size = layout.side * 0.06
  for (const pop of state.pops) {
    const p = progressOf(pop.ageMs, POP_DURATION_MS)
    ctx.save()
    ctx.globalAlpha = p < 0.55 ? 1 : 1 - (p - 0.55) / 0.45
    ctx.translate(pop.x + layout.side * 0.1, pop.y - layout.side * (0.12 + 0.1 * easeOutCubic(p)))
    const scale = 0.4 + 0.6 * easeOutBack(Math.min(1, p * 3))
    ctx.scale(scale, scale)
    drawText(ctx, t('workout.plusOne'), 0, 0, { size, color: pop.color, align: 'center', baseline: 'middle', outline: true })
    ctx.restore()
  }
}

export function renderWorkout(ctx: CanvasRenderingContext2D, state: WorkoutState, world: World): void {
  const position = blockAt(state.routine, state.elapsed)
  if (!position) return
  const layout = layoutFor(world)
  if (position.block.kind === 'rest') drawRestScreen(ctx, position.remaining, world, layout)
  drawHeader(ctx, state, position.block, layout)
  if (position.block.kind !== 'exercise') return
  drawCounters(ctx, state, position.block.exerciseId, layout)
  drawPops(ctx, state, layout)
}
