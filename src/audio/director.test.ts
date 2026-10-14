import { describe, expect, it } from 'vitest'
import type { Session } from '../app/session'
import type { AnyMiniGame, MiniGame } from '../core/types'
import { type MusicCue, musicAction, musicCue } from './director'

const game = (id: string, extra: Partial<MiniGame<{ quiet: boolean }>> = {}): MiniGame<{ quiet: boolean }> => ({
  id,
  titleKey: 't',
  descriptionKey: 'd',
  start: () => ({ quiet: false }),
  step: (s) => ({ state: s, events: [], finished: false }),
  render: () => undefined,
  status: (s) => ({ score: 0, music: s.quiet ? 'off' : 'on' }),
  ...extra,
})
const games = [game('loud'), game('soft', { mood: 'calm' })] as readonly AnyMiniGame[]
const session = (screen: Session['screen']): Session => ({ screen, bests: {} })

describe('musicCue', () => {
  it('plays the menu mood on the menu', () => {
    expect(musicCue(session({ kind: 'menu', hover: null, focus: 0 }), games)).toEqual({ mood: 'menu', playing: true })
  })

  it("plays the game's mood during the countdown, upbeat by default", () => {
    const countdown = (gameIndex: number) => session({ kind: 'countdown', gameIndex, msLeft: 1000, menuHover: null })
    expect(musicCue(countdown(0), games)).toEqual({ mood: 'upbeat', playing: true })
    expect(musicCue(countdown(1), games)).toEqual({ mood: 'calm', playing: true })
  })

  it('lets the game silence the music while playing', () => {
    const playing = (quiet: boolean) => session({ kind: 'playing', gameIndex: 0, state: { quiet }, menuHover: null })
    expect(musicCue(playing(false), games)).toEqual({ mood: 'upbeat', playing: true })
    expect(musicCue(playing(true), games)).toEqual({ mood: 'upbeat', playing: false })
  })

  it('is silent on the results screen', () => {
    const over = session({ kind: 'gameOver', gameIndex: 0, score: 3, newBest: false, hover: null, focus: 0 })
    expect(musicCue(over, games)).toEqual({ mood: null, playing: false })
  })
})

describe('musicAction', () => {
  const cue = (mood: MusicCue['mood'], playing: boolean): MusicCue => ({ mood, playing })

  it('does nothing when the cue is unchanged', () => {
    expect(musicAction(cue('menu', true), cue('menu', true))).toEqual({ kind: 'none' })
  })

  it('plays on the first cue and on mood changes', () => {
    expect(musicAction(null, cue('menu', true))).toEqual({ kind: 'play', mood: 'menu' })
    expect(musicAction(cue('menu', true), cue('calm', true))).toEqual({ kind: 'play', mood: 'calm' })
  })

  it('pauses when the music must stop and resumes the same mood', () => {
    expect(musicAction(cue('upbeat', true), cue('upbeat', false))).toEqual({ kind: 'pause' })
    expect(musicAction(cue('upbeat', false), cue('upbeat', true))).toEqual({ kind: 'play', mood: 'upbeat' })
    expect(musicAction(cue('upbeat', true), cue(null, false))).toEqual({ kind: 'pause' })
  })

  it('does not pause twice', () => {
    expect(musicAction(cue('upbeat', false), cue(null, false))).toEqual({ kind: 'none' })
  })
})
