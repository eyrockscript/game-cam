import { angleDeg, distance, type Joints, reliable, reliableAll, torsoLength } from './geometry'

/**
 * Phase of one tracked movement channel.
 * 'active' = the effort position (squat down, arms up, jack open, knee raised).
 * 'rest'   = the neutral position.
 * 'unknown' = not seen yet in a decisive position.
 */
export type Phase = 'unknown' | 'rest' | 'active'

/** Decisive reading of a frame; null = in-between zone or joints missing (keep phase). */
export type Reading = 'rest' | 'active' | null

/**
 * One independently counted movement (e.g. a single leg).
 * countOn 'enter' counts rest → active, 'exit' counts active → rest.
 */
export interface Channel {
  readonly classify: (joints: Joints) => Reading
  readonly countOn: 'enter' | 'exit'
}

export interface Exercise {
  readonly id: ExerciseId
  readonly nameKey: string
  readonly instructionKey: string
  readonly channels: readonly Channel[]
}

/** Per-player tracking state: one phase per channel. */
export type Tracker = readonly Phase[]

export const SQUAT_DOWN_DEG = 110
export const SQUAT_UP_DEG = 160
export const JACK_OPEN_FEET = 1.5
export const JACK_CLOSED_FEET = 1.1
export const KNEE_RAISED_TORSO = 0.35
export const KNEE_LOWERED_TORSO = 0.6

const LEGS = [
  ['leftHip', 'leftKnee', 'leftAnkle'],
  ['rightHip', 'rightKnee', 'rightAnkle'],
] as const

interface LegReading {
  readonly confidence: number
  readonly angle: number
}

function legReading(joints: Joints, [hipName, kneeName, ankleName]: (typeof LEGS)[number]): LegReading | null {
  const hip = reliable(joints, hipName)
  const knee = reliable(joints, kneeName)
  const ankle = reliable(joints, ankleName)
  if (!hip || !knee || !ankle) return null
  return { confidence: Math.min(hip.score, knee.score, ankle.score), angle: angleDeg(hip, knee, ankle) }
}

/** Knee angle of the most confidently detected leg. */
function bestKneeAngle(joints: Joints): number | null {
  const legs = LEGS.map((leg) => legReading(joints, leg)).filter((r): r is LegReading => r !== null)
  if (legs.length === 0) return null
  return legs.reduce((best, r) => (r.confidence > best.confidence ? r : best)).angle
}

export function classifySquat(joints: Joints): Reading {
  const angle = bestKneeAngle(joints)
  if (angle === null) return null
  if (angle < SQUAT_DOWN_DEG) return 'active'
  if (angle > SQUAT_UP_DEG) return 'rest'
  return null
}

const ARM_JOINTS = ['nose', 'leftWrist', 'rightWrist', 'leftShoulder', 'rightShoulder'] as const

/** 'active' = both wrists above the nose, 'rest' = both wrists below the shoulders. */
function armsReading(joints: Joints): Reading {
  const j = reliableAll(joints, ARM_JOINTS)
  if (!j) return null
  const shoulderY = Math.max(j.leftShoulder.y, j.rightShoulder.y)
  if (j.leftWrist.y < j.nose.y && j.rightWrist.y < j.nose.y) return 'active'
  if (j.leftWrist.y > shoulderY && j.rightWrist.y > shoulderY) return 'rest'
  return null
}

export function classifyArmsUp(joints: Joints): Reading {
  return armsReading(joints)
}

export function classifyJack(joints: Joints): Reading {
  const arms = armsReading(joints)
  const j = reliableAll(joints, ['leftAnkle', 'rightAnkle', 'leftShoulder', 'rightShoulder'] as const)
  if (!arms || !j) return null
  const shoulderWidth = distance(j.leftShoulder, j.rightShoulder)
  if (shoulderWidth === 0) return null
  const feet = distance(j.leftAnkle, j.rightAnkle) / shoulderWidth
  if (arms === 'active' && feet > JACK_OPEN_FEET) return 'active'
  if (arms === 'rest' && feet < JACK_CLOSED_FEET) return 'rest'
  return null
}

/** Classifies one knee (y grows downward) relative to its own hip, normalized by torso length. */
export function classifyKnee(side: 'left' | 'right'): (joints: Joints) => Reading {
  return (joints) => {
    const body = reliableAll(joints, ['leftShoulder', 'rightShoulder', 'leftHip', 'rightHip'] as const)
    const knee = reliable(joints, side === 'left' ? 'leftKnee' : 'rightKnee')
    if (!body || !knee) return null
    const torso = torsoLength(body.leftShoulder, body.rightShoulder, body.leftHip, body.rightHip)
    if (torso === 0) return null
    const hip = side === 'left' ? body.leftHip : body.rightHip
    const drop = (knee.y - hip.y) / torso
    if (drop < KNEE_RAISED_TORSO) return 'active'
    if (drop > KNEE_LOWERED_TORSO) return 'rest'
    return null
  }
}

export const PUNCH_OUT_SHOULDERS = 1.1
export const PUNCH_BACK_SHOULDERS = 0.6
export const PUNCH_LEVEL_SHOULDERS = 0.5
export const ARMS_OPEN_SHOULDERS = 2.2
export const ARMS_CLOSED_SHOULDERS = 0.8

/**
 * One arm punching out to its own side at shoulder height. Forward punches are
 * not used: a single 2D camera can't see an arm extending toward the lens.
 */
export function classifySidePunch(side: 'left' | 'right'): (joints: Joints) => Reading {
  return (joints) => {
    const body = reliableAll(joints, ['leftShoulder', 'rightShoulder'] as const)
    const wrist = reliable(joints, side === 'left' ? 'leftWrist' : 'rightWrist')
    if (!body || !wrist) return null
    const width = distance(body.leftShoulder, body.rightShoulder)
    if (width === 0) return null
    const shoulder = side === 'left' ? body.leftShoulder : body.rightShoulder
    const other = side === 'left' ? body.rightShoulder : body.leftShoulder
    const outward = Math.sign(shoulder.x - other.x)
    const reach = ((wrist.x - shoulder.x) * outward) / width
    const level = Math.abs(wrist.y - shoulder.y) / width
    if (reach > PUNCH_OUT_SHOULDERS && level < PUNCH_LEVEL_SHOULDERS) return 'active'
    if (Math.abs(wrist.x - shoulder.x) / width < PUNCH_BACK_SHOULDERS) return 'rest'
    return null
  }
}

/** 'active' = wrists spread wide, 'rest' = wrists together in front of the chest. */
export function classifyArmOpener(joints: Joints): Reading {
  const j = reliableAll(joints, ['leftShoulder', 'rightShoulder', 'leftWrist', 'rightWrist'] as const)
  if (!j) return null
  const width = distance(j.leftShoulder, j.rightShoulder)
  if (width === 0) return null
  const spread = distance(j.leftWrist, j.rightWrist) / width
  if (spread > ARMS_OPEN_SHOULDERS) return 'active'
  if (spread < ARMS_CLOSED_SHOULDERS) return 'rest'
  return null
}

export type ExerciseId = 'squats' | 'jumpingJacks' | 'highKnees' | 'armRaises' | 'sidePunches' | 'armOpeners'

function exercise(id: ExerciseId, channels: readonly Channel[]): Exercise {
  return { id, nameKey: `workout.exercises.${id}.name`, instructionKey: `workout.exercises.${id}.instruction`, channels }
}

/** Catalog of supported exercises. Adding an exercise = adding an entry here (+ its es.json texts). */
export const EXERCISES: Readonly<Record<ExerciseId, Exercise>> = {
  squats: exercise('squats', [{ classify: classifySquat, countOn: 'exit' }]),
  jumpingJacks: exercise('jumpingJacks', [{ classify: classifyJack, countOn: 'exit' }]),
  highKnees: exercise('highKnees', [
    { classify: classifyKnee('left'), countOn: 'enter' },
    { classify: classifyKnee('right'), countOn: 'enter' },
  ]),
  armRaises: exercise('armRaises', [{ classify: classifyArmsUp, countOn: 'exit' }]),
  sidePunches: exercise('sidePunches', [
    { classify: classifySidePunch('left'), countOn: 'enter' },
    { classify: classifySidePunch('right'), countOn: 'enter' },
  ]),
  armOpeners: exercise('armOpeners', [{ classify: classifyArmOpener, countOn: 'exit' }]),
}

export function initialTracker(ex: Exercise): Tracker {
  return ex.channels.map((): Phase => 'unknown')
}

function isRep(channel: Channel, from: Phase, to: Phase): boolean {
  if (from === to) return false
  return channel.countOn === 'enter' ? from === 'rest' && to === 'active' : from === 'active' && to === 'rest'
}

/** Advances a player's tracker by one frame. Pure: returns a new tracker and the reps gained. */
export function updateTracker(ex: Exercise, tracker: Tracker, joints: Joints): { tracker: Tracker; reps: number } {
  let reps = 0
  const next = ex.channels.map((channel, i) => {
    const previous = tracker[i] ?? 'unknown'
    const reading = channel.classify(joints)
    if (reading === null) return previous
    if (isRep(channel, previous, reading)) reps += 1
    return reading
  })
  return { tracker: next, reps }
}
