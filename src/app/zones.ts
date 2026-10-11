import type { World } from '../game/physics'

/** A rectangular area a player can "press" by holding a hand over it. */
export interface Zone {
  readonly id: string
  readonly x: number
  readonly y: number
  readonly w: number
  readonly h: number
}

export interface Hover {
  readonly zoneId: string
  readonly ms: number
}

export type Point = Readonly<{ x: number; y: number }>

export const HOVER_SELECT_MS = 1200
/** Longer hold for leaving a game, so a hand passing by mid-play doesn't quit. */
export const IN_GAME_HOLD_MS = 2000

function contains(zone: Zone, p: Point): boolean {
  return p.x >= zone.x && p.x <= zone.x + zone.w && p.y >= zone.y && p.y <= zone.y + zone.h
}

/** Advances the hand-hover timer; selects a zone once a hand stays on it long enough. */
export function updateHover(
  hover: Hover | null,
  zones: readonly Zone[],
  hands: readonly Point[],
  dtMs: number,
  holdMs: number = HOVER_SELECT_MS,
): { hover: Hover | null; selected: string | null } {
  const zone = zones.find((z) => hands.some((h) => contains(z, h)))
  if (!zone) return { hover: null, selected: null }
  const ms = hover?.zoneId === zone.id ? hover.ms + dtMs : 0
  if (ms >= holdMs) return { hover: null, selected: zone.id }
  return { hover: { zoneId: zone.id, ms }, selected: null }
}

/** Touch/mouse: the first zone under any tap, selected immediately. */
export function tappedZone(zones: readonly Zone[], taps: readonly Point[]): string | null {
  return zones.find((z) => taps.some((p) => contains(z, p)))?.id ?? null
}

/**
 * Lowest edge of the menu tiles, as a fraction of screen height. Measured: people
 * standing with arms out at shoulder level reach ~0.6, so tiles stop at 0.5 and
 * only a deliberately raised hand selects.
 */
export const MENU_BOTTOM = 0.5

/**
 * Bento menu: the first game gets a large featured tile, the rest share a
 * 2-column grid beside it (landscape) or below it (portrait). Everything stays
 * in the upper part of the screen so hands resting at hip height never select.
 */
export function layoutMenu(world: World, ids: readonly string[]): Zone[] {
  if (ids.length === 0) return []
  const landscape = world.width >= world.height
  const gap = Math.min(world.width, world.height) * 0.025
  const band = landscape
    ? { x: world.width * 0.05, y: world.height * 0.13, w: world.width * 0.9, h: world.height * MENU_BOTTOM - world.height * 0.13 }
    : { x: world.width * 0.05, y: world.height * 0.11, w: world.width * 0.9, h: world.height * MENU_BOTTOM - world.height * 0.11 }
  const rest = ids.slice(1)
  const rows = Math.max(1, Math.ceil(rest.length / 2))
  const featured = landscape
    ? { x: band.x, y: band.y, w: (band.w - gap) / 2, h: band.h }
    : { x: band.x, y: band.y, w: band.w, h: (band.h - gap) * 0.4 }
  const grid = landscape
    ? { x: band.x + featured.w + gap, y: band.y, w: band.w - featured.w - gap, h: band.h }
    : { x: band.x, y: band.y + featured.h + gap, w: band.w, h: band.h - featured.h - gap }
  const cellW = (grid.w - gap) / 2
  const cellH = (grid.h - gap * (rows - 1)) / rows
  const cells = rest.map((id, i) => {
    const lastAlone = i === rest.length - 1 && rest.length % 2 === 1
    return {
      id,
      x: grid.x + (i % 2) * (cellW + gap),
      y: grid.y + Math.floor(i / 2) * (cellH + gap),
      w: lastAlone ? grid.w : cellW,
      h: cellH,
    }
  })
  return [{ id: ids[0], ...featured }, ...cells]
}

export const PLAY_AGAIN = 'playAgain'
export const MENU = 'menu'

export function layoutGameOver(world: World): Zone[] {
  const w = world.width * 0.26
  const h = world.height * 0.22
  const y = world.height * 0.12
  return [
    { id: PLAY_AGAIN, x: world.width * 0.06, y, w, h },
    { id: MENU, x: world.width * 0.94 - w, y, w, h },
  ]
}

/** Small "back to menu" button in the top-left corner during countdown and play. */
export function layoutInGameMenu(world: World): Zone[] {
  const u = Math.min(world.width, world.height)
  const margin = u * 0.03
  return [{ id: MENU, x: margin, y: margin, w: u * 0.2, h: u * 0.1 }]
}
