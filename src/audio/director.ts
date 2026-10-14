import type { Session } from '../app/session'
import type { AnyMiniGame, Mood } from '../core/types'

/** What should be heard right now. `mood: null` = no music (results screen). */
export interface MusicCue {
  readonly mood: Mood | null
  readonly playing: boolean
}

export type MusicAction = { readonly kind: 'none' } | { readonly kind: 'play'; readonly mood: Mood } | { readonly kind: 'pause' }

const DEFAULT_MOOD: Mood = 'upbeat'

/** Pure: derives the music cue from the session screen. */
export function musicCue(session: Session, games: readonly AnyMiniGame[]): MusicCue {
  const { screen } = session
  switch (screen.kind) {
    case 'menu':
      return { mood: 'menu', playing: true }
    case 'countdown':
      return { mood: games[screen.gameIndex].mood ?? DEFAULT_MOOD, playing: true }
    case 'playing': {
      const game = games[screen.gameIndex]
      return { mood: game.mood ?? DEFAULT_MOOD, playing: game.status(screen.state).music !== 'off' }
    }
    case 'gameOver':
      return { mood: null, playing: false }
  }
}

function audible(cue: MusicCue | null): cue is MusicCue & { mood: Mood } {
  return cue !== null && cue.playing && cue.mood !== null
}

/** Pure: what to tell the music source so it goes from `previous` to `next`. */
export function musicAction(previous: MusicCue | null, next: MusicCue): MusicAction {
  if (audible(next)) {
    return audible(previous) && previous.mood === next.mood ? { kind: 'none' } : { kind: 'play', mood: next.mood }
  }
  return audible(previous) ? { kind: 'pause' } : { kind: 'none' }
}
