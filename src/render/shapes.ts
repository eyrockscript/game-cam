/** Small canvas drawing helpers shared by all mini-games. */

/** Must match the self-hosted @fontsource-variable/outfit family name. */
export const CANVAS_FONT = "'Outfit Variable', Outfit, system-ui, sans-serif"

export const PALETTE = {
  ink: '#0f1115',
  paper: '#f4f4f5',
  muted: '#a1a1aa',
  orange: '#ff7a1a',
  orangeLight: '#ffd2a8',
  orangeDark: '#c2410c',
  teal: '#5eead4',
  red: '#ef4444',
  stone: '#78716c',
} as const

export function drawBall(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  r: number,
  colors: readonly [light: string, mid: string, dark: string] = [PALETTE.orangeLight, PALETTE.orange, PALETTE.orangeDark],
): void {
  const gradient = ctx.createRadialGradient(x - r * 0.35, y - r * 0.35, r * 0.1, x, y, r)
  gradient.addColorStop(0, colors[0])
  gradient.addColorStop(0.45, colors[1])
  gradient.addColorStop(1, colors[2])
  ctx.save()
  ctx.shadowColor = 'rgba(0, 0, 0, 0.35)'
  ctx.shadowBlur = r * 0.6
  ctx.shadowOffsetY = r * 0.25
  ctx.fillStyle = gradient
  ctx.beginPath()
  ctx.arc(x, y, r, 0, Math.PI * 2)
  ctx.fill()
  ctx.restore()
}

export function roundedRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number): void {
  ctx.beginPath()
  ctx.roundRect(x, y, w, h, r)
}

export function drawLabel(
  ctx: CanvasRenderingContext2D,
  text: string,
  x: number,
  y: number,
  size: number,
  color: string = PALETTE.paper,
  weight = 800,
): void {
  ctx.save()
  ctx.font = `${weight} ${size}px ${CANVAS_FONT}`
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.fillStyle = color
  ctx.fillText(text, x, y)
  ctx.restore()
}
