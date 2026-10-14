/**
 * Body markers: a thin skeleton in each player's color with small joint dots,
 * and the two hands emphasized as rings (they are the on-screen cursors).
 * Kept light so the person stays visible underneath.
 */
import type { JointName, Player } from '../core/types'
import type { World } from '../game/physics'
import { COLORS } from './theme'

const BONES: readonly (readonly [JointName, JointName])[] = [
  ['leftShoulder', 'rightShoulder'],
  ['leftShoulder', 'leftElbow'],
  ['leftElbow', 'leftWrist'],
  ['rightShoulder', 'rightElbow'],
  ['rightElbow', 'rightWrist'],
  ['leftShoulder', 'leftHip'],
  ['rightShoulder', 'rightHip'],
  ['leftHip', 'rightHip'],
  ['leftHip', 'leftKnee'],
  ['leftKnee', 'leftAnkle'],
  ['rightHip', 'rightKnee'],
  ['rightKnee', 'rightAnkle'],
]

function strokeBones(ctx: CanvasRenderingContext2D, player: Player): void {
  ctx.beginPath()
  for (const [a, b] of BONES) {
    const from = player.joints[a]
    const to = player.joints[b]
    if (!from || !to) continue
    ctx.moveTo(from.x, from.y)
    ctx.lineTo(to.x, to.y)
  }
  ctx.stroke()
}

function drawSkeleton(ctx: CanvasRenderingContext2D, player: Player, u: number): void {
  ctx.save()
  ctx.lineCap = 'round'
  ctx.lineJoin = 'round'
  // Dark underlay keeps the colored line readable on bright clothes/walls.
  ctx.globalAlpha = 0.35
  ctx.lineWidth = u * 0.011
  ctx.strokeStyle = COLORS.shadow
  strokeBones(ctx, player)
  ctx.globalAlpha = 0.85
  ctx.lineWidth = u * 0.005
  ctx.strokeStyle = player.color
  strokeBones(ctx, player)
  ctx.fillStyle = player.color
  for (const joint of Object.values(player.joints)) {
    if (!joint) continue
    ctx.beginPath()
    ctx.arc(joint.x, joint.y, u * 0.0065, 0, Math.PI * 2)
    ctx.fill()
  }
  ctx.restore()
}

function drawHands(ctx: CanvasRenderingContext2D, player: Player, u: number): void {
  ctx.save()
  for (const hand of player.hands) {
    const r = Math.max(hand.r, u * 0.022)
    ctx.beginPath()
    ctx.arc(hand.x, hand.y, r, 0, Math.PI * 2)
    ctx.fillStyle = COLORS.edge
    ctx.fill()
    ctx.lineWidth = u * 0.011
    ctx.strokeStyle = COLORS.shadow
    ctx.stroke()
    ctx.lineWidth = u * 0.006
    ctx.strokeStyle = player.color
    ctx.stroke()
    ctx.beginPath()
    ctx.arc(hand.x, hand.y, u * 0.006, 0, Math.PI * 2)
    ctx.fillStyle = player.color
    ctx.fill()
  }
  ctx.restore()
}

/** `world` is the stage size, so drawn hands match collider sizes when letterboxed. */
export function renderPlayers(ctx: CanvasRenderingContext2D, players: readonly Player[], world: World): void {
  const u = Math.min(world.width, world.height)
  for (const player of players) {
    drawSkeleton(ctx, player, u)
    drawHands(ctx, player, u)
  }
}
