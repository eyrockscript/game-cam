import type { JointName } from '../../core/types'
import type { World } from '../../game/physics'
import { t } from '../../i18n'
import { COLORS, TYPE, drawText, unit } from '../../render/theme'
import { drawHoldRing } from '../../render/widgets'
import type { CopyPoseState } from '../copyPose'
import { POSES, poseJoints } from '../poses'

const CARD_Y = 0.16
const CARD_FILL = 'rgba(24, 26, 33, 0.72)'
const BONES: readonly (readonly [JointName, JointName])[] = [
  ['leftShoulder', 'rightShoulder'],
  ['leftShoulder', 'leftElbow'],
  ['leftElbow', 'leftWrist'],
  ['rightShoulder', 'rightElbow'],
  ['rightElbow', 'rightWrist'],
  ['leftShoulder', 'leftHip'],
  ['rightShoulder', 'rightHip'],
  ['leftHip', 'rightHip'],
]

/** Reference figure in a card at the top center. */
function drawReference(ctx: CanvasRenderingContext2D, state: CopyPoseState, world: World): void {
  const u = unit(world)
  const size = u * 0.34
  const card = { x: world.width / 2 - size / 2, y: world.height * CARD_Y, w: size, h: size }
  ctx.save()
  ctx.beginPath()
  ctx.roundRect(card.x, card.y, card.w, card.h, size * 0.12)
  ctx.fillStyle = CARD_FILL
  ctx.fill()
  const joints = poseJoints(POSES[state.poseIndex], { x: world.width / 2, y: card.y + size * 0.42, scale: size * 0.22 })
  ctx.lineCap = 'round'
  ctx.lineWidth = size * 0.045
  ctx.strokeStyle = state.phase === 'result' && state.scored.length === 0 ? COLORS.danger : COLORS.accent
  ctx.beginPath()
  for (const [a, b] of BONES) {
    const p = joints[a]
    const q = joints[b]
    if (!p || !q) continue
    ctx.moveTo(p.x, p.y)
    ctx.lineTo(q.x, q.y)
  }
  ctx.stroke()
  const nose = joints.nose
  if (nose) {
    ctx.beginPath()
    ctx.arc(nose.x, nose.y, size * 0.07, 0, Math.PI * 2)
    ctx.fillStyle = ctx.strokeStyle
    ctx.fill()
  }
  ctx.restore()
  const caption =
    state.phase === 'pose' ? t('copyPose.copy') : state.scored.length > 0 ? t('copyPose.nice') : t('copyPose.miss')
  drawText(ctx, caption, world.width / 2, card.y + card.h + u * 0.05, {
    size: u * TYPE.body,
    align: 'center',
    baseline: 'middle',
    outline: true,
  })
}

function drawBadges(ctx: CanvasRenderingContext2D, state: CopyPoseState, world: World): void {
  const u = unit(world)
  for (const badge of state.badges) {
    const y = badge.y - u * 0.13
    drawHoldRing(ctx, badge.x, y, u * 0.04, badge.progress, u * 0.01)
    if (!badge.done) continue
    // Below the ring: the label is wider than the ring and would cover it.
    drawText(ctx, t('copyPose.nice'), badge.x, y + u * 0.075, {
      size: u * TYPE.caption,
      color: badge.color,
      align: 'center',
      baseline: 'middle',
      outline: true,
    })
  }
}

export function renderCopyPose(ctx: CanvasRenderingContext2D, state: CopyPoseState, world: World): void {
  drawReference(ctx, state, world)
  drawBadges(ctx, state, world)
}
