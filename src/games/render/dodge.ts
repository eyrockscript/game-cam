import type { World } from '../../game/physics'
import { clamp01, drawGroundShadow } from '../../render/fx'
import { COLORS, pulse, unit } from '../../render/theme'
import type { Debris, DodgeState, Rock, Warning } from '../dodge'

export const WARNING_SECONDS = 0.6
export const INVULNERABLE_SECONDS = 1
export const DEBRIS_SECONDS = 0.7

/** Stone tones from lit to shadowed (desaturated, warm gray). */
const SHADES: readonly string[] = ['#b9b2a8', '#a09a91', '#868078', '#6c675f', '#524e48']
const ROCK_OUTLINE = 'rgba(20, 19, 17, 0.7)'
/** Light comes from the top-left of the screen. */
const LIGHT_ANGLE = -2.3

function shadeFor(angle: number): string {
  const lit = (Math.cos(angle - LIGHT_ANGLE) + 1) / 2
  return SHADES[Math.min(SHADES.length - 1, Math.floor((1 - lit) * SHADES.length))]
}

function drawRock(ctx: CanvasRenderingContext2D, rock: Rock): void {
  const n = rock.shape.length
  const cx = rock.x - rock.r * 0.08
  const cy = rock.y - rock.r * 0.1
  const px: number[] = []
  const py: number[] = []
  for (let i = 0; i < n; i += 1) {
    const a = rock.angle + (i / n) * Math.PI * 2
    px.push(rock.x + Math.cos(a) * rock.r * rock.shape[i])
    py.push(rock.y + Math.sin(a) * rock.r * rock.shape[i])
  }
  ctx.lineJoin = 'round'
  ctx.lineWidth = 1.5
  for (let i = 0; i < n; i += 1) {
    const j = (i + 1) % n
    const mid = rock.angle + ((i + 0.5) / n) * Math.PI * 2
    ctx.fillStyle = shadeFor(mid)
    ctx.strokeStyle = ctx.fillStyle
    ctx.beginPath()
    ctx.moveTo(cx, cy)
    ctx.lineTo(px[i], py[i])
    ctx.lineTo(px[j], py[j])
    ctx.closePath()
    ctx.fill()
    ctx.stroke()
  }
  ctx.lineWidth = Math.max(2, rock.r * 0.07)
  ctx.strokeStyle = ROCK_OUTLINE
  ctx.beginPath()
  px.forEach((x, i) => (i === 0 ? ctx.moveTo(x, py[i]) : ctx.lineTo(x, py[i])))
  ctx.closePath()
  ctx.stroke()
}

function drawWarning(ctx: CanvasRenderingContext2D, w: Warning, world: World, now: number): void {
  const side = unit(world)
  const beat = pulse(now, 280)
  const size = Math.max(12, w.rock.r * 0.6) * (0.9 + 0.2 * beat)
  const x = w.rock.x
  ctx.save()
  ctx.setLineDash([side * 0.02, side * 0.025])
  ctx.lineWidth = Math.max(2, side * 0.004)
  ctx.strokeStyle = COLORS.accent
  ctx.globalAlpha = 0.25 + 0.2 * beat
  ctx.beginPath()
  ctx.moveTo(x, size * 2.2)
  ctx.lineTo(x, world.height)
  ctx.stroke()
  ctx.restore()

  ctx.save()
  ctx.lineJoin = 'round'
  ctx.lineWidth = Math.max(3, size * 0.22)
  ctx.strokeStyle = 'rgba(20, 19, 17, 0.85)'
  ctx.fillStyle = COLORS.accent
  ctx.beginPath()
  ctx.moveTo(x - size, 4)
  ctx.lineTo(x + size, 4)
  ctx.lineTo(x, 4 + size * 1.45)
  ctx.closePath()
  ctx.stroke()
  ctx.fill()
  ctx.restore()
}

function drawDebris(ctx: CanvasRenderingContext2D, d: Debris): void {
  ctx.save()
  ctx.globalAlpha = clamp01(d.life / DEBRIS_SECONDS)
  ctx.translate(d.x, d.y)
  ctx.rotate(d.life * 9 + d.x * 0.05)
  ctx.fillStyle = SHADES[2]
  ctx.fillRect(-d.size / 2, -d.size / 2, d.size, d.size)
  ctx.fillStyle = SHADES[0]
  ctx.fillRect(-d.size / 2, -d.size / 2, d.size, d.size * 0.4)
  ctx.restore()
}

function drawVignette(ctx: CanvasRenderingContext2D, world: World, left: number, now: number): void {
  const strength = clamp01(left / INVULNERABLE_SECONDS) * (0.55 + 0.45 * pulse(now, 360))
  const reach = Math.hypot(world.width, world.height) / 2
  const g = ctx.createRadialGradient(world.width / 2, world.height / 2, reach * 0.55, world.width / 2, world.height / 2, reach)
  g.addColorStop(0, 'rgba(239, 68, 68, 0)')
  g.addColorStop(1, `rgba(239, 68, 68, ${(0.5 * strength).toFixed(3)})`)
  ctx.save()
  ctx.fillStyle = g
  ctx.fillRect(0, 0, world.width, world.height)
  ctx.restore()
}

export function renderDodge(ctx: CanvasRenderingContext2D, state: DodgeState, world: World): void {
  const now = performance.now()
  ctx.save()
  state.warnings.forEach((w) => drawWarning(ctx, w, world, now))
  state.rocks.forEach((rock) => drawGroundShadow(ctx, rock.x + rock.r * 0.18, rock.y + rock.r * 0.28, rock.r * 0.95, rock.r * 0.9, 0.18))
  state.rocks.forEach((rock) => drawRock(ctx, rock))
  state.debris.forEach((d) => drawDebris(ctx, d))
  if (state.invulnerable > 0) drawVignette(ctx, world, state.invulnerable, now)
  ctx.restore()
}
