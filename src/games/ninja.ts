import type { Player, FrameInput, MiniGame, StepResult } from '../core/types'
import type { Collider, World } from '../game/physics'
import { FLASH_LIFETIME, FRUIT_STYLE_COUNT, HALF_LIFETIME, SLASH_LIFETIME, renderNinja } from './render/ninja'

export { FLASH_LIFETIME, HALF_LIFETIME }

export type ItemKind = 'fruit' | 'bomb'

export interface Item {
  readonly id: number
  readonly kind: ItemKind
  /** Fruit look index (ignored for bombs). */
  readonly style: number
  readonly x: number
  readonly y: number
  readonly vx: number
  readonly vy: number
  readonly r: number
}

/** One half of a sliced fruit, kept in state for the visual effect only. */
export interface Half {
  readonly id: number
  readonly style: number
  readonly side: -1 | 1
  readonly x: number
  readonly y: number
  readonly vx: number
  readonly vy: number
  readonly r: number
  readonly angle: number
  readonly spin: number
  /** Seconds since the slice. */
  readonly age: number
}

export interface Flash {
  readonly x: number
  readonly y: number
  readonly r: number
  readonly age: number
}

/** Brief swipe trail left where a fruit was sliced (visual only). */
export interface Slash {
  readonly x: number
  readonly y: number
  readonly r: number
  /** Direction of the slicing hand, radians. */
  readonly angle: number
  readonly age: number
}

export interface NinjaState {
  readonly items: readonly Item[]
  readonly halves: readonly Half[]
  readonly flashes: readonly Flash[]
  /** Visual only; absent means none. */
  readonly slashes?: readonly Slash[]
  readonly score: number
  readonly lives: number
  readonly nextId: number
  /** Seconds until the next wave is tossed. */
  readonly spawnTimer: number
  /** Seconds since the round started. */
  readonly elapsed: number
}

export const INITIAL_LIVES = 3
const GRAVITY_FACTOR = 0.7
const BASE_INTERVAL = 1.5
const MIN_INTERVAL = 0.5
const MAX_WAVE = 4
const BASE_BOMB_CHANCE = 0.15
const MAX_BOMB_CHANCE = 0.3

const unit = (world: World): number => Math.min(world.width, world.height)
export const fruitRadius = (world: World): number => unit(world) * 0.06
export const sliceSpeed = (world: World): number => world.height * 0.8
const gravityOf = (world: World): number => world.gravity * GRAVITY_FACTOR

export function bombChance(elapsed: number): number {
  return Math.min(MAX_BOMB_CHANCE, BASE_BOMB_CHANCE + elapsed * 0.001)
}

export function spawnInterval(elapsed: number, players: number): number {
  const base = Math.max(MIN_INTERVAL, BASE_INTERVAL - elapsed * 0.01)
  return Math.max(MIN_INTERVAL * 0.6, base / (1 + 0.2 * Math.max(0, players - 1)))
}

export function spawnItem(id: number, elapsed: number, world: World, random: () => number): Item {
  const r = fruitRadius(world)
  const x = world.width * (0.15 + random() * 0.7)
  const apex = world.height * (0.5 + random() * 0.35)
  const vy = -Math.sqrt(2 * gravityOf(world) * apex)
  const vx = (world.width / 2 - x) * (0.2 + random() * 0.4)
  const isBomb = random() < bombChance(elapsed)
  return {
    id,
    kind: isBomb ? 'bomb' : 'fruit',
    style: Math.floor(random() * FRUIT_STYLE_COUNT) % FRUIT_STYLE_COUNT,
    x,
    y: world.height + r,
    vx,
    vy,
    r,
  }
}

/** Direction of the first fast hand touching the item, or null when it is not sliced. */
function sliceAngle(item: Item, hands: readonly Collider[], threshold: number): number | null {
  const hand = hands.find(
    (h) => Math.hypot(h.vx, h.vy) >= threshold && Math.hypot(item.x - h.x, item.y - h.y) < item.r + h.r,
  )
  return hand ? Math.atan2(hand.vy, hand.vx) : null
}

function allHands(players: readonly Player[]): Collider[] {
  return players.flatMap((p) => [...p.hands])
}

function makeHalves(item: Item, firstId: number, random: () => number): Half[] {
  return ([-1, 1] as const).map((side, i) => ({
    id: firstId + i,
    style: item.style,
    side,
    x: item.x,
    y: item.y,
    vx: item.vx + side * item.r * 3,
    vy: item.vy * 0.3,
    r: item.r,
    angle: random() * Math.PI,
    spin: side * (2 + random() * 3),
    age: 0,
  }))
}

function moveItem(item: Item, gravity: number, dt: number): Item {
  const vy = item.vy + gravity * dt
  return { ...item, x: item.x + item.vx * dt, y: item.y + vy * dt, vy }
}

function moveHalf(half: Half, gravity: number, dt: number): Half {
  const vy = half.vy + gravity * dt
  return { ...half, x: half.x + half.vx * dt, y: half.y + vy * dt, vy, angle: half.angle + half.spin * dt, age: half.age + dt }
}

function spawnWave(state: NinjaState, players: number, world: World, random: () => number) {
  const count = Math.min(MAX_WAVE, 1 + Math.floor(random() * (1 + Math.ceil(players / 2) + Math.floor(state.elapsed / 40))))
  const spawned: Item[] = []
  for (let i = 0; i < count; i += 1) spawned.push(spawnItem(state.nextId + i, state.elapsed, world, random))
  return { spawned, nextId: state.nextId + count }
}

function step(state: NinjaState, input: FrameInput, world: World, random: () => number): StepResult<NinjaState> {
  const events: string[] = []
  const gravity = gravityOf(world)
  const hands = allHands(input.players)
  const threshold = sliceSpeed(world)
  let score = state.score
  let lives = state.lives
  let nextId = state.nextId
  const items: Item[] = []
  const halves = state.halves.map((h) => moveHalf(h, gravity, input.dt)).filter((h) => h.age < HALF_LIFETIME)
  const slashes = (state.slashes ?? []).map((l) => ({ ...l, age: l.age + input.dt })).filter((l) => l.age < SLASH_LIFETIME)
  const flashes = state.flashes.map((f) => ({ ...f, age: f.age + input.dt })).filter((f) => f.age < FLASH_LIFETIME)

  for (const item of state.items) {
    const next = moveItem(item, gravity, input.dt)
    const angle = sliceAngle(next, hands, threshold)
    if (angle !== null) {
      if (next.kind === 'bomb') {
        lives -= 1
        flashes.push({ x: next.x, y: next.y, r: next.r * 3, age: 0 })
        events.push('bomb')
      } else {
        score += 1
        slashes.push({ x: next.x, y: next.y, r: next.r, angle, age: 0 })
        halves.push(...makeHalves(next, nextId, random))
        nextId += 2
        events.push('slice')
      }
    } else if (next.vy > 0 && next.y - next.r > world.height) {
      continue
    } else {
      items.push(next)
    }
  }

  const elapsed = state.elapsed + input.dt
  let spawnTimer = state.spawnTimer - input.dt
  if (spawnTimer <= 0 && lives > 0) {
    const wave = spawnWave({ ...state, elapsed, nextId }, input.players.length, world, random)
    items.push(...wave.spawned)
    nextId = wave.nextId
    spawnTimer = spawnInterval(elapsed, input.players.length)
  }

  const finished = lives <= 0
  const nextState: NinjaState = { items, halves, flashes, slashes, score, lives: Math.max(0, lives), nextId, spawnTimer, elapsed }
  return { state: nextState, events, finished }
}

export const ninjaGame: MiniGame<NinjaState> = {
  id: 'ninja',
  titleKey: 'games.ninja.title',
  descriptionKey: 'games.ninja.description',
  start: () => ({
    items: [],
    halves: [],
    flashes: [],
    slashes: [],
    score: 0,
    lives: INITIAL_LIVES,
    nextId: 1,
    spawnTimer: 0.6,
    elapsed: 0,
  }),
  step,
  render: renderNinja,
  status: (state) => ({ score: state.score, lives: state.lives }),
}
