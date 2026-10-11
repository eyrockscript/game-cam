import type { Collider } from '../game/physics'
import type { Joint, JointName, Player } from '../core/types'
import {
  type Landmark,
  LEFT_WRIST,
  NOSE,
  RIGHT_WRIST,
  type TrackedPoint,
  type ViewMapping,
  buildBody,
  isVisible,
  toCanvas,
} from './bodyColliders'

export const MAX_PLAYERS = 5
export const PLAYER_COLORS = ['#5eead4', '#fbbf24', '#f472b6', '#a3e635', '#7dd3fc'] as const

// Torso landmarks (nose, shoulders, hips) used to locate a person.
const ANCHORS = [NOSE, 5, 6, 11, 12]
/** Max jump of a person's center between frames, as a fraction of canvas width. */
const MAX_MATCH_DISTANCE = 0.25

/** What we remember about each person between frames. */
export interface TrackedPlayer {
  readonly id: number
  readonly color: string
  readonly center: TrackedPoint
  readonly positions: ReadonlyMap<number, TrackedPoint>
}

export interface TrackerState {
  readonly players: readonly TrackedPlayer[]
  readonly nextId: number
}

export const emptyTracker: TrackerState = { players: [], nextId: 1 }

export function poseCenter(landmarks: readonly Landmark[], mapping: ViewMapping): TrackedPoint | null {
  const points = ANCHORS.map((i) => landmarks[i])
    .filter(isVisible)
    .map((lm) => toCanvas(lm, mapping))
  if (points.length === 0) return null
  const sum = points.reduce((acc, p) => ({ x: acc.x + p.x, y: acc.y + p.y }), { x: 0, y: 0 })
  return { x: sum.x / points.length, y: sum.y / points.length }
}

/** Greedy nearest-center matching: returns previous index per pose (or -1 for new people). */
export function matchPoses(
  centers: readonly TrackedPoint[],
  previous: readonly TrackedPlayer[],
  maxDistance: number,
): number[] {
  const pairs = centers.flatMap((c, i) =>
    previous.map((p, j) => ({ i, j, d: Math.hypot(c.x - p.center.x, c.y - p.center.y) })),
  )
  pairs.sort((a, b) => a.d - b.d)
  const result = centers.map(() => -1)
  const used = new Set<number>()
  for (const { i, j, d } of pairs) {
    if (d > maxDistance || result[i] !== -1 || used.has(j)) continue
    result[i] = j
    used.add(j)
  }
  return result
}

function freeColor(taken: ReadonlySet<string>): string {
  return PLAYER_COLORS.find((c) => !taken.has(c)) ?? PLAYER_COLORS[0]
}

// COCO-17 keypoint index of each named joint.
const JOINT_INDEX: Readonly<Record<JointName, number>> = {
  nose: 0,
  leftShoulder: 5,
  rightShoulder: 6,
  leftElbow: 7,
  rightElbow: 8,
  leftWrist: 9,
  rightWrist: 10,
  leftHip: 11,
  rightHip: 12,
  leftKnee: 13,
  rightKnee: 14,
  leftAnkle: 15,
  rightAnkle: 16,
}

export function namedJoints(landmarks: readonly Landmark[], mapping: ViewMapping): Partial<Record<JointName, Joint>> {
  const entries = Object.entries(JOINT_INDEX).flatMap(([name, index]) => {
    const lm = landmarks[index]
    if (!isVisible(lm)) return []
    const p = toCanvas(lm, mapping)
    return [[name, { x: p.x, y: p.y, score: lm.visibility ?? 1 }] as const]
  })
  return Object.fromEntries(entries)
}

function toPlayer(
  id: number,
  color: string,
  parts: ReadonlyMap<number, Collider>,
  joints: Partial<Record<JointName, Joint>>,
): Player {
  const hands = [parts.get(LEFT_WRIST), parts.get(RIGHT_WRIST)].filter((c): c is Collider => c !== undefined)
  return { id, color, joints, colliders: [...parts.values()], hands, head: parts.get(NOSE) ?? null }
}

/** Turns raw poses into stable players (ids, colors, per-person velocities). */
export function trackPlayers(
  poses: readonly (readonly Landmark[])[],
  tracker: TrackerState,
  mapping: ViewMapping,
  baseRadius: number,
  dt: number,
): { players: Player[]; tracker: TrackerState } {
  const located = poses
    .slice(0, MAX_PLAYERS)
    .map((landmarks) => ({ landmarks, center: poseCenter(landmarks, mapping) }))
    .filter((p): p is { landmarks: readonly Landmark[]; center: TrackedPoint } => p.center !== null)

  const matches = matchPoses(
    located.map((p) => p.center),
    tracker.players,
    mapping.canvasWidth * MAX_MATCH_DISTANCE,
  )
  const taken = new Set(matches.filter((j) => j >= 0).map((j) => tracker.players[j].color))
  let nextId = tracker.nextId
  const players: Player[] = []
  const tracked: TrackedPlayer[] = []

  located.forEach(({ landmarks, center }, i) => {
    const prev = matches[i] >= 0 ? tracker.players[matches[i]] : null
    const id = prev?.id ?? nextId++
    const color = prev?.color ?? freeColor(taken)
    taken.add(color)
    const body = buildBody(landmarks, prev?.positions ?? new Map(), mapping, baseRadius, dt)
    players.push(toPlayer(id, color, body.parts, namedJoints(landmarks, mapping)))
    tracked.push({ id, color, center, positions: body.positions })
  })
  return { players, tracker: { players: tracked, nextId } }
}
