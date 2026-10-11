import type { Collider } from '../game/physics'

/** Normalized landmark as returned by MediaPipe (x, y in 0..1). */
export interface Landmark {
  readonly x: number
  readonly y: number
  readonly visibility?: number
}

/** Maps normalized camera coordinates to canvas pixels (mirrored, object-fit: cover). */
export interface ViewMapping {
  readonly scale: number
  readonly offsetX: number
  readonly offsetY: number
  readonly videoWidth: number
  readonly videoHeight: number
  readonly canvasWidth: number
}

export type TrackedPoint = Readonly<{ x: number; y: number }>

export const NOSE = 0
export const LEFT_WRIST = 9
export const RIGHT_WRIST = 10

// COCO-17 keypoint indices (MoveNet) with the relative size of each body part.
const BODY_PARTS: ReadonlyArray<readonly [index: number, sizeFactor: number]> = [
  [NOSE, 1.6], // head
  [5, 1.0], // shoulders
  [6, 1.0],
  [7, 0.9], // elbows
  [8, 0.9],
  [LEFT_WRIST, 1.3], // hands
  [RIGHT_WRIST, 1.3],
  [13, 1.1], // knees
  [14, 1.1],
  [15, 1.2], // ankles → feet
  [16, 1.2],
]

/** MoveNet keypoint scores run lower than MediaPipe visibilities. */
const MIN_VISIBILITY = 0.3

export function coverMapping(videoW: number, videoH: number, canvasW: number, canvasH: number): ViewMapping {
  const scale = Math.max(canvasW / videoW, canvasH / videoH)
  return {
    scale,
    offsetX: (canvasW - videoW * scale) / 2,
    offsetY: (canvasH - videoH * scale) / 2,
    videoWidth: videoW,
    videoHeight: videoH,
    canvasWidth: canvasW,
  }
}

export function toCanvas(lm: Landmark, m: ViewMapping): TrackedPoint {
  const x = m.offsetX + lm.x * m.videoWidth * m.scale
  return { x: m.canvasWidth - x, y: m.offsetY + lm.y * m.videoHeight * m.scale }
}

export function isVisible(lm: Landmark | undefined): lm is Landmark {
  return lm !== undefined && (lm.visibility ?? 1) >= MIN_VISIBILITY
}

export interface Body {
  /** Collider per landmark index (only visible parts). Wrist indices hold the estimated palm. */
  readonly parts: ReadonlyMap<number, Collider>
  /** Positions to feed back as `previous` next frame. */
  readonly positions: ReadonlyMap<number, TrackedPoint>
}

/** The model has no palm keypoint: extend the forearm past the wrist by ~a hand's length. */
const PALM_EXTENSION = 0.35
const ELBOW_OF_WRIST: Readonly<Record<number, number>> = { [LEFT_WRIST]: 7, [RIGHT_WRIST]: 8 }

export function estimatePalm(wrist: TrackedPoint, elbow: TrackedPoint): TrackedPoint {
  return {
    x: wrist.x + (wrist.x - elbow.x) * PALM_EXTENSION,
    y: wrist.y + (wrist.y - elbow.y) * PALM_EXTENSION,
  }
}

function partPosition(landmarks: readonly Landmark[], index: number, mapping: ViewMapping): TrackedPoint {
  const p = toCanvas(landmarks[index], mapping)
  const elbow = landmarks[ELBOW_OF_WRIST[index]]
  return elbow !== undefined && isVisible(elbow) ? estimatePalm(p, toCanvas(elbow, mapping)) : p
}

/**
 * Builds one person's colliders. Velocity comes from that same person's
 * previous-frame positions so a fast swing transfers momentum.
 */
export function buildBody(
  landmarks: readonly Landmark[],
  previous: ReadonlyMap<number, TrackedPoint>,
  mapping: ViewMapping,
  baseRadius: number,
  dt: number,
): Body {
  const parts = new Map<number, Collider>()
  const positions = new Map<number, TrackedPoint>()
  for (const [index, sizeFactor] of BODY_PARTS) {
    if (!isVisible(landmarks[index])) continue
    const p = partPosition(landmarks, index, mapping)
    const prev = previous.get(index)
    const vx = prev && dt > 0 ? (p.x - prev.x) / dt : 0
    const vy = prev && dt > 0 ? (p.y - prev.y) / dt : 0
    positions.set(index, p)
    parts.set(index, { x: p.x, y: p.y, vx, vy, r: baseRadius * sizeFactor })
  }
  return { parts, positions }
}
