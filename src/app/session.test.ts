import { describe, expect, it } from 'vitest'
import type { AnyMiniGame, FrameInput, MiniGame, Player } from '../core/types'
import { worldFor } from '../game/physics'
import { COUNTDOWN_MS, type Controls, type KeyCommand, type Session, createSession, stepSession } from './session'
import { HOVER_SELECT_MS, IN_GAME_HOLD_MS, type Zone, layoutGameOver, layoutInGameMenu, layoutMenu } from './zones'

const world = worldFor(1920, 1080)

/** Fake game: finishes when the score reaches 3, one point per frame. */
const counter: MiniGame<{ n: number }> = {
  id: 'counter',
  titleKey: 't',
  descriptionKey: 'd',
  start: () => ({ n: 0 }),
  step: (s) => ({ state: { n: s.n + 1 }, events: [], finished: s.n + 1 >= 3 }),
  render: () => undefined,
  status: (s) => ({ score: s.n }),
}
const other: MiniGame<{ n: number }> = { ...counter, id: 'other' }
const games = [counter, other] as readonly AnyMiniGame[]

function handAt(x: number, y: number): Player {
  const hand = { x, y, vx: 0, vy: 0, r: 10 }
  return { id: 1, color: '#fff', joints: {}, colliders: [hand], hands: [hand], head: null }
}
const center = (z: Zone) => ({ x: z.x + z.w / 2, y: z.y + z.h / 2 })
const input = (players: Player[] = [], dt = 1 / 60): FrameInput => ({ players, dt, now: 0 })
const keys = (...k: KeyCommand[]): Controls => ({ keys: k, taps: [] })
const tap = (z: Zone): Controls => ({ keys: [], taps: [center(z)] })

function run(session: Session, frames: number, frame: FrameInput, controls?: Controls): Session {
  let s = session
  for (let i = 0; i < frames; i++) s = stepSession(s, games, frame, world, i === 0 ? controls : undefined).session
  return s
}

function playing(): Session {
  const counting = stepSession(createSession({}), games, input(), world, keys('confirm')).session
  return run(counting, 1, input([], COUNTDOWN_MS / 1000))
}

describe('menu', () => {
  it('selects a game by holding a hand over its card', () => {
    const card = layoutMenu(world, ['counter', 'other'])[1]
    const hand = [handAt(center(card).x, center(card).y)]
    const entered = run(createSession({}), 1, input(hand))
    const almost = run(entered, 1, input(hand, (HOVER_SELECT_MS - 100) / 1000))
    expect(almost.screen.kind).toBe('menu')
    const picked = run(almost, 1, input(hand, 0.2))
    expect(picked.screen).toMatchObject({ kind: 'countdown', gameIndex: 1 })
  })

  it('selects a game instantly with a tap (phone touch / mouse)', () => {
    const card = layoutMenu(world, ['counter', 'other'])[1]
    expect(run(createSession({}), 1, input(), tap(card)).screen).toMatchObject({ kind: 'countdown', gameIndex: 1 })
  })

  it('supports arrows + Enter (TV remote / keyboard)', () => {
    const s = stepSession(createSession({}), games, input(), world, keys('right', 'confirm')).session
    expect(s.screen).toMatchObject({ kind: 'countdown', gameIndex: 1 })
  })
})

describe('back to menu while playing', () => {
  const [menuButton] = layoutInGameMenu(world)

  it('needs a longer hand hold than menu cards, so passing hands do not quit', () => {
    const hand = [handAt(center(menuButton).x, center(menuButton).y)]
    const entered = run(playing(), 1, input(hand))
    const brief = run(entered, 1, input(hand, HOVER_SELECT_MS / 1000))
    expect(brief.screen.kind).toBe('playing')
    const held = run(brief, 1, input(hand, (IN_GAME_HOLD_MS - HOVER_SELECT_MS + 50) / 1000))
    expect(held.screen.kind).toBe('menu')
  })

  it('leaves immediately on tap or Escape, also during the countdown', () => {
    expect(run(playing(), 1, input(), tap(menuButton)).screen.kind).toBe('menu')
    expect(run(playing(), 1, input(), keys('back')).screen.kind).toBe('menu')
    const counting = stepSession(createSession({}), games, input(), world, keys('confirm')).session
    expect(run(counting, 1, input(), tap(menuButton)).screen.kind).toBe('menu')
  })

  it('does not record a score when quitting mid-game', () => {
    const quit = stepSession(run(playing(), 1, input()), games, input(), world, keys('back'))
    expect(quit.events).not.toContain('gameOver')
    expect(quit.session.bests).toEqual({})
  })
})

describe('round lifecycle', () => {
  it('counts down, plays, then records a new best', () => {
    const next = (s: Session) => stepSession(s, games, input(), world)
    const last = next(next(next(playing()).session).session)
    expect(last.session.screen).toMatchObject({ kind: 'gameOver', score: 3, newBest: true })
    expect(last.session.bests.counter).toBe(3)
    expect(last.events).toContain('gameOver')
  })

  it('replays or returns to the menu from the game-over screen', () => {
    const over: Session = { bests: {}, screen: { kind: 'gameOver', gameIndex: 0, score: 1, newBest: false, hover: null, focus: 0 } }
    const [again, menu] = layoutGameOver(world)
    const hold = (z: Zone) => input([handAt(z.x + 5, z.y + 5)], 0.5)
    expect(run(over, 4, hold(again)).screen.kind).toBe('countdown')
    expect(run(over, 4, hold(menu)).screen.kind).toBe('menu')
    expect(run(over, 1, input(), tap(menu)).screen.kind).toBe('menu')
  })
})

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
