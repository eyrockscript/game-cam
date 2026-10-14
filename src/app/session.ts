import type { AnyMiniGame, FrameInput } from '../core/types'
import type { World } from '../game/physics'
import {
  type Hover,
  IN_GAME_HOLD_MS,
  MENU,
  PLAY_AGAIN,
  type Point,
  layoutGameOver,
  layoutInGameMenu,
  layoutMenu,
  tappedZone,
  updateHover,
} from './zones'

export const COUNTDOWN_MS = 3000

export type Screen =
  | { readonly kind: 'menu'; readonly hover: Hover | null; readonly focus: number }
  | {
      readonly kind: 'countdown'
      readonly gameIndex: number
      readonly msLeft: number
      readonly menuHover: Hover | null
    }
  | {
      readonly kind: 'playing'
      readonly gameIndex: number
      readonly state: unknown
      readonly menuHover: Hover | null
    }
  | {
      readonly kind: 'gameOver'
      readonly gameIndex: number
      readonly score: number
      readonly newBest: boolean
      readonly hover: Hover | null
      readonly focus: number
    }

export interface Session {
  readonly screen: Screen
  /** Best score per game id. */
  readonly bests: Readonly<Record<string, number>>
}

/** Remote/keyboard commands (arrows + Enter + Escape). */
export type KeyCommand = 'left' | 'right' | 'confirm' | 'back'

/** Non-body input collected since the previous frame. */
export interface Controls {
  readonly keys: readonly KeyCommand[]
  /** Touch/mouse taps in canvas pixels. */
  readonly taps: readonly Point[]
}

export const NO_CONTROLS: Controls = { keys: [], taps: [] }

export interface SessionStep {
  readonly session: Session
  /** 'gameOver' signals that bests changed and should be persisted. */
  readonly events: readonly string[]
}

export function createSession(bests: Record<string, number>): Session {
  return { screen: { kind: 'menu', hover: null, focus: 0 }, bests }
}

function menuScreen(focus = 0): Screen {
  return { kind: 'menu', hover: null, focus }
}

function countdown(gameIndex: number): Screen {
  return { kind: 'countdown', gameIndex, msLeft: COUNTDOWN_MS, menuHover: null }
}

function allHands(input: FrameInput): Point[] {
  return input.players.flatMap((p) => p.hands)
}

function moveFocus(focus: number, count: number, keys: readonly KeyCommand[]): number {
  return keys.reduce((f, k) => (k === 'left' ? (f + count - 1) % count : k === 'right' ? (f + 1) % count : f), focus)
}

/** Shared by countdown and playing: the corner "Menú" button (hand hold, tap, or Escape). */
function wantsMenu(
  menuHover: Hover | null,
  input: FrameInput,
  world: World,
  controls: Controls,
): { leave: boolean; menuHover: Hover | null } {
  const zones = layoutInGameMenu(world)
  if (controls.keys.includes('back') || tappedZone(zones, controls.taps)) return { leave: true, menuHover: null }
  const { hover, selected } = updateHover(menuHover, zones, allHands(input), input.dt * 1000, IN_GAME_HOLD_MS)
  return { leave: selected !== null, menuHover: hover }
}

function stepMenu(session: Session, games: readonly AnyMiniGame[], input: FrameInput, world: World, controls: Controls): Session {
  if (session.screen.kind !== 'menu') return session
  const focus = moveFocus(session.screen.focus, games.length, controls.keys)
  const zones = layoutMenu(world, games.map((g) => g.id))
  const { hover, selected } = updateHover(session.screen.hover, zones, allHands(input), input.dt * 1000)
  const chosenId = tappedZone(zones, controls.taps) ?? selected
  const picked = chosenId ? games.findIndex((g) => g.id === chosenId) : controls.keys.includes('confirm') ? focus : -1
  if (picked >= 0) return { ...session, screen: countdown(picked) }
  return { ...session, screen: { kind: 'menu', hover, focus } }
}

function stepCountdown(
  session: Session,
  games: readonly AnyMiniGame[],
  input: FrameInput,
  world: World,
  controls: Controls,
  random: () => number,
): Session {
  if (session.screen.kind !== 'countdown') return session
  const { leave, menuHover } = wantsMenu(session.screen.menuHover, input, world, controls)
  if (leave) return { ...session, screen: menuScreen(session.screen.gameIndex) }
  const msLeft = session.screen.msLeft - input.dt * 1000
  const { gameIndex } = session.screen
  if (msLeft > 0) return { ...session, screen: { kind: 'countdown', gameIndex, msLeft, menuHover } }
  const state = games[gameIndex].start(world, random, { framing: input.framing ?? 'full' })
  return { ...session, screen: { kind: 'playing', gameIndex, state, menuHover: null } }
}

function stepPlaying(
  session: Session,
  games: readonly AnyMiniGame[],
  input: FrameInput,
  world: World,
  controls: Controls,
  random: () => number,
): SessionStep {
  if (session.screen.kind !== 'playing') return { session, events: [] }
  const { gameIndex } = session.screen
  const { leave, menuHover } = wantsMenu(session.screen.menuHover, input, world, controls)
  if (leave) return { session: { ...session, screen: menuScreen(gameIndex) }, events: [] }
  const game = games[gameIndex]
  const result = game.step(session.screen.state, input, world, random)
  if (!result.finished) {
    const screen: Screen = { kind: 'playing', gameIndex, state: result.state, menuHover }
    return { session: { ...session, screen }, events: result.events }
  }
  const score = game.status(result.state).score
  const previousBest = session.bests[game.id] ?? 0
  const bests = { ...session.bests, [game.id]: Math.max(previousBest, score) }
  const screen: Screen = { kind: 'gameOver', gameIndex, score, newBest: score > previousBest, hover: null, focus: 0 }
  return { session: { screen, bests }, events: [...result.events, 'gameOver'] }
}

function stepGameOver(session: Session, input: FrameInput, world: World, controls: Controls): Session {
  if (session.screen.kind !== 'gameOver') return session
  const { gameIndex } = session.screen
  if (controls.keys.includes('back')) return { ...session, screen: menuScreen(gameIndex) }
  const focus = moveFocus(session.screen.focus, 2, controls.keys)
  const zones = layoutGameOver(world)
  const { hover, selected } = updateHover(session.screen.hover, zones, allHands(input), input.dt * 1000)
  const choice =
    tappedZone(zones, controls.taps) ?? selected ?? (controls.keys.includes('confirm') ? [PLAY_AGAIN, MENU][focus] : null)
  if (choice === PLAY_AGAIN) return { ...session, screen: countdown(gameIndex) }
  if (choice === MENU) return { ...session, screen: menuScreen(gameIndex) }
  return { ...session, screen: { ...session.screen, hover, focus } }
}

export function stepSession(
  session: Session,
  games: readonly AnyMiniGame[],
  input: FrameInput,
  world: World,
  controls: Controls = NO_CONTROLS,
  random: () => number = Math.random,
): SessionStep {
  switch (session.screen.kind) {
    case 'menu':
      return { session: stepMenu(session, games, input, world, controls), events: [] }
    case 'countdown':
      return { session: stepCountdown(session, games, input, world, controls, random), events: [] }
    case 'playing':
      return stepPlaying(session, games, input, world, controls, random)
    case 'gameOver':
      return { session: stepGameOver(session, input, world, controls), events: [] }
  }
}
