# Small-room mode Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make Game Cam playable when players can't stand 2–3 m from the camera: half-body framing, an adaptive workout, a letterboxed "fit" view on mismatched screens, body-scaled colliders, and widest camera zoom.

**Architecture:** A pure framing detector feeds `FrameInput.framing`; games receive it in `start()` through an optional `StartContext`. A pure `viewport()` decides between cover and a letterboxed stage; the stage becomes the play area (world size, canvas translation, tap offset), so games and menus stay untouched. Collider radius is derived per person from shoulder width.

**Tech Stack:** TypeScript 5.9, Vite 7, Vitest 3, TensorFlow.js MoveNet, Canvas 2D. Package manager: pnpm.

**Spec:** `docs/superpowers/specs/2026-10-13-small-room-games-music-design.md` (section A).

**Shell note:** in this machine's Bash, `node` is broken through nvm. Prefix every pnpm command with
`export PATH="$HOME/.nvm/versions/node/v22.22.2/bin:$PATH" &&`.

---

## File map

| File | Change | Responsibility |
|---|---|---|
| `src/core/types.ts` | modify | `Framing`, `FrameInput.framing?`, `StartContext`, `MiniGame.start(…, context?)` |
| `src/pose/framing.ts` | create | pure framing detector with hysteresis |
| `src/pose/framing.test.ts` | create | tests |
| `src/app/session.ts` | modify | pass `{ framing }` to `start()` |
| `src/app/session.test.ts` | modify | test framing pass-through |
| `src/workout/exercises.ts` | modify | `sidePunches`, `armOpeners` |
| `src/workout/__fixtures__/skeleton.ts` | modify | fixtures for the new exercises |
| `src/workout/exercises.test.ts` | modify | tests |
| `src/workout/routine.ts` | modify | `UPPER_BODY_ORDER`, `routineFor()` |
| `src/games/workout.ts` | modify | choose routine from framing |
| `src/workout/state.test.ts` | modify | routine-selection test |
| `src/pose/viewport.ts` | create | cover vs letterboxed stage |
| `src/pose/viewport.test.ts` | create | tests |
| `src/render/renderer.ts` | modify | letterbox bars, stage-sized dim, clip |
| `src/pose/bodyColliders.ts` | modify | `bodyRadius()` |
| `src/pose/bodyColliders.test.ts` | modify | tests |
| `src/pose/players.ts` | modify | per-person radius |
| `src/camera.ts` | modify | zoom to minimum when supported |
| `src/main.ts` | modify | framing state, viewport/stage wiring, toast |
| `src/i18n/es.json` | modify | new exercise names, copy |
| `README.md` | modify | small-room notes |

---

### Task 1: Framing type and detector

**Files:**
- Modify: `src/core/types.ts`
- Create: `src/pose/framing.ts`
- Test: `src/pose/framing.test.ts`

- [ ] **Step 1: Add the `Framing` type**

In `src/core/types.ts`, right after the `JointName` union, add:

```ts
/** How much of the players' bodies the camera sees: 'upper' = no legs (small room). */
export type Framing = 'full' | 'upper'
```

- [ ] **Step 2: Write the failing test**

Create `src/pose/framing.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import type { Joint, Player } from '../core/types'
import { FRAMING_HOLD_MS, type FramingState, initialFraming, isFullBody, updateFraming } from './framing'

const joint: Joint = { x: 0, y: 0, score: 0.9 }

function upper(id = 1): Player {
  return { id, color: '#fff', joints: { nose: joint, leftShoulder: joint, rightShoulder: joint }, colliders: [], hands: [], head: null }
}

function full(id = 1): Player {
  const base = upper(id)
  return { ...base, joints: { ...base.joints, leftKnee: joint, rightKnee: joint } }
}

function feed(state: FramingState, players: Player[], frames: number, dtMs = 100): FramingState {
  return Array.from({ length: frames }).reduce<FramingState>((s) => updateFraming(s, players, dtMs), state)
}

describe('isFullBody', () => {
  it('needs both knees or both ankles', () => {
    expect(isFullBody(full())).toBe(true)
    expect(isFullBody(upper())).toBe(false)
    const oneKnee = { ...upper(), joints: { ...upper().joints, leftKnee: joint } }
    expect(isFullBody(oneKnee)).toBe(false)
    const ankles = { ...upper(), joints: { ...upper().joints, leftAnkle: joint, rightAnkle: joint } }
    expect(isFullBody(ankles)).toBe(true)
  })
})

describe('updateFraming', () => {
  it('starts as full body', () => {
    expect(initialFraming.framing).toBe('full')
  })

  it(`switches to upper only after ${FRAMING_HOLD_MS} ms without legs`, () => {
    expect(feed(initialFraming, [upper()], 9).framing).toBe('full')
    expect(feed(initialFraming, [upper()], 10).framing).toBe('upper')
  })

  it('stays full while any player shows their legs', () => {
    expect(feed(initialFraming, [upper(1), full(2)], 20).framing).toBe('full')
  })

  it('restarts the hold when the condition is interrupted', () => {
    const almost = feed(initialFraming, [upper()], 9)
    const interrupted = updateFraming(almost, [full()], 100)
    expect(feed(interrupted, [upper()], 9).framing).toBe('full')
  })

  it('switches back to full with the same hold', () => {
    const small = feed(initialFraming, [upper()], 10)
    expect(feed(small, [full()], 9).framing).toBe('upper')
    expect(feed(small, [full()], 10).framing).toBe('full')
  })

  it('keeps its state when nobody is visible', () => {
    const pending = feed(initialFraming, [upper()], 5)
    expect(updateFraming(pending, [], 100)).toBe(pending)
  })
})
```

- [ ] **Step 3: Run it to verify it fails**

Run: `pnpm test src/pose/framing.test.ts`
Expected: FAIL, `Failed to resolve import "./framing"`.

- [ ] **Step 4: Implement**

Create `src/pose/framing.ts`:

```ts
import type { Framing, JointName, Player } from '../core/types'

export interface FramingState {
  readonly framing: Framing
  /** How long the opposite framing has been observed without interruption. */
  readonly pendingMs: number
}

/** Framing must hold this long before switching, so a crouch or a step doesn't flicker it. */
export const FRAMING_HOLD_MS = 1000

export const initialFraming: FramingState = { framing: 'full', pendingMs: 0 }

/** Player joints only contain confidently visible keypoints (see players.ts → namedJoints). */
function seen(player: Player, a: JointName, b: JointName): boolean {
  return player.joints[a] !== undefined && player.joints[b] !== undefined
}

export function isFullBody(player: Player): boolean {
  return seen(player, 'leftKnee', 'rightKnee') || seen(player, 'leftAnkle', 'rightAnkle')
}

/** Full when anyone shows their legs; switching either way needs FRAMING_HOLD_MS. Pure. */
export function updateFraming(state: FramingState, players: readonly Player[], dtMs: number): FramingState {
  if (players.length === 0) return state
  const observed: Framing = players.some(isFullBody) ? 'full' : 'upper'
  if (observed === state.framing) return state.pendingMs === 0 ? state : { framing: state.framing, pendingMs: 0 }
  const pendingMs = state.pendingMs + dtMs
  return pendingMs >= FRAMING_HOLD_MS ? { framing: observed, pendingMs: 0 } : { framing: state.framing, pendingMs }
}
```

- [ ] **Step 5: Run it to verify it passes**

Run: `pnpm test src/pose/framing.test.ts`
Expected: PASS (7 tests).

- [ ] **Step 6: Commit**

```bash
git add src/core/types.ts src/pose/framing.ts src/pose/framing.test.ts
git commit -m "feat: detect half-body framing with hysteresis"
```

---

### Task 2: Pass framing into `FrameInput` and `start()`

**Files:**
- Modify: `src/core/types.ts` (`FrameInput`, `MiniGame`)
- Modify: `src/app/session.ts:117` (`stepCountdown`)
- Test: `src/app/session.test.ts`

- [ ] **Step 1: Write the failing test**

Append inside `src/app/session.test.ts` (new `describe` at the end of the file):

```ts
describe('framing', () => {
  it('passes the current framing to the game start', () => {
    const seen: string[] = []
    const probe: MiniGame<{ n: number }> = {
      ...counter,
      id: 'probe',
      start: (_world, _random, context) => {
        seen.push(context?.framing ?? 'none')
        return { n: 0 }
      },
    }
    const list = [probe] as readonly AnyMiniGame[]
    const counting = stepSession(createSession({}), list, input(), world, keys('confirm')).session
    stepSession(counting, list, { ...input([], COUNTDOWN_MS / 1000), framing: 'upper' }, world)
    expect(seen).toEqual(['upper'])
  })

  it('defaults to full body when the input has no framing', () => {
    const seen: string[] = []
    const probe: MiniGame<{ n: number }> = {
      ...counter,
      id: 'probe',
      start: (_world, _random, context) => {
        seen.push(context?.framing ?? 'none')
        return { n: 0 }
      },
    }
    const list = [probe] as readonly AnyMiniGame[]
    const counting = stepSession(createSession({}), list, input(), world, keys('confirm')).session
    stepSession(counting, list, input([], COUNTDOWN_MS / 1000), world)
    expect(seen).toEqual(['full'])
  })
})
```

- [ ] **Step 2: Run it to verify it fails**

Run: `pnpm test src/app/session.test.ts`
Expected: FAIL (`expected [ 'none' ] to deeply equal [ 'upper' ]`); TypeScript in the editor also flags `framing` / `context` as unknown.

- [ ] **Step 3: Implement the types**

In `src/core/types.ts`, change `FrameInput` to:

```ts
export interface FrameInput {
  readonly players: readonly Player[]
  /** Seconds since the previous frame (already clamped). */
  readonly dt: number
  /** Monotonic timestamp in ms. */
  readonly now: number
  /** Camera framing; absent means 'full'. */
  readonly framing?: Framing
}

/** What a game may know about the room when a round starts. */
export interface StartContext {
  readonly framing: Framing
}
```

and the `start` line of `MiniGame` to:

```ts
  start(world: World, random: () => number, context?: StartContext): S
```

- [ ] **Step 4: Implement the session change**

In `src/app/session.ts`, inside `stepCountdown`, replace

```ts
  const state = games[gameIndex].start(world, random)
```

with

```ts
  const state = games[gameIndex].start(world, random, { framing: input.framing ?? 'full' })
```

- [ ] **Step 5: Run all tests**

Run: `pnpm test`
Expected: PASS (all suites, including the 2 new tests).

- [ ] **Step 6: Commit**

```bash
git add src/core/types.ts src/app/session.ts src/app/session.test.ts
git commit -m "feat: expose framing to games at round start"
```

---

### Task 3: Upper-body exercises (`sidePunches`, `armOpeners`)

**Files:**
- Modify: `src/workout/__fixtures__/skeleton.ts`
- Modify: `src/workout/exercises.ts`
- Modify: `src/i18n/es.json`
- Test: `src/workout/exercises.test.ts`

- [ ] **Step 1: Add fixtures**

Append to `src/workout/__fixtures__/skeleton.ts` (body units: shoulders at x = ±0.4, y = 0; shoulder width 0.8):

```ts
/** One arm stretched out to its own side at shoulder height, `reach` body units past the shoulder. */
export function sidePunch(side: 'left' | 'right', reach = 1): Pose {
  return side === 'left'
    ? { ...STANDING, leftElbow: [0.4 + reach / 2, 0], leftWrist: [0.4 + reach, 0] }
    : { ...STANDING, rightElbow: [-0.4 - reach / 2, 0], rightWrist: [-0.4 - reach, 0] }
}

/** Both wrists at chest height, `halfWidth` body units from the center. */
export function armSpread(halfWidth: number): Pose {
  return { ...STANDING, leftWrist: [halfWidth, 0.3], rightWrist: [-halfWidth, 0.3] }
}

export const armsClosed = (): Pose => armSpread(0.15)
export const armsOpen = (): Pose => armSpread(1.3)

/** What a camera sees in a small room: no hips, knees or ankles. */
export function upperOnly(pose: Pose): Pose {
  return without(pose, 'leftHip', 'rightHip', 'leftKnee', 'rightKnee', 'leftAnkle', 'rightAnkle')
}
```

- [ ] **Step 2: Write the failing tests**

In `src/workout/exercises.test.ts`, extend the fixture import with `armSpread, armsClosed, armsOpen, sidePunch, upperOnly`, then add before `describe('scale invariance', …)`:

```ts
describe('side punches', () => {
  it('counts each punch of either arm', () => {
    const frames = [standing(), sidePunch('left'), standing(), sidePunch('right'), standing()]
    expect(run('sidePunches', at(frames)).reps).toBe(2)
  })

  it('ignores an arm stretched out far below shoulder height', () => {
    const low = { ...standing(), leftWrist: [1.5, 1] as const }
    expect(run('sidePunches', at([standing(), low, standing()])).reps).toBe(0)
  })

  it('does not double count an arm hovering between the thresholds', () => {
    const frames = [standing(), sidePunch('left'), sidePunch('left', 0.7), sidePunch('left'), standing()]
    expect(run('sidePunches', at(frames)).reps).toBe(1)
  })

  it('works without legs in view', () => {
    const frames = [standing(), sidePunch('left'), standing()].map(upperOnly)
    expect(run('sidePunches', at(frames)).reps).toBe(1)
  })
})

describe('arm openers', () => {
  it('counts closed, open, closed as one rep', () => {
    expect(run('armOpeners', at([armsClosed(), armsOpen(), armsClosed()])).reps).toBe(1)
  })

  it('needs the arms brought together again to count', () => {
    expect(run('armOpeners', at([armsClosed(), armsOpen(), standing()])).reps).toBe(0)
  })

  it('ignores jitter in the in-between zone', () => {
    const frames = [armsClosed(), armsOpen(), armSpread(0.7), armsOpen(), armSpread(0.6), armsClosed()]
    expect(run('armOpeners', at(frames)).reps).toBe(1)
  })

  it('works without legs in view', () => {
    expect(run('armOpeners', at([armsClosed(), armsOpen(), armsClosed()].map(upperOnly))).reps).toBe(1)
  })
})
```

And in `describe('scale invariance', …)` add two entries to `sequences` (the `Record<ExerciseId, …>` type requires them):

```ts
    sidePunches: [standing(), sidePunch('left'), standing(), sidePunch('right'), standing()],
    armOpeners: [armsClosed(), armsOpen(), armsClosed(), armsOpen(), armsClosed()],
```

- [ ] **Step 3: Run them to verify they fail**

Run: `pnpm test src/workout/exercises.test.ts`
Expected: FAIL, `Cannot read properties of undefined (reading 'channels')` for `sidePunches` / `armOpeners`.

- [ ] **Step 4: Implement**

In `src/workout/exercises.ts`, after `classifyKnee`, add:

```ts
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
```

Change the id union to:

```ts
export type ExerciseId = 'squats' | 'jumpingJacks' | 'highKnees' | 'armRaises' | 'sidePunches' | 'armOpeners'
```

and add to `EXERCISES`:

```ts
  sidePunches: exercise('sidePunches', [
    { classify: classifySidePunch('left'), countOn: 'enter' },
    { classify: classifySidePunch('right'), countOn: 'enter' },
  ]),
  armOpeners: exercise('armOpeners', [{ classify: classifyArmOpener, countOn: 'exit' }]),
```

- [ ] **Step 5: Add the Spanish texts**

In `src/i18n/es.json`, inside `workout.exercises`, after `armRaises`, add:

```json
      "sidePunches": {
        "name": "Golpes laterales",
        "instruction": "Lanza un golpe hacia un lado a la altura del hombro y regresa"
      },
      "armOpeners": {
        "name": "Aperturas de brazos",
        "instruction": "Junta las manos al frente y abre los brazos a los lados"
      }
```

- [ ] **Step 6: Run the tests**

Run: `pnpm test src/workout/exercises.test.ts`
Expected: PASS (all, including 8 new tests and 2 new scale-invariance cases).

- [ ] **Step 7: Commit**

```bash
git add src/workout src/i18n/es.json
git commit -m "feat: add side punches and arm openers for half-body workouts"
```

---

### Task 4: Pick the workout routine from framing

**Files:**
- Modify: `src/workout/routine.ts`
- Modify: `src/games/workout.ts`
- Test: `src/workout/state.test.ts`

- [ ] **Step 1: Write the failing test**

In `src/workout/state.test.ts`, change the routine import to
`import { DEFAULT_ORDER, UPPER_BODY_ORDER, blockAt, buildRoutine, totalSeconds } from './routine'`
and append:

```ts
describe('routine selection', () => {
  const exercises = (s: WorkoutState) => s.routine.flatMap((b) => (b.kind === 'exercise' ? [b.exerciseId] : []))

  it('uses the full-body routine by default', () => {
    expect(exercises(workoutGame.start(world, random))).toEqual([...DEFAULT_ORDER])
    expect(exercises(workoutGame.start(world, random, { framing: 'full' }))).toEqual([...DEFAULT_ORDER])
  })

  it('uses only upper-body exercises when legs are out of view', () => {
    expect(exercises(workoutGame.start(world, random, { framing: 'upper' }))).toEqual([...UPPER_BODY_ORDER])
  })
})
```

- [ ] **Step 2: Run it to verify it fails**

Run: `pnpm test src/workout/state.test.ts`
Expected: FAIL, `UPPER_BODY_ORDER` is undefined.

- [ ] **Step 3: Implement**

In `src/workout/routine.ts`, add `import type { Framing } from '../core/types'` at the top and, after `DEFAULT_ORDER`:

```ts
/** For small rooms: nothing here needs hips, knees or ankles. */
export const UPPER_BODY_ORDER: readonly ExerciseId[] = ['armRaises', 'sidePunches', 'armOpeners']

export function routineFor(framing: Framing): Routine {
  return buildRoutine(framing === 'upper' ? UPPER_BODY_ORDER : DEFAULT_ORDER)
}
```

In `src/games/workout.ts`, replace the import `import { blockAt } from '../workout/routine'` with
`import { blockAt, routineFor } from '../workout/routine'` and the `start` line with:

```ts
  start: (_world, _random, context) => initialState(routineFor(context?.framing ?? 'full')),
```

- [ ] **Step 4: Run all tests**

Run: `pnpm test`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/workout/routine.ts src/games/workout.ts src/workout/state.test.ts
git commit -m "feat: use an upper-body routine when legs are out of view"
```

---

### Task 5: Viewport (cover vs letterboxed stage)

**Files:**
- Create: `src/pose/viewport.ts`
- Test: `src/pose/viewport.test.ts`

- [ ] **Step 1: Write the failing test**

Create `src/pose/viewport.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { toCanvas } from './bodyColliders'
import { MAX_CROP, coverCrop, viewport } from './viewport'

describe('coverCrop', () => {
  it('is zero when aspect ratios match', () => {
    expect(coverCrop(1280, 720, 1920, 1080)).toBeCloseTo(0)
  })

  it('is the fraction of the video lost to cropping', () => {
    expect(coverCrop(1280, 720, 1024, 768)).toBeCloseTo(0.25)
  })
})

describe('viewport', () => {
  it('fills the screen when little would be cropped', () => {
    const { stage } = viewport(1280, 720, 1024, 768)
    expect(coverCrop(1280, 720, 1024, 768)).toBeLessThanOrEqual(MAX_CROP)
    expect(stage).toEqual({ x: 0, y: 0, width: 1024, height: 768 })
  })

  it('letterboxes a landscape camera on a portrait phone', () => {
    const { stage } = viewport(1280, 720, 1080, 1920)
    expect(stage).toEqual({ x: 0, y: 656, width: 1080, height: 608 })
  })

  it('maps the camera corners onto the stage edges in fit mode', () => {
    const { mapping } = viewport(1280, 720, 1080, 1920)
    const corner = toCanvas({ x: 0, y: 1 }, mapping)
    // Stage size is rounded to whole pixels, so allow sub-pixel slack.
    expect(Math.abs(corner.x - 1080)).toBeLessThan(1)
    expect(Math.abs(corner.y - 608)).toBeLessThan(1)
  })

  it('uses the whole screen before the camera has a frame', () => {
    expect(viewport(0, 0, 1080, 1920).stage).toEqual({ x: 0, y: 0, width: 1080, height: 1920 })
  })
})
```

- [ ] **Step 2: Run it to verify it fails**

Run: `pnpm test src/pose/viewport.test.ts`
Expected: FAIL, `Failed to resolve import "./viewport"`.

- [ ] **Step 3: Implement**

Create `src/pose/viewport.ts`:

```ts
import { type ViewMapping, coverMapping } from './bodyColliders'

/** The play area inside the canvas, in canvas pixels. */
export interface Stage {
  readonly x: number
  readonly y: number
  readonly width: number
  readonly height: number
}

export interface Viewport {
  readonly stage: Stage
  /** Maps camera coordinates into stage coordinates (origin at the stage corner). */
  readonly mapping: ViewMapping
}

/**
 * Above this cropped fraction we letterbox instead: e.g. a 16:9 camera on a
 * portrait phone would lose ~68% of its width, so players at the sides vanish.
 */
export const MAX_CROP = 0.3

/** Fraction of the video (width or height, whichever is worse) hidden by object-fit: cover. */
export function coverCrop(videoW: number, videoH: number, canvasW: number, canvasH: number): number {
  const scale = Math.max(canvasW / videoW, canvasH / videoH)
  return 1 - Math.min(canvasW / (videoW * scale), canvasH / (videoH * scale))
}

export function viewport(videoW: number, videoH: number, canvasW: number, canvasH: number): Viewport {
  const whole: Stage = { x: 0, y: 0, width: canvasW, height: canvasH }
  if (videoW <= 0 || videoH <= 0 || coverCrop(videoW, videoH, canvasW, canvasH) <= MAX_CROP) {
    return { stage: whole, mapping: coverMapping(videoW, videoH, canvasW, canvasH) }
  }
  const scale = Math.min(canvasW / videoW, canvasH / videoH)
  const width = Math.round(videoW * scale)
  const height = Math.round(videoH * scale)
  const stage: Stage = { x: Math.round((canvasW - width) / 2), y: Math.round((canvasH - height) / 2), width, height }
  return { stage, mapping: coverMapping(videoW, videoH, width, height) }
}
```

- [ ] **Step 4: Run it to verify it passes**

Run: `pnpm test src/pose/viewport.test.ts`
Expected: PASS (6 tests).

- [ ] **Step 5: Commit**

```bash
git add src/pose/viewport.ts src/pose/viewport.test.ts
git commit -m "feat: letterbox the camera when cover would crop too much"
```

---

### Task 6: Body-scaled colliders

**Files:**
- Modify: `src/pose/bodyColliders.ts`
- Modify: `src/pose/players.ts:131`
- Test: `src/pose/bodyColliders.test.ts`

- [ ] **Step 1: Write the failing test**

In `src/pose/bodyColliders.test.ts`, change the import to
`import { type Landmark, MAX_RADIUS_FACTOR, MIN_RADIUS_FACTOR, bodyRadius, buildBody, coverMapping, toCanvas } from './bodyColliders'`
and append:

```ts
describe('bodyRadius', () => {
  const shoulders = (left: number, right: number) =>
    pose({ 5: { x: left, y: 0.4, visibility: 0.9 }, 6: { x: right, y: 0.4, visibility: 0.9 } })

  it('falls back when the shoulders are not visible', () => {
    expect(bodyRadius(pose({}), mapping, 40)).toBe(40)
  })

  it('scales with shoulder width', () => {
    // 0.2 × 1280 px = 256 px shoulders → 256 × 0.22
    expect(bodyRadius(shoulders(0.4, 0.6), mapping, 40)).toBeCloseTo(56.32)
  })

  it('clamps very close and very far people', () => {
    expect(bodyRadius(shoulders(0.1, 0.9), mapping, 40)).toBeCloseTo(40 * MAX_RADIUS_FACTOR)
    expect(bodyRadius(shoulders(0.49, 0.51), mapping, 40)).toBeCloseTo(40 * MIN_RADIUS_FACTOR)
  })
})
```

- [ ] **Step 2: Run it to verify it fails**

Run: `pnpm test src/pose/bodyColliders.test.ts`
Expected: FAIL, `bodyRadius is not a function`.

- [ ] **Step 3: Implement**

In `src/pose/bodyColliders.ts`, after `isVisible`, add:

```ts
const LEFT_SHOULDER = 5
const RIGHT_SHOULDER = 6
/** Collider radius per pixel of shoulder width (≈ the current size at 2.5 m). */
export const RADIUS_PER_SHOULDER = 0.22
export const MIN_RADIUS_FACTOR = 0.7
export const MAX_RADIUS_FACTOR = 2.3

/**
 * Collider size for one person, proportional to how big they look: someone
 * close to the camera gets bigger hands than someone far away. Bounded around
 * `fallback`, which is also used when the shoulders aren't visible.
 */
export function bodyRadius(landmarks: readonly Landmark[], mapping: ViewMapping, fallback: number): number {
  const left = landmarks[LEFT_SHOULDER]
  const right = landmarks[RIGHT_SHOULDER]
  if (!isVisible(left) || !isVisible(right)) return fallback
  const a = toCanvas(left, mapping)
  const b = toCanvas(right, mapping)
  const width = Math.hypot(a.x - b.x, a.y - b.y)
  if (width === 0) return fallback
  return Math.min(fallback * MAX_RADIUS_FACTOR, Math.max(fallback * MIN_RADIUS_FACTOR, width * RADIUS_PER_SHOULDER))
}
```

In `src/pose/players.ts`, add `bodyRadius` to the import list from `./bodyColliders`, and in `trackPlayers` replace

```ts
    const body = buildBody(landmarks, prev?.positions ?? new Map(), mapping, baseRadius, dt)
```

with

```ts
    const radius = bodyRadius(landmarks, mapping, baseRadius)
    const body = buildBody(landmarks, prev?.positions ?? new Map(), mapping, radius, dt)
```

Also update the `baseRadius` doc: change the JSDoc above `trackPlayers` to
`/** Turns raw poses into stable players (ids, colors, per-person velocities). `baseRadius` is the fallback collider size. */`.

- [ ] **Step 4: Run all tests**

Run: `pnpm test`
Expected: PASS (existing `players.test.ts` fixtures put both shoulders at the same point, so they keep the fallback).

- [ ] **Step 5: Commit**

```bash
git add src/pose/bodyColliders.ts src/pose/bodyColliders.test.ts src/pose/players.ts
git commit -m "feat: size body colliders from each player's shoulder width"
```

---

### Task 7: Camera zoom-out

**Files:**
- Modify: `src/camera.ts`

No unit test: this is a thin adapter over `MediaStreamTrack`; it is verified in the browser in Task 9.

- [ ] **Step 1: Implement**

Replace `src/camera.ts` with:

```ts
/** `zoom` is in the Image Capture spec but not yet in TypeScript's DOM types. */
type ZoomCapabilities = MediaTrackCapabilities & { zoom?: { min: number; max: number } }

/** Widest field of view the camera allows, so players fit in small rooms. Best effort. */
async function zoomOut(stream: MediaStream): Promise<void> {
  const [track] = stream.getVideoTracks()
  const capabilities = track?.getCapabilities?.() as ZoomCapabilities | undefined
  if (!track || !capabilities?.zoom) return
  try {
    await track.applyConstraints({ advanced: [{ zoom: capabilities.zoom.min } as MediaTrackConstraintSet] })
  } catch (error: unknown) {
    console.warn('Camera zoom-out rejected; keeping the default zoom', error)
  }
}

export async function startCamera(video: HTMLVideoElement): Promise<void> {
  const stream = await navigator.mediaDevices.getUserMedia({
    audio: false,
    video: { facingMode: 'user', width: { ideal: 1280 }, height: { ideal: 720 } },
  })
  await zoomOut(stream)
  video.srcObject = stream
  await video.play()
}
```

- [ ] **Step 2: Type-check**

Run: `pnpm build`
Expected: build succeeds (no TS errors).

- [ ] **Step 3: Commit**

```bash
git add src/camera.ts
git commit -m "feat: zoom the camera out to its widest when supported"
```

---

### Task 8: Wire framing and the stage into the app

**Files:**
- Modify: `src/render/renderer.ts`
- Modify: `src/main.ts`
- Modify: `src/i18n/es.json`

- [ ] **Step 1: Renderer — letterbox and stage-sized dim**

Replace `src/render/renderer.ts` with:

```ts
import type { ViewMapping } from '../pose/bodyColliders'
import type { Stage } from '../pose/viewport'

const VIDEO_DIM = 'rgba(15, 17, 21, 0.25)'
/** Same as the PWA theme_color, so bars blend with the page. */
const LETTERBOX = '#0f1115'

/** Paints the bars around a letterboxed stage (no-op when the stage fills the canvas). */
export function drawLetterbox(ctx: CanvasRenderingContext2D, stage: Stage): void {
  const { width, height } = ctx.canvas
  if (stage.x === 0 && stage.y === 0 && stage.width === width && stage.height === height) return
  ctx.fillStyle = LETTERBOX
  ctx.fillRect(0, 0, width, height)
}

/** Draws in stage coordinates: call after translating the context to the stage corner. */
export function drawMirroredVideo(ctx: CanvasRenderingContext2D, video: HTMLVideoElement, m: ViewMapping, stage: Stage): void {
  const w = m.videoWidth * m.scale
  const h = m.videoHeight * m.scale
  ctx.save()
  ctx.translate(m.canvasWidth, 0)
  ctx.scale(-1, 1)
  ctx.drawImage(video, m.offsetX, m.offsetY, w, h)
  ctx.restore()
  ctx.fillStyle = VIDEO_DIM
  ctx.fillRect(0, 0, stage.width, stage.height)
}
```

- [ ] **Step 2: Spanish copy**

In `src/i18n/es.json`, inside `messages`, replace `intro` and `noBody` and add `upperBody`:

```json
    "intro": "Párense frente a la cámara: de cuerpo completo a 2 o 3 metros, o de medio cuerpo si el cuarto es chico. Caben hasta 5 personas.",
    "noBody": "No veo a nadie. Párense frente a la cámara; basta con que se vean de la cintura para arriba.",
    "upperBody": "Los veo de medio cuerpo. Los juegos funcionan igual y la rutina usará ejercicios de brazos.",
```

- [ ] **Step 3: main.ts — imports**

In `src/main.ts`, replace

```ts
import { type ViewMapping, coverMapping } from './pose/bodyColliders'
```

with

```ts
import type { ViewMapping } from './pose/bodyColliders'
import { type FramingState, initialFraming, updateFraming } from './pose/framing'
import { type Stage, viewport } from './pose/viewport'
```

and replace `import { drawMirroredVideo } from './render/renderer'` with
`import { drawLetterbox, drawMirroredVideo } from './render/renderer'`.

- [ ] **Step 4: main.ts — taps into stage coordinates**

Add right after `function resizeCanvas() {…}`:

```ts
/** Taps are collected in canvas pixels; games live in stage coordinates. */
function toStage(points: readonly Point[], stage: Stage): Point[] {
  return points.map((p) => ({ x: p.x - stage.x, y: p.y - stage.y }))
}
```

- [ ] **Step 5: main.ts — the frame loop**

Replace the body of `runLoop` with:

```ts
function runLoop(tracker: PoseTracker): void {
  let session: Session = createSession(loadBests())
  let framing: FramingState = initialFraming
  let lastTime = performance.now()
  const playersFor = createPlayerFeed(tracker)

  const frame = (now: number): void => {
    const dt = Math.min(MAX_DT, (now - lastTime) / 1000)
    lastTime = now
    const view = viewport(video.videoWidth, video.videoHeight, canvas.width, canvas.height)
    const world = worldFor(view.stage.width, view.stage.height)
    const players = playersFor(view.mapping, Math.min(world.width, world.height) * 0.035)

    const nextFraming = updateFraming(framing, players, dt * 1000)
    if (nextFraming.framing === 'upper' && framing.framing === 'full') showToast(t('messages.upperBody'))
    framing = nextFraming

    const input = { players, dt, now, framing: framing.framing }
    const controls = { keys: pendingKeys, taps: toStage(pendingTaps, view.stage) }
    const step = stepSession(session, GAMES, input, world, controls)
    pendingKeys = []
    pendingTaps = []
    session = step.session
    if (step.events.includes('gameOver')) localStorage.setItem(BESTS_KEY, JSON.stringify(session.bests))

    drawLetterbox(ctx, view.stage)
    ctx.save()
    ctx.translate(view.stage.x, view.stage.y)
    ctx.beginPath()
    ctx.rect(0, 0, view.stage.width, view.stage.height)
    ctx.clip()
    drawMirroredVideo(ctx, video, view.mapping, view.stage)
    renderPlayers(ctx, players)
    renderSession(ctx, session, GAMES, world, now)
    ctx.restore()

    hud.update(session, GAMES, players.length)
    if (players.length === 0 && session.screen.kind !== 'playing') hud.showMessage(t('messages.noBody'))
    else hud.hideOverlay()

    const buildText = `${__COMMIT_HASH__} · ${tracker.status()}`
    if (buildLabel.textContent !== buildText) buildLabel.textContent = buildText
    requestAnimationFrame(frame)
  }
  requestAnimationFrame(frame)
}
```

`createPlayerFeed` keeps its `(mapping: ViewMapping, baseRadius: number)` signature, so the `ViewMapping` import stays in use.

- [ ] **Step 6: Build and test**

Run: `pnpm test && pnpm build`
Expected: all tests PASS, build succeeds.

- [ ] **Step 7: Commit**

```bash
git add src/render/renderer.ts src/main.ts src/i18n/es.json
git commit -m "feat: play inside a letterboxed stage and announce half-body mode"
```

---

### Task 9: Browser verification and README

**Files:**
- Modify: `README.md`

- [ ] **Step 1: Run the app**

Run (background): `pnpm dev`
Open `http://localhost:5173` with the chrome-devtools MCP tools.

- [ ] **Step 2: Verify landscape (no letterbox)**

At 1280×720: click "Activar cámara". Expected: the video fills the screen with no bars; the menu works with hand, tap and keyboard as before. A fake camera stream is fine (Chrome provides one when no camera exists).

- [ ] **Step 3: Verify portrait (letterbox)**

Emulate 390×844 (`mcp__chrome-devtools__emulate` / `resize_page`). Expected: the video is centered with dark bars above and below; menu tiles are inside the video area; tapping a tile starts that game; the corner "Menú" button sits inside the stage.

- [ ] **Step 4: Verify half-body mode in person**

Ask the user to stand close to the camera with legs out of view. Expected: after ~1 s the toast "Los veo de medio cuerpo…" appears; "Rutina" starts with "Brazos arriba" and later shows "Golpes laterales" and "Aperturas de brazos", and reps count. Stepping back so knees show and starting Rutina again uses the full-body routine.

If the user can't test now, record that in the final report as **not verified in person**.

- [ ] **Step 5: README**

In `README.md`, in the "Playing on a TV" section, replace step 3 with:

```markdown
3. Put the camera at about chest height. From 2–3 m everyone is visible head to toe. In a small room, half a body is enough: when nobody's legs are visible for a second, the app switches to half-body mode and the workout uses arm exercises only (arm raises, side punches, arm openers).
```

and add after the "How it works" bullet list item about **Hands**:

```markdown
- **Small rooms.** The camera is zoomed out to its widest when it supports zoom. When the screen's shape differs a lot from the camera's (a 16:9 webcam on a portrait phone), the full camera picture is shown with bars instead of cropping, and the games are played inside it. Hit areas scale with each person's shoulder width, so someone close to the camera has bigger hands than someone far away.
```

- [ ] **Step 6: Full check and commit**

Run: `pnpm test && pnpm build`
Expected: PASS and build OK.

```bash
git add README.md
git commit -m "docs: document small-room mode"
```
