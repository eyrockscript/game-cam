/**
 * Small, allocation-light drawing helpers shared by the in-game renderers
 * (balls, shadows, rings, sparkles). No glows: depth comes from flat ellipses
 * and cached radial gradients drawn at the origin.
 */

export type SphereColors = readonly [light: string, mid: string, dark: string]

export function clamp01(v: number): number {
  return Math.min(1, Math.max(0, v))
}

export function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t
}

/** Progress 0..1 of an effect that started `ageMs` ago and lasts `durationMs`. */
export function progressOf(ageMs: number, durationMs: number): number {
  return durationMs <= 0 ? 1 : clamp01(ageMs / durationMs)
}

const GRADIENT_CACHE_LIMIT = 64
const sphereCache = new Map<string, CanvasGradient>()

/** Radial "lit from the top-left" gradient centred on the origin, cached by radius and colors. */
function sphereGradient(ctx: CanvasRenderingContext2D, r: number, colors: SphereColors): CanvasGradient {
  const key = `${Math.round(r)}|${colors[0]}|${colors[1]}|${colors[2]}`
  const cached = sphereCache.get(key)
  if (cached) return cached
  if (sphereCache.size >= GRADIENT_CACHE_LIMIT) sphereCache.clear()
  const g = ctx.createRadialGradient(-r * 0.35, -r * 0.4, r * 0.1, 0, 0, r)
  g.addColorStop(0, colors[0])
  g.addColorStop(0.5, colors[1])
  g.addColorStop(1, colors[2])
  sphereCache.set(key, g)
  return g
}

/** Soft-shaded sphere at (x, y). No shadowBlur; pair with `drawGroundShadow` for depth. */
export function drawSphere(ctx: CanvasRenderingContext2D, x: number, y: number, r: number, colors: SphereColors): void {
  ctx.save()
  ctx.translate(x, y)
  ctx.fillStyle = sphereGradient(ctx, r, colors)
  ctx.beginPath()
  ctx.arc(0, 0, r, 0, Math.PI * 2)
  ctx.fill()
  ctx.restore()
}

/** Small specular highlight on the upper-left of a sphere. */
export function drawSpecular(ctx: CanvasRenderingContext2D, x: number, y: number, r: number, alpha = 0.5): void {
  ctx.save()
  ctx.globalAlpha = alpha
  ctx.fillStyle = '#ffffff'
  ctx.beginPath()
  ctx.ellipse(x - r * 0.4, y - r * 0.42, r * 0.22, r * 0.12, -0.7, 0, Math.PI * 2)
  ctx.fill()
  ctx.restore()
}

/** Flat dark ellipse that reads as a contact shadow on the floor. */
export function drawGroundShadow(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  rx: number,
  ry: number,
  alpha: number,
): void {
  ctx.save()
  ctx.globalAlpha = clamp01(alpha)
  ctx.fillStyle = 'rgba(5, 6, 9, 1)'
  ctx.beginPath()
  ctx.ellipse(x, y, rx, ry, 0, 0, Math.PI * 2)
  ctx.fill()
  ctx.restore()
}

/** Expanding stroked ring that fades as `t` goes 0 -> 1. */
export function drawRing(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  fromR: number,
  toR: number,
  t: number,
  color: string,
  width: number,
): void {
  const k = clamp01(t)
  ctx.save()
  ctx.globalAlpha = 1 - k
  ctx.lineWidth = Math.max(1.5, width * (1 - k * 0.7))
  ctx.strokeStyle = color
  ctx.beginPath()
  ctx.arc(x, y, lerp(fromR, toR, k), 0, Math.PI * 2)
  ctx.stroke()
  ctx.restore()
}

/** Small dots flying outward from (x, y), shrinking and fading as `t` goes 0 -> 1. */
export function drawDroplets(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  count: number,
  fromR: number,
  toR: number,
  size: number,
  t: number,
  color: string,
  seed = 0,
): void {
  const k = clamp01(t)
  ctx.save()
  ctx.globalAlpha = 1 - k
  ctx.fillStyle = color
  for (let i = 0; i < count; i += 1) {
    const a = seed + (i / count) * Math.PI * 2 + (i % 2) * 0.2
    const dist = lerp(fromR, toR * (0.85 + (i % 3) * 0.1), easeOut(k))
    ctx.beginPath()
    ctx.arc(x + Math.cos(a) * dist, y + Math.sin(a) * dist, Math.max(0.8, size * (1 - k * 0.6)), 0, Math.PI * 2)
    ctx.fill()
  }
  ctx.restore()
}

function easeOut(t: number): number {
  return 1 - (1 - t) * (1 - t)
}

/** Four-point sparkle star centred at the origin of the current transform. */
export function drawSparkle(ctx: CanvasRenderingContext2D, size: number, color: string): void {
  const inner = size * 0.22
  ctx.fillStyle = color
  ctx.beginPath()
  for (let i = 0; i < 8; i += 1) {
    const a = (i / 8) * Math.PI * 2 - Math.PI / 2
    const rad = i % 2 === 0 ? size : inner
    const px = Math.cos(a) * rad
    const py = Math.sin(a) * rad
    if (i === 0) ctx.moveTo(px, py)
    else ctx.lineTo(px, py)
  }
  ctx.closePath()
  ctx.fill()
}
