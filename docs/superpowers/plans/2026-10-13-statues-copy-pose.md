# Statues and Copy-the-pose Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Two new co-op games: **Estatuas** (dance while the music plays, freeze when it stops; anyone who moves costs the team a life) and **Copia la pose** (match an on-screen arm pose and hold it for 1 s).

**Architecture:** Both implement the existing pure `MiniGame<S>` contract (`start`/`step`/`render`/`status`). Statues silences the music through `GameStatus.music` (the director from the music plan already obeys it). Rules live in `src/games/statues.ts` and `src/games/copyPose.ts`, the arm-pose library and matching in `src/games/poses.ts`, drawing in `src/games/render/*`. Render functions only read state, so everything they need about players (label positions, progress) is stored in state by `step`.

**Tech Stack:** TypeScript 5.9, Canvas 2D, Vitest. pnpm.

**Spec:** `docs/superpowers/specs/2026-10-13-small-room-games-music-design.md` (section B).

**Shell note:** prefix every pnpm command with `export PATH="$HOME/.nvm/versions/node/v22.22.2/bin:$PATH" &&`. Commit with the trailer as a second `-m`; never put `grep -n` and `git commit` in the same command (a local hook mis-reads `-n` as `--no-verify`):
`git commit -m "<message>" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"`

**Existing helpers used:**
- `src/workout/__fixtures__/skeleton.ts`: `place(pose, at?, score?)`, `standing()`, `player(id, joints, color?)`, `NEAR = { scale: 300, x: 900, y: 150 }`, `FAR`. Body units: shoulders at x = ±0.4 (shoulder width 0.8 → 240 px at NEAR).
- `src/workout/state.ts`: `headAnchor(player): Point | null` (nose, else shoulder midpoint).
- `src/workout/geometry.ts`: `reliableAll(joints, names)`, type `Joints`.
- `src/render/theme.ts`: `COLORS`, `TYPE`, `unit(world)`, `drawText(ctx, text, x, y, style)`, `easeOutBack`.
- `src/render/widgets.ts`: `drawPill(ctx, text, x, y, { size, fill, color, align })`, `drawHoldRing(ctx, cx, cy, r, progress, width)`.
- `src/render/icons.ts`: `IconId`, `PAINTERS`, `iconForGame`.

---

## File map

| File | Change | Responsibility |
|---|---|---|
| `src/games/statues.ts` (+ test) | create | Statues rules (phases, motion metric, lives) |
| `src/games/render/statues.ts` | create | banner, freeze ring, "¡Te moviste!" labels |
| `src/games/poses.ts` (+ test) | create | 10 arm poses, angle matching, skeleton builder |
| `src/games/copyPose.ts` (+ test) | create | Copy-the-pose rules (rounds, holds, lives) |
| `src/games/render/copyPose.ts` | create | reference silhouette, per-player progress rings |
| `src/render/icons.ts` | modify | `snowflake` and `pose` menu icons |
| `src/games/registry.ts` | modify | register both games |
| `src/i18n/es.json` | modify | titles, descriptions, in-game texts |
| `README.md` | modify | games table |

---

### Task 1: Statues rules

**Files:**
- Create: `src/games/statues.ts`
- Test: `src/games/statues.test.ts`

- [ ] **Step 1: Write the failing test**

Create `src/games/statues.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import type { Player } from '../core/types'
import { worldFor } from '../game/physics'
import { FAR, NEAR, place, player, standing, without } from '../workout/__fixtures__/skeleton'
import {
  FREEZE_MIN_SECONDS,
  FREEZE_START_SECONDS,
  INITIAL_LIVES,
  RESULT_SECONDS,
  type StatuesState,
  frameMotion,
  statuesGame,
} from './statues'

const world = worldFor(1920, 1080)
const random = () => 0 // shortest dance: 5 s

/** A standing player shifted `dx` px right (NEAR: shoulder width = 240 px). */
const at = (id: number, dx = 0, base = NEAR): Player => player(id, place(standing(), { ...base, x: base.x + dx }))

function run(state: StatuesState, frames: Player[][], dt: number): { state: StatuesState; events: string[]; finished: boolean } {
  return frames.reduce(
    (acc, players) => {
      const r = statuesGame.step(acc.state, { players, dt, now: 0 }, world, random)
      return { state: r.state, events: [...acc.events, ...r.events], finished: r.finished }
    },
    { state, events: [] as string[], finished: false },
  )
}

const repeat = (players: Player[], n: number): Player[][] => Array.from({ length: n }, () => players)

/** Dances the full 5 s with `players` standing still, ending at the start of the freeze. */
function frozen(players: Player[]): StatuesState {
  const r = run(statuesGame.start(world, random), repeat(players, 20), 0.25)
  expect(r.state.phase).toBe('freeze')
  return r.state
}

/** Freeze lasts 3 s = 24 frames of 0.125 s. Grace = the first 4 frames. */
const FREEZE_FRAMES = 24

describe('frameMotion', () => {
  it('is mean joint displacement in shoulder widths', () => {
    const a = place(standing())
    const b = place(standing(), { ...NEAR, x: NEAR.x + 24 })
    expect(frameMotion(a, b)).toBeCloseTo(0.1)
  })

  it('drops displacements below the jitter floor', () => {
    expect(frameMotion(place(standing()), place(standing(), { ...NEAR, x: NEAR.x + 3 }))).toBe(0)
  })

  it('is null without both shoulders', () => {
    expect(frameMotion(place(standing()), place(without(standing(), 'leftShoulder')))).toBeNull()
  })
})

describe('statues', () => {
  it('starts dancing with the music on and full lives', () => {
    const state = statuesGame.start(world, random)
    expect(state.phase).toBe('dance')
    expect(statuesGame.status(state)).toEqual({ score: 0, lives: INITIAL_LIVES, music: 'on' })
  })

  it('stops the music and freezes when the dance time runs out', () => {
    const r = run(statuesGame.start(world, random), repeat([at(1)], 20), 0.25)
    expect(r.state.phase).toBe('freeze')
    expect(r.events).toEqual(['freeze'])
    expect(statuesGame.status(r.state).music).toBe('off')
  })

  it('scores everyone who stayed still and keeps the lives', () => {
    const r = run(frozen([at(1), at(2, 0, FAR)]), repeat([at(1), at(2, 0, FAR)], FREEZE_FRAMES), 0.125)
    expect(r.state.phase).toBe('result')
    expect(r.events).toEqual(['safe'])
    expect(r.state.score).toBe(2)
    expect(r.state.lives).toBe(INITIAL_LIVES)
  })

  it('ignores movement during the grace period', () => {
    const settling = [30, 60, 90, 120].map((dx) => [at(1, dx)])
    const r = run(frozen([at(1)]), [...settling, ...repeat([at(1, 120)], FREEZE_FRAMES - 4)], 0.125)
    expect(r.events).toEqual(['safe'])
  })

  it('ignores camera jitter', () => {
    const jitter = Array.from({ length: FREEZE_FRAMES }, (_, i) => [at(1, i % 2 === 0 ? 3 : 0)])
    expect(run(frozen([at(1)]), jitter, 0.125).events).toEqual(['safe'])
  })

  it('catches a player who moves after the grace period, once', () => {
    const still = repeat([at(1)], 4)
    const moving = Array.from({ length: 8 }, (_, i) => [at(1, (i + 1) * 30)])
    const rest = repeat([at(1, 240)], FREEZE_FRAMES - 12)
    const r = run(frozen([at(1)]), [...still, ...moving, ...rest], 0.125)
    expect(r.events.filter((e) => e === 'moved')).toHaveLength(1)
    expect(r.events.at(-1)).toBe('caught')
    expect(r.state.lives).toBe(INITIAL_LIVES - 1)
    expect(r.state.score).toBe(0)
    expect(r.state.labels.map((l) => l.playerId)).toEqual([1])
  })

  it('costs one life per round even when several players move', () => {
    const moving = Array.from({ length: FREEZE_FRAMES }, (_, i) => [at(1, i * 30), at(2, i * 30, FAR)])
    const r = run(frozen([at(1), at(2, 0, FAR)]), moving, 0.125)
    expect(r.state.lives).toBe(INITIAL_LIVES - 1)
  })

  it('does not judge players who join during the freeze', () => {
    const joiner = Array.from({ length: FREEZE_FRAMES }, (_, i) => [at(1), at(2, i * 30, FAR)])
    const r = run(frozen([at(1)]), joiner, 0.125)
    expect(r.events).toEqual(['safe'])
    expect(r.state.score).toBe(1)
  })

  it('dances again after the result and shortens the next freeze', () => {
    const afterFreeze = run(frozen([at(1)]), repeat([at(1)], FREEZE_FRAMES), 0.125).state
    expect(afterFreeze.freezeSeconds).toBeCloseTo(FREEZE_START_SECONDS - 0.1)
    const r = run(afterFreeze, repeat([at(1)], Math.ceil(RESULT_SECONDS / 0.125)), 0.125)
    expect(r.state.phase).toBe('dance')
    expect(r.events).toEqual(['dance'])
    expect(statuesGame.status(r.state).music).toBe('on')
  })

  it(`never shortens the freeze below ${FREEZE_MIN_SECONDS} s`, () => {
    const state: StatuesState = { ...frozen([at(1)]), freezeSeconds: FREEZE_MIN_SECONDS, phaseLeft: 0.1 }
    expect(run(state, [[at(1)]], 0.125).state.freezeSeconds).toBe(FREEZE_MIN_SECONDS)
  })

  it('ends after the result screen of the round that took the last life', () => {
    const lastLife: StatuesState = { ...frozen([at(1)]), lives: 1, phaseLeft: 0.1, phaseElapsed: 1, motion: { 1: 5 } }
    const caught = run(lastLife, [[at(1)]], 0.125)
    expect(caught.state.lives).toBe(0)
    expect(caught.finished).toBe(false)
    const over = run(caught.state, repeat([at(1)], Math.ceil(RESULT_SECONDS / 0.125)), 0.125)
    expect(over.finished).toBe(true)
  })

  it('never mutates the previous state', () => {
    const state = Object.freeze(frozen([at(1)]))
    const snapshot = JSON.stringify(state)
    run(state, repeat([at(1, 50)], 6), 0.125)
    expect(JSON.stringify(state)).toBe(snapshot)
  })
})
```

- [ ] **Step 2: Run it to verify it fails**

Run: `pnpm test src/games/statues.test.ts`
Expected: FAIL, `Failed to resolve import "./statues"`.

- [ ] **Step 3: Implement**

Create `src/games/statues.ts` (the render import is created in Task 2; create a stub first so this compiles: `src/games/render/statues.ts` containing
`export function renderStatues(): void {}` — Task 2 replaces it):

```ts
import type { FrameInput, JointName, MiniGame, Player, StepResult } from '../core/types'
import { headAnchor } from '../workout/state'
import { renderStatues } from './render/statues'

export type StatuesPhase = 'dance' | 'freeze' | 'result'

type Point = Readonly<{ x: number; y: number }>
/** Joint positions of one player in one frame. */
export type PoseFrame = Readonly<Partial<Record<JointName, Point>>>

export interface MoverLabel {
  readonly playerId: number
  readonly color: string
  readonly x: number
  readonly y: number
}

export interface StatuesState {
  readonly phase: StatuesPhase
  /** Seconds left in the current phase. */
  readonly phaseLeft: number
  readonly phaseElapsed: number
  /** Length of the next freeze; shrinks every round. */
  readonly freezeSeconds: number
  readonly round: number
  readonly score: number
  readonly lives: number
  /** Player ids present when the freeze started: only they are judged. */
  readonly judged: readonly number[]
  /** Accumulated motion per judged player during this freeze, in shoulder widths. */
  readonly motion: Readonly<Record<number, number>>
  readonly lastPoses: Readonly<Record<number, PoseFrame>>
  /** Where to draw "¡Te moviste!" (movers this round). */
  readonly labels: readonly MoverLabel[]
  /** Result phase: whether anyone moved. */
  readonly caught: boolean
}

export const INITIAL_LIVES = 3
export const DANCE_MIN_SECONDS = 5
export const DANCE_MAX_SECONDS = 12
export const FREEZE_START_SECONDS = 3
export const FREEZE_MIN_SECONDS = 2
export const FREEZE_SHRINK_SECONDS = 0.1
/** Lets people finish their last dance move once the music stops. */
export const GRACE_SECONDS = 0.5
export const RESULT_SECONDS = 1.2
/** Accumulated shoulder widths of movement that count as "moved". Tune with real captures. */
export const MOVE_THRESHOLD = 0.6
/** Per-frame displacements below this (in shoulder widths) are model noise. */
export const JITTER = 0.02

export function danceSeconds(random: () => number): number {
  return DANCE_MIN_SECONDS + random() * (DANCE_MAX_SECONDS - DANCE_MIN_SECONDS)
}

export function poseFrame(player: Player): PoseFrame {
  return Object.fromEntries(
    Object.entries(player.joints).flatMap(([name, joint]) => (joint ? [[name, { x: joint.x, y: joint.y }]] : [])),
  )
}

/** Mean displacement of the joints seen in both frames, in shoulder widths; null without shoulders. */
export function frameMotion(previous: PoseFrame, current: PoseFrame): number | null {
  const ls = current.leftShoulder
  const rs = current.rightShoulder
  if (!ls || !rs) return null
  const width = Math.hypot(ls.x - rs.x, ls.y - rs.y)
  if (width === 0) return null
  const moves = (Object.keys(current) as JointName[]).flatMap((name) => {
    const a = previous[name]
    const b = current[name]
    if (!a || !b) return []
    const d = Math.hypot(b.x - a.x, b.y - a.y) / width
    return [d < JITTER ? 0 : d]
  })
  return moves.length === 0 ? null : moves.reduce((sum, d) => sum + d, 0) / moves.length
}

function moversOf(judged: readonly number[], motion: Readonly<Record<number, number>>): number[] {
  return judged.filter((id) => (motion[id] ?? 0) >= MOVE_THRESHOLD)
}

function labelsFor(ids: readonly number[], players: readonly Player[]): MoverLabel[] {
  return players
    .filter((p) => ids.includes(p.id))
    .flatMap((p) => {
      const head = headAnchor(p)
      return head ? [{ playerId: p.id, color: p.color, x: head.x, y: head.y }] : []
    })
}

type Step = StepResult<StatuesState>
const keep = (state: StatuesState, events: string[] = []): Step => ({ state, events, finished: false })

function stepDance(s: StatuesState, input: FrameInput): Step {
  if (s.phaseLeft > 0) return keep(s)
  const judged = input.players.map((p) => p.id)
  return keep({ ...s, phase: 'freeze', phaseLeft: s.freezeSeconds, phaseElapsed: 0, judged, motion: {}, labels: [], caught: false }, [
    'freeze',
  ])
}

function accumulate(s: StatuesState, input: FrameInput, previous: StatuesState['lastPoses']): Record<number, number> {
  const motion = { ...s.motion }
  if (s.phaseElapsed <= GRACE_SECONDS) return motion
  for (const player of input.players) {
    const before = previous[player.id]
    if (!s.judged.includes(player.id) || !before) continue
    const m = frameMotion(before, poseFrame(player))
    if (m !== null) motion[player.id] = (motion[player.id] ?? 0) + m
  }
  return motion
}

function stepFreeze(s: StatuesState, input: FrameInput, previous: StatuesState['lastPoses']): Step {
  const motion = accumulate(s, input, previous)
  const movers = moversOf(s.judged, motion)
  const newMovers = movers.filter((id) => !moversOf(s.judged, s.motion).includes(id))
  const events = newMovers.map(() => 'moved')
  const labels = labelsFor(movers, input.players)
  if (s.phaseLeft > 0) return keep({ ...s, motion, labels }, events)
  const caught = movers.length > 0
  return keep(
    {
      ...s,
      phase: 'result',
      phaseLeft: RESULT_SECONDS,
      phaseElapsed: 0,
      motion,
      labels,
      caught,
      lives: caught ? s.lives - 1 : s.lives,
      score: s.score + s.judged.length - movers.length,
      round: s.round + 1,
      freezeSeconds: Math.max(FREEZE_MIN_SECONDS, s.freezeSeconds - FREEZE_SHRINK_SECONDS),
    },
    [...events, caught ? 'caught' : 'safe'],
  )
}

function stepResult(s: StatuesState, input: FrameInput, random: () => number): Step {
  const labels = labelsFor(moversOf(s.judged, s.motion), input.players)
  if (s.phaseLeft > 0) return keep({ ...s, labels })
  if (s.lives <= 0) return { state: { ...s, labels }, events: ['finish'], finished: true }
  return keep(
    { ...s, phase: 'dance', phaseLeft: danceSeconds(random), phaseElapsed: 0, judged: [], motion: {}, labels: [], caught: false },
    ['dance'],
  )
}

function step(state: StatuesState, input: FrameInput, _world: unknown, random: () => number): Step {
  const lastPoses = { ...state.lastPoses, ...Object.fromEntries(input.players.map((p) => [p.id, poseFrame(p)])) }
  const advanced: StatuesState = { ...state, phaseLeft: state.phaseLeft - input.dt, phaseElapsed: state.phaseElapsed + input.dt }
  const result =
    state.phase === 'dance'
      ? stepDance(advanced, input)
      : state.phase === 'freeze'
        ? stepFreeze(advanced, input, state.lastPoses)
        : stepResult(advanced, input, random)
  return { ...result, state: { ...result.state, lastPoses } }
}

export const statuesGame: MiniGame<StatuesState> = {
  id: 'statues',
  titleKey: 'games.statues.title',
  descriptionKey: 'games.statues.description',
  mood: 'upbeat',
  start: (_world, random) => ({
    phase: 'dance',
    phaseLeft: danceSeconds(random),
    phaseElapsed: 0,
    freezeSeconds: FREEZE_START_SECONDS,
    round: 0,
    score: 0,
    lives: INITIAL_LIVES,
    judged: [],
    motion: {},
    lastPoses: {},
    labels: [],
    caught: false,
  }),
  step,
  render: renderStatues,
  status: (state) => ({ score: state.score, lives: state.lives, music: state.phase === 'dance' ? 'on' : 'off' }),
}
```

- [ ] **Step 4: Run it to verify it passes**

Run: `pnpm test src/games/statues.test.ts`
Expected: PASS (15 tests). If a timing test is off by one frame, check that every `dt` in that test is 0.25 or 0.125 (exact in binary floating point) before changing any expectation, and report the change.

- [ ] **Step 5: Commit**

```bash
git add src/games/statues.ts src/games/statues.test.ts src/games/render/statues.ts
git commit -m "feat: add statues game rules (freeze when the music stops)" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 2: Statues rendering, texts, icon, registration

**Files:**
- Modify: `src/games/render/statues.ts` (replace stub)
- Modify: `src/i18n/es.json`, `src/render/icons.ts`, `src/games/registry.ts`

- [ ] **Step 1: Spanish texts**

In `src/i18n/es.json`, inside `games`, after `dodge`, add:

```json
    "statues": {
      "title": "Estatuas",
      "description": "Bailen con la música y congélense cuando pare"
    },
```

and add a top-level section after `workout`:

```json
  "statues": {
    "dance": "¡Bailen!",
    "freeze": "¡Congelados!",
    "moved": "¡Te moviste!",
    "safe": "¡Nadie se movió!",
    "caught": "¡Alguien se movió!"
  },
```

- [ ] **Step 2: Renderer**

Replace `src/games/render/statues.ts` with:

```ts
import type { World } from '../../game/physics'
import { t } from '../../i18n'
import { COLORS, TYPE, drawText, easeOutBack, unit } from '../../render/theme'
import { drawHoldRing, drawPill } from '../../render/widgets'
import type { StatuesState } from '../statues'

/** Below the DOM score chips. */
const BANNER_Y = 0.24
const FROZEN_TINT = 'rgba(125, 211, 252, 0.10)'

function bannerText(state: StatuesState): string {
  if (state.phase === 'dance') return t('statues.dance')
  if (state.phase === 'freeze') return t('statues.freeze')
  return t(state.caught ? 'statues.caught' : 'statues.safe')
}

function drawBanner(ctx: CanvasRenderingContext2D, state: StatuesState, world: World): void {
  const u = unit(world)
  const pop = easeOutBack(Math.min(1, state.phaseElapsed * 4))
  const color = state.phase === 'result' && state.caught ? COLORS.danger : state.phase === 'dance' ? COLORS.accent : COLORS.text
  ctx.save()
  ctx.translate(world.width / 2, world.height * BANNER_Y)
  ctx.scale(pop, pop)
  drawText(ctx, bannerText(state), 0, 0, { size: u * TYPE.display, color, align: 'center', baseline: 'middle', outline: true })
  ctx.restore()
}

/** Countdown ring around the banner while frozen. */
function drawFreezeTimer(ctx: CanvasRenderingContext2D, state: StatuesState, world: World): void {
  const u = unit(world)
  const progress = Math.max(0, state.phaseLeft) / Math.max(0.001, state.freezeSeconds)
  drawHoldRing(ctx, world.width / 2, world.height * (BANNER_Y + 0.13), u * 0.045, progress, u * 0.012)
}

export function renderStatues(ctx: CanvasRenderingContext2D, state: StatuesState, world: World): void {
  if (state.phase !== 'dance') {
    ctx.save()
    ctx.fillStyle = FROZEN_TINT
    ctx.fillRect(0, 0, world.width, world.height)
    ctx.restore()
  }
  drawBanner(ctx, state, world)
  if (state.phase === 'freeze') drawFreezeTimer(ctx, state, world)
  const u = unit(world)
  for (const label of state.labels) {
    drawPill(ctx, t('statues.moved'), label.x, label.y - u * 0.12, {
      size: u * TYPE.body,
      fill: label.color,
      color: COLORS.onAccent,
      align: 'center',
    })
  }
}
```

- [ ] **Step 3: Menu icon**

In `src/render/icons.ts`, extend the union to
`export type IconId = 'ball' | 'bubbles' | 'blade' | 'rock' | 'workout' | 'home' | 'replay' | 'snowflake' | 'pose'`
and add to `PAINTERS` (the `pose` painter is used in Task 4; adding both now keeps the `Record` complete):

```ts
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
```

In `iconForGame`, add `statues: 'snowflake',` and `copyPose: 'pose',` to `byGame`.

- [ ] **Step 4: Register**

In `src/games/registry.ts` add `import { statuesGame } from './statues'` and change the list to
`[keepUpGame, bubblesGame, ninjaGame, dodgeGame, statuesGame, workoutGame]`.

- [ ] **Step 5: Test, build, commit**

Run: `pnpm test && pnpm build`
Expected: PASS, build OK.

```bash
git add src/games/render/statues.ts src/i18n/es.json src/render/icons.ts src/games/registry.ts
git commit -m "feat: draw and register the statues game" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 3: Pose library and matching

**Files:**
- Create: `src/games/poses.ts`
- Test: `src/games/poses.test.ts`

Angles are in **screen space** (canvas, y down): 0° = pointing right, 90° = down, −90° = up, ±180° = left. "Left" means the arm whose shoulder is on the left of the screen, so mirroring and the model's anatomical labels don't matter.

- [ ] **Step 1: Write the failing test**

Create `src/games/poses.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import type { JointName } from '../core/types'
import { POSES, angleDiff, armAngles, matchesPose, poseJoints } from './poses'

const at = { x: 900, y: 400, scale: 200 }

describe('angleDiff', () => {
  it('wraps around ±180°', () => {
    expect(angleDiff(170, -170)).toBeCloseTo(20)
    expect(angleDiff(-90, 90)).toBeCloseTo(180)
    expect(angleDiff(10, 10)).toBe(0)
  })
})

describe('armAngles', () => {
  it('reads screen-space segment angles', () => {
    const tPose = POSES.find((p) => p.id === 'tPose')!
    const angles = armAngles(poseJoints(tPose, at))!
    expect(angleDiff(angles.leftUpper, 180)).toBeLessThan(0.01)
    expect(angleDiff(angles.rightFore, 0)).toBeLessThan(0.01)
  })

  it('uses screen sides, not the anatomical labels', () => {
    const yPose = POSES.find((p) => p.id === 'yPose')!
    const joints = poseJoints(yPose, at)
    const swap: Record<string, JointName> = {
      leftShoulder: 'rightShoulder', rightShoulder: 'leftShoulder',
      leftElbow: 'rightElbow', rightElbow: 'leftElbow',
      leftWrist: 'rightWrist', rightWrist: 'leftWrist',
    }
    const mirroredLabels = Object.fromEntries(Object.entries(joints).map(([k, v]) => [swap[k] ?? k, v]))
    expect(matchesPose(mirroredLabels, yPose)).toBe(true)
  })

  it('is null when an arm joint is missing', () => {
    const partial = Object.fromEntries(Object.entries(poseJoints(POSES[0], at)).filter(([name]) => name !== 'leftWrist'))
    expect(armAngles(partial)).toBeNull()
  })
})

describe('matchesPose', () => {
  it('matches every pose against its own skeleton', () => {
    for (const pose of POSES) expect(matchesPose(poseJoints(pose, at), pose)).toBe(true)
  })

  it('never confuses two different poses', () => {
    for (const a of POSES) {
      for (const b of POSES) {
        if (a.id !== b.id) expect(matchesPose(poseJoints(a, at), b), `${a.id} vs ${b.id}`).toBe(false)
      }
    }
  })

  it('tolerates small errors but not large ones', () => {
    const tPose = POSES.find((p) => p.id === 'tPose')!
    const close = { ...tPose, angles: { ...tPose.angles, leftFore: 180 - 20 } }
    const far = { ...tPose, angles: { ...tPose.angles, leftFore: 180 - 35 } }
    expect(matchesPose(poseJoints(close, at), tPose)).toBe(true)
    expect(matchesPose(poseJoints(far, at), tPose)).toBe(false)
  })
})
```

- [ ] **Step 2: Run it to verify it fails**

Run: `pnpm test src/games/poses.test.ts`
Expected: FAIL, `Failed to resolve import "./poses"`.

- [ ] **Step 3: Implement**

Create `src/games/poses.ts`:

```ts
import type { Joint, JointName } from '../core/types'
import { type Joints, reliableAll } from '../workout/geometry'

/** Arm segments by screen side: upper = shoulder→elbow, fore = elbow→wrist. */
export type ArmSegment = 'leftUpper' | 'leftFore' | 'rightUpper' | 'rightFore'
export const SEGMENTS: readonly ArmSegment[] = ['leftUpper', 'leftFore', 'rightUpper', 'rightFore']

export type PoseId =
  | 'tPose'
  | 'yPose'
  | 'armsUp'
  | 'flex'
  | 'handsOnHead'
  | 'leftUp'
  | 'rightUp'
  | 'diagonalLeft'
  | 'diagonalRight'
  | 'handsOnHips'

export interface TargetPose {
  readonly id: PoseId
  /** Degrees in screen space: 0 right, 90 down, -90 up, 180 left. */
  readonly angles: Readonly<Record<ArmSegment, number>>
}

export const TOLERANCE_DEG = 25

function pose(id: PoseId, leftUpper: number, leftFore: number, rightUpper: number, rightFore: number): TargetPose {
  return { id, angles: { leftUpper, leftFore, rightUpper, rightFore } }
}

/** Upper-body only, so they work in small rooms. Pairwise distinct beyond the tolerance (tested). */
export const POSES: readonly TargetPose[] = [
  pose('tPose', 180, 180, 0, 0),
  pose('yPose', -135, -135, -45, -45),
  pose('armsUp', -90, -90, -90, -90),
  pose('flex', 180, -90, 0, -90),
  pose('handsOnHead', -150, -30, -30, -150),
  pose('leftUp', -90, -90, 90, 90),
  pose('rightUp', 90, 90, -90, -90),
  pose('diagonalLeft', -135, -135, 45, 45),
  pose('diagonalRight', 135, 135, -45, -45),
  pose('handsOnHips', 135, 45, 45, 135),
]

/** Smallest absolute difference between two angles, 0..180. */
export function angleDiff(a: number, b: number): number {
  const d = Math.abs(a - b) % 360
  return d > 180 ? 360 - d : d
}

type Point = Readonly<{ x: number; y: number }>
const degrees = (from: Point, to: Point): number => (Math.atan2(to.y - from.y, to.x - from.x) * 180) / Math.PI

const ARM_JOINTS = ['leftShoulder', 'rightShoulder', 'leftElbow', 'rightElbow', 'leftWrist', 'rightWrist'] as const

export function armAngles(joints: Joints): Record<ArmSegment, number> | null {
  const j = reliableAll(joints, ARM_JOINTS)
  if (!j) return null
  const anatomicalLeftOnScreenLeft = j.leftShoulder.x <= j.rightShoulder.x
  const a = { shoulder: j.leftShoulder, elbow: j.leftElbow, wrist: j.leftWrist }
  const b = { shoulder: j.rightShoulder, elbow: j.rightElbow, wrist: j.rightWrist }
  const [left, right] = anatomicalLeftOnScreenLeft ? [a, b] : [b, a]
  return {
    leftUpper: degrees(left.shoulder, left.elbow),
    leftFore: degrees(left.elbow, left.wrist),
    rightUpper: degrees(right.shoulder, right.elbow),
    rightFore: degrees(right.elbow, right.wrist),
  }
}

export function matchesPose(joints: Joints, target: TargetPose, tolerance: number = TOLERANCE_DEG): boolean {
  const angles = armAngles(joints)
  return angles !== null && SEGMENTS.every((s) => angleDiff(angles[s], target.angles[s]) <= tolerance)
}

const HALF_SHOULDERS = 0.4
const UPPER_ARM = 0.9
const FOREARM = 0.8

/**
 * Skeleton (head, shoulders, arms, hips) for a target pose: used to draw the
 * reference silhouette and as a test fixture. `scale` = pixels per body unit
 * (torso length = 1); (x, y) = shoulder midpoint. Screen-left side uses the
 * `left*` joint names.
 */
export function poseJoints(target: TargetPose, at: { x: number; y: number; scale: number }): Partial<Record<JointName, Joint>> {
  const p = (x: number, y: number): Joint => ({ x: at.x + x * at.scale, y: at.y + y * at.scale, score: 0.9 })
  const along = (from: Joint, deg: number, length: number): Joint => {
    const r = (deg * Math.PI) / 180
    return { x: from.x + Math.cos(r) * length * at.scale, y: from.y + Math.sin(r) * length * at.scale, score: 0.9 }
  }
  const leftShoulder = p(-HALF_SHOULDERS, 0)
  const rightShoulder = p(HALF_SHOULDERS, 0)
  const leftElbow = along(leftShoulder, target.angles.leftUpper, UPPER_ARM)
  const rightElbow = along(rightShoulder, target.angles.rightUpper, UPPER_ARM)
  return {
    nose: p(0, -0.45),
    leftShoulder,
    rightShoulder,
    leftElbow,
    rightElbow,
    leftWrist: along(leftElbow, target.angles.leftFore, FOREARM),
    rightWrist: along(rightElbow, target.angles.rightFore, FOREARM),
    leftHip: p(-0.25, 1),
    rightHip: p(0.25, 1),
  }
}
```

- [ ] **Step 4: Run it to verify it passes**

Run: `pnpm test src/games/poses.test.ts`
Expected: PASS (7 tests). If "never confuses two different poses" fails, report the offending pair; do not loosen the test.

- [ ] **Step 5: Commit**

```bash
git add src/games/poses.ts src/games/poses.test.ts
git commit -m "feat: add arm pose library with screen-space angle matching" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 4: Copy-the-pose rules

**Files:**
- Create: `src/games/copyPose.ts` (+ stub `src/games/render/copyPose.ts`: `export function renderCopyPose(): void {}`)
- Test: `src/games/copyPose.test.ts`

- [ ] **Step 1: Write the failing test**

Create `src/games/copyPose.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import type { Player } from '../core/types'
import { worldFor } from '../game/physics'
import { player } from '../workout/__fixtures__/skeleton'
import {
  type CopyPoseState,
  HOLD_MS,
  INITIAL_LIVES,
  RESULT_SECONDS,
  ROUND_MIN_SECONDS,
  ROUND_START_SECONDS,
  copyPoseGame,
  nextPoseIndex,
} from './copyPose'
import { POSES, poseJoints } from './poses'

const world = worldFor(1920, 1080)
const random = () => 0 // first pose = POSES[0]
const DT = 0.125
const at = { x: 900, y: 400, scale: 200 }

const doing = (id: number, poseIndex: number): Player => player(id, poseJoints(POSES[poseIndex], at))
/** Any pose other than the target. */
const wrong = (id: number, poseIndex: number): Player => doing(id, (poseIndex + 1) % POSES.length)

function run(state: CopyPoseState, frames: Player[][]): { state: CopyPoseState; events: string[]; finished: boolean } {
  return frames.reduce(
    (acc, players) => {
      const r = copyPoseGame.step(acc.state, { players, dt: DT, now: 0 }, world, random)
      return { state: r.state, events: [...acc.events, ...r.events], finished: r.finished }
    },
    { state, events: [] as string[], finished: false },
  )
}

const frames = (n: number, players: Player[]): Player[][] => Array.from({ length: n }, () => players)
const holdFrames = HOLD_MS / 1000 / DT // 8

describe('nextPoseIndex', () => {
  it('never repeats the previous pose', () => {
    for (let previous = 0; previous < POSES.length; previous += 1) {
      for (const r of [0, 0.3, 0.5, 0.999]) {
        const next = nextPoseIndex(previous, () => r)
        expect(next).not.toBe(previous)
        expect(next).toBeGreaterThanOrEqual(0)
        expect(next).toBeLessThan(POSES.length)
      }
    }
  })
})

describe('copy the pose', () => {
  const start = () => copyPoseGame.start(world, random)

  it('starts a round with full time and lives', () => {
    const s = start()
    expect(s.phase).toBe('pose')
    expect(s.poseIndex).toBe(0)
    expect(copyPoseGame.status(s)).toEqual({ score: 0, lives: INITIAL_LIVES, secondsLeft: ROUND_START_SECONDS })
  })

  it('scores a player once after holding the pose for 1 s', () => {
    const r = run(start(), frames(holdFrames + 4, [doing(1, 0)]))
    expect(r.events.filter((e) => e === 'match')).toHaveLength(1)
    expect(r.state.score).toBe(1)
    expect(r.state.badges[0]).toMatchObject({ playerId: 1, done: true, progress: 1 })
  })

  it('forgives a short break in the hold', () => {
    const r = run(start(), [...frames(4, [doing(1, 0)]), ...frames(2, [wrong(1, 0)]), ...frames(4, [doing(1, 0)])])
    expect(r.state.score).toBe(1)
  })

  it('restarts the hold after a long break', () => {
    const r = run(start(), [...frames(4, [doing(1, 0)]), ...frames(3, [wrong(1, 0)]), ...frames(4, [doing(1, 0)])])
    expect(r.state.score).toBe(0)
  })

  it('costs a life when nobody matches before time runs out', () => {
    const r = run(start(), frames(ROUND_START_SECONDS / DT, [wrong(1, 0)]))
    expect(r.state.phase).toBe('result')
    expect(r.events.at(-1)).toBe('miss')
    expect(r.state.lives).toBe(INITIAL_LIVES - 1)
  })

  it('keeps the lives when anyone matched', () => {
    const r = run(start(), [...frames(holdFrames, [doing(1, 0), wrong(2, 0)]), ...frames(ROUND_START_SECONDS / DT - holdFrames, [wrong(1, 0)])])
    expect(r.events.at(-1)).toBe('roundClear')
    expect(r.state.lives).toBe(INITIAL_LIVES)
  })

  it('moves to a different pose with less time after the result', () => {
    const missed = run(start(), frames(ROUND_START_SECONDS / DT, [wrong(1, 0)])).state
    const next = run(missed, frames(RESULT_SECONDS / DT, [wrong(1, 0)]))
    expect(next.events).toEqual(['pose'])
    expect(next.state.phase).toBe('pose')
    expect(next.state.poseIndex).not.toBe(0)
    expect(next.state.roundSeconds).toBeCloseTo(ROUND_START_SECONDS - 0.25)
    expect(next.state.score).toBe(0)
  })

  it(`never gives less than ${ROUND_MIN_SECONDS} s per pose`, () => {
    const s: CopyPoseState = { ...start(), phase: 'result', phaseLeft: DT / 2, roundSeconds: ROUND_MIN_SECONDS }
    expect(run(s, [[wrong(1, 0)]]).state.roundSeconds).toBe(ROUND_MIN_SECONDS)
  })

  it('ends after the result of the round that took the last life', () => {
    const s: CopyPoseState = { ...start(), lives: 1, phaseLeft: DT / 2 }
    const lost = run(s, [[wrong(1, 0)]])
    expect(lost.state.lives).toBe(0)
    expect(lost.finished).toBe(false)
    expect(run(lost.state, frames(RESULT_SECONDS / DT, [wrong(1, 0)])).finished).toBe(true)
  })
})
```

- [ ] **Step 2: Run it to verify it fails**

Run: `pnpm test src/games/copyPose.test.ts`
Expected: FAIL, `Failed to resolve import "./copyPose"`.

- [ ] **Step 3: Implement**

Create the stub `src/games/render/copyPose.ts` with `export function renderCopyPose(): void {}`, then `src/games/copyPose.ts`:

```ts
import type { FrameInput, MiniGame, Player, StepResult } from '../core/types'
import { headAnchor } from '../workout/state'
import { POSES, matchesPose } from './poses'
import { renderCopyPose } from './render/copyPose'

export interface PlayerHold {
  /** Matching time accumulated this round. */
  readonly holdMs: number
  /** Time since the last matching frame. */
  readonly missMs: number
}

export interface PoseBadge {
  readonly playerId: number
  readonly color: string
  readonly x: number
  readonly y: number
  /** 0..1 toward HOLD_MS. */
  readonly progress: number
  readonly done: boolean
}

export interface CopyPoseState {
  readonly phase: 'pose' | 'result'
  readonly poseIndex: number
  readonly phaseLeft: number
  readonly roundSeconds: number
  readonly round: number
  readonly score: number
  readonly lives: number
  readonly holds: Readonly<Record<number, PlayerHold>>
  readonly scored: readonly number[]
  readonly badges: readonly PoseBadge[]
}

export const INITIAL_LIVES = 3
export const ROUND_START_SECONDS = 5
export const ROUND_MIN_SECONDS = 3
export const ROUND_SHRINK_SECONDS = 0.25
export const HOLD_MS = 1000
/** A hold survives losing the pose for this long (model flicker, small wobble). */
export const BREAK_MS = 250
export const RESULT_SECONDS = 1

/** Random pose index different from `previous`. */
export function nextPoseIndex(previous: number, random: () => number): number {
  const i = Math.floor(random() * (POSES.length - 1))
  return i >= previous ? i + 1 : i
}

function updateHold(hold: PlayerHold, matching: boolean, dtMs: number): PlayerHold {
  if (matching) return { holdMs: hold.holdMs + dtMs, missMs: 0 }
  const missMs = hold.missMs + dtMs
  return { holdMs: missMs > BREAK_MS ? 0 : hold.holdMs, missMs }
}

function badgesFor(players: readonly Player[], holds: CopyPoseState['holds'], scored: readonly number[]): PoseBadge[] {
  return players.flatMap((p) => {
    const head = headAnchor(p)
    if (!head) return []
    const done = scored.includes(p.id)
    const progress = done ? 1 : Math.min(1, (holds[p.id]?.holdMs ?? 0) / HOLD_MS)
    return [{ playerId: p.id, color: p.color, x: head.x, y: head.y, progress, done }]
  })
}

type Step = StepResult<CopyPoseState>

function stepPose(state: CopyPoseState, input: FrameInput): Step {
  const target = POSES[state.poseIndex]
  const dtMs = input.dt * 1000
  const holds: Record<number, PlayerHold> = { ...state.holds }
  const scored = [...state.scored]
  const events: string[] = []
  for (const p of input.players) {
    if (scored.includes(p.id)) continue
    const hold = updateHold(holds[p.id] ?? { holdMs: 0, missMs: 0 }, matchesPose(p.joints, target), dtMs)
    holds[p.id] = hold
    if (hold.holdMs >= HOLD_MS) {
      scored.push(p.id)
      events.push('match')
    }
  }
  const score = state.score + scored.length - state.scored.length
  const phaseLeft = state.phaseLeft - input.dt
  const badges = badgesFor(input.players, holds, scored)
  const next: CopyPoseState = { ...state, holds, scored, score, phaseLeft, badges }
  if (phaseLeft > 0) return { state: next, events, finished: false }
  const missed = scored.length === 0
  return {
    state: { ...next, phase: 'result', phaseLeft: RESULT_SECONDS, round: state.round + 1, lives: missed ? state.lives - 1 : state.lives },
    events: [...events, missed ? 'miss' : 'roundClear'],
    finished: false,
  }
}

function stepResult(state: CopyPoseState, input: FrameInput, random: () => number): Step {
  const phaseLeft = state.phaseLeft - input.dt
  const badges = badgesFor(input.players, state.holds, state.scored)
  if (phaseLeft > 0) return { state: { ...state, phaseLeft, badges }, events: [], finished: false }
  if (state.lives <= 0) return { state: { ...state, phaseLeft: 0, badges }, events: ['finish'], finished: true }
  const roundSeconds = Math.max(ROUND_MIN_SECONDS, state.roundSeconds - ROUND_SHRINK_SECONDS)
  return {
    state: {
      ...state,
      phase: 'pose',
      poseIndex: nextPoseIndex(state.poseIndex, random),
      phaseLeft: roundSeconds,
      roundSeconds,
      holds: {},
      scored: [],
      badges: [],
    },
    events: ['pose'],
    finished: false,
  }
}

export const copyPoseGame: MiniGame<CopyPoseState> = {
  id: 'copyPose',
  titleKey: 'games.copyPose.title',
  descriptionKey: 'games.copyPose.description',
  mood: 'calm',
  start: (_world, random) => ({
    phase: 'pose',
    poseIndex: Math.floor(random() * POSES.length),
    phaseLeft: ROUND_START_SECONDS,
    roundSeconds: ROUND_START_SECONDS,
    round: 0,
    score: 0,
    lives: INITIAL_LIVES,
    holds: {},
    scored: [],
    badges: [],
  }),
  step: (state, input, _world, random) => (state.phase === 'pose' ? stepPose(state, input) : stepResult(state, input, random)),
  render: renderCopyPose,
  status: (state) => ({
    score: state.score,
    lives: state.lives,
    secondsLeft: state.phase === 'pose' ? Math.max(0, Math.ceil(state.phaseLeft)) : 0,
  }),
}
```

- [ ] **Step 4: Run it to verify it passes**

Run: `pnpm test src/games/copyPose.test.ts`
Expected: PASS (10 tests).

- [ ] **Step 5: Commit**

```bash
git add src/games/copyPose.ts src/games/copyPose.test.ts src/games/render/copyPose.ts
git commit -m "feat: add copy-the-pose game rules" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 5: Copy-the-pose rendering, texts, registration

**Files:**
- Modify: `src/games/render/copyPose.ts` (replace stub), `src/i18n/es.json`, `src/games/registry.ts`

- [ ] **Step 1: Spanish texts**

In `src/i18n/es.json`, inside `games` after `statues`, add:

```json
    "copyPose": {
      "title": "Copia la pose",
      "description": "Imiten la figura y sosténganla un segundo"
    },
```

and a top-level section after `statues`:

```json
  "copyPose": {
    "copy": "Copien la pose",
    "nice": "¡Bien!",
    "miss": "Nadie la logró"
  },
```

- [ ] **Step 2: Renderer**

Replace `src/games/render/copyPose.ts` with:

```ts
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
    drawText(ctx, t('copyPose.nice'), badge.x, y, {
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
```

- [ ] **Step 3: Register**

In `src/games/registry.ts` add `import { copyPoseGame } from './copyPose'` and make the list
`[keepUpGame, bubblesGame, ninjaGame, dodgeGame, statuesGame, copyPoseGame, workoutGame]`.

- [ ] **Step 4: Test, build, commit**

Run: `pnpm test && pnpm build`
Expected: PASS, build OK.

```bash
git add src/games/render/copyPose.ts src/i18n/es.json src/games/registry.ts
git commit -m "feat: draw and register the copy-the-pose game" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 6: Verification and README

- [ ] **Step 1: Headless check** (dev server `http://localhost:5199`, Playwright script in `/tmp/gc-verify`)

Menu shows 7 tiles including "Estatuas" (snowflake) and "Copia la pose" (figure); tapping each starts its countdown, then the game screen draws (banner "¡Bailen!" / reference card) with no console errors.

- [ ] **Step 2: In-person check (human)**

Statues: music plays, stops, "¡Congelados!" shows; moving after ~0.5 s shows "¡Te moviste!" above that person and costs a life; staying still scores. Copy the pose: holding the figure fills the ring above your head and shows "¡Bien!". If `MOVE_THRESHOLD` feels too strict or loose, note the observed behavior — tuning it is a follow-up. If not possible, report **not verified in person**.

- [ ] **Step 3: README**

In the games table of `README.md`, add a row before the workout/results row:

```markdown
| **Estatuas (statues).** Dance while the music plays. When it stops, freeze: anyone who moves costs the team a life, and gets called out in their color. | **Copia la pose (copy the pose).** A figure shows an arm pose; copy it and hold it for a second. Uses only the upper body, so it works in small rooms. |
```

(no screenshots yet: use a text-only row).

- [ ] **Step 4: Commit**

```bash
git add README.md
git commit -m "docs: document statues and copy-the-pose" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```
