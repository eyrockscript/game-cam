/**
 * Flat vector icons drawn with canvas paths (no emoji, no bitmap).
 * Each icon fits a box of `size` centered at (cx, cy), stroke weight ~ size/12.
 */
import { COLORS } from './theme'

export type IconId = 'ball' | 'bubbles' | 'blade' | 'rock' | 'workout' | 'home' | 'replay' | 'snowflake' | 'pose'

type IconPainter = (ctx: CanvasRenderingContext2D, s: number, color: string) => void

function circle(ctx: CanvasRenderingContext2D, x: number, y: number, r: number): void {
  ctx.beginPath()
  ctx.arc(x, y, r, 0, Math.PI * 2)
}

const PAINTERS: Readonly<Record<IconId, IconPainter>> = {
  ball: (ctx, s, color) => {
    circle(ctx, 0, -s * 0.08, s * 0.3)
    ctx.fillStyle = color
    ctx.fill()
    ctx.beginPath()
    ctx.ellipse(0, s * 0.4, s * 0.26, s * 0.05, 0, 0, Math.PI * 2)
    ctx.fillStyle = 'rgba(0,0,0,0.35)'
    ctx.fill()
  },
  bubbles: (ctx, s, color) => {
    for (const [x, y, r] of [
      [-0.12, 0.08, 0.26],
      [0.24, -0.2, 0.15],
      [0.28, 0.26, 0.09],
    ] as const) {
      circle(ctx, x * s, y * s, r * s)
      ctx.stroke()
      circle(ctx, (x - r * 0.35) * s, (y - r * 0.35) * s, r * s * 0.18)
      ctx.fillStyle = color
      ctx.fill()
    }
  },
  blade: (ctx, s) => {
    ctx.beginPath()
    ctx.moveTo(-s * 0.36, s * 0.34)
    ctx.quadraticCurveTo(-s * 0.05, -s * 0.05, s * 0.38, -s * 0.36)
    ctx.stroke()
    ctx.beginPath()
    ctx.moveTo(-s * 0.18, s * 0.38)
    ctx.quadraticCurveTo(s * 0.08, s * 0.1, s * 0.3, -s * 0.12)
    ctx.globalAlpha = 0.5
    ctx.stroke()
    ctx.globalAlpha = 1
  },
  rock: (ctx, s, color) => {
    ctx.beginPath()
    ctx.moveTo(-s * 0.3, s * 0.1)
    ctx.lineTo(-s * 0.12, -s * 0.28)
    ctx.lineTo(s * 0.22, -s * 0.22)
    ctx.lineTo(s * 0.34, s * 0.12)
    ctx.lineTo(s * 0.04, s * 0.32)
    ctx.closePath()
    ctx.fillStyle = color
    ctx.fill()
    for (const x of [-0.24, 0, 0.24]) {
      ctx.beginPath()
      ctx.moveTo(x * s, -s * 0.46)
      ctx.lineTo(x * s, -s * 0.38)
      ctx.stroke()
    }
  },
  workout: (ctx, s, color) => {
    ctx.beginPath()
    ctx.moveTo(-s * 0.22, 0)
    ctx.lineTo(s * 0.22, 0)
    ctx.stroke()
    ctx.fillStyle = color
    for (const side of [-1, 1]) {
      ctx.beginPath()
      ctx.roundRect(side * s * 0.3 - s * 0.07, -s * 0.22, s * 0.14, s * 0.44, s * 0.04)
      ctx.fill()
      ctx.beginPath()
      ctx.roundRect(side * s * 0.42 - s * 0.04, -s * 0.13, s * 0.08, s * 0.26, s * 0.03)
      ctx.fill()
    }
  },
  home: (ctx, s) => {
    ctx.beginPath()
    ctx.moveTo(-s * 0.34, -s * 0.02)
    ctx.lineTo(0, -s * 0.34)
    ctx.lineTo(s * 0.34, -s * 0.02)
    ctx.moveTo(-s * 0.24, -s * 0.1)
    ctx.lineTo(-s * 0.24, s * 0.32)
    ctx.lineTo(s * 0.24, s * 0.32)
    ctx.lineTo(s * 0.24, -s * 0.1)
    ctx.stroke()
  },
  replay: (ctx, s) => {
    ctx.beginPath()
    ctx.arc(0, 0, s * 0.3, -Math.PI * 0.35, Math.PI * 1.45)
    ctx.stroke()
    ctx.beginPath()
    ctx.moveTo(s * 0.26, -s * 0.36)
    ctx.lineTo(s * 0.2, -s * 0.15)
    ctx.lineTo(s * 0.4, -s * 0.12)
    ctx.stroke()
  },
  snowflake: (ctx, s) => {
    for (let i = 0; i < 3; i += 1) {
      ctx.save()
      ctx.rotate((i * Math.PI) / 3)
      ctx.beginPath()
      ctx.moveTo(0, -s * 0.38)
      ctx.lineTo(0, s * 0.38)
      for (const end of [-1, 1]) {
        ctx.moveTo(0, end * s * 0.24)
        ctx.lineTo(-s * 0.1, end * s * 0.34)
        ctx.moveTo(0, end * s * 0.24)
        ctx.lineTo(s * 0.1, end * s * 0.34)
      }
      ctx.stroke()
      ctx.restore()
    }
  },
  pose: (ctx, s, color) => {
    circle(ctx, 0, -s * 0.28, s * 0.09)
    ctx.fillStyle = color
    ctx.fill()
    ctx.beginPath()
    ctx.moveTo(0, -s * 0.16)
    ctx.lineTo(0, s * 0.14)
    ctx.moveTo(-s * 0.36, -s * 0.38)
    ctx.lineTo(-s * 0.18, -s * 0.08)
    ctx.lineTo(s * 0.18, -s * 0.08)
    ctx.lineTo(s * 0.36, -s * 0.38)
    ctx.moveTo(0, s * 0.14)
    ctx.lineTo(-s * 0.16, s * 0.4)
    ctx.moveTo(0, s * 0.14)
    ctx.lineTo(s * 0.16, s * 0.4)
    ctx.stroke()
  },
}

export function drawIcon(
  ctx: CanvasRenderingContext2D,
  id: IconId,
  cx: number,
  cy: number,
  size: number,
  color: string = COLORS.text,
): void {
  ctx.save()
  ctx.translate(cx, cy)
  ctx.lineWidth = Math.max(2, size / 12)
  ctx.lineCap = 'round'
  ctx.lineJoin = 'round'
  ctx.strokeStyle = color
  PAINTERS[id](ctx, size, color)
  ctx.restore()
}

/** Menu icon per game id (unknown games fall back to the ball). */
export function iconForGame(gameId: string): IconId {
  const byGame: Readonly<Record<string, IconId>> = {
    keepUp: 'ball',
    bubbles: 'bubbles',
    ninja: 'blade',
    dodge: 'rock',
    workout: 'workout',
    statues: 'snowflake',
    copyPose: 'pose',
  }
  return byGame[gameId] ?? 'ball'
}
