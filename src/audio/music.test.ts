import { describe, expect, it } from 'vitest'
import type { Mood } from '../core/types'
import { parseManifest } from './manifest'
import { HybridMusic, type MusicSource, type TrackPlayer } from './music'

function fakes() {
  const calls: string[] = []
  const synth: MusicSource = { play: (m: Mood) => calls.push(`synth.play:${m}`), pause: () => calls.push('synth.pause') }
  const tracks: TrackPlayer = {
    play: (m: Mood, url: string) => calls.push(`tracks.play:${m}:${url}`),
    pause: () => calls.push('tracks.pause'),
  }
  return { calls, synth, tracks }
}

const manifest = parseManifest({ tracks: [{ mood: 'upbeat', file: 'upbeat-1.mp3' }] })

describe('HybridMusic', () => {
  it('uses synthesized music until a manifest is loaded', () => {
    const { calls, synth, tracks } = fakes()
    new HybridMusic(synth, tracks, '/').play('upbeat')
    expect(calls).toEqual(['tracks.pause', 'synth.play:upbeat'])
  })

  it('plays the track for a mood listed in the manifest', () => {
    const { calls, synth, tracks } = fakes()
    const music = new HybridMusic(synth, tracks, '/')
    music.setManifest(manifest)
    music.play('upbeat')
    expect(calls).toEqual(['synth.pause', 'tracks.play:upbeat:/music/upbeat-1.mp3'])
  })

  it('switches to the track when the manifest arrives while playing', () => {
    const { calls, synth, tracks } = fakes()
    const music = new HybridMusic(synth, tracks, '/')
    music.play('upbeat')
    music.setManifest(manifest)
    expect(calls.slice(-2)).toEqual(['synth.pause', 'tracks.play:upbeat:/music/upbeat-1.mp3'])
  })

  it('does not start music when the manifest arrives while paused', () => {
    const { calls, synth, tracks } = fakes()
    const music = new HybridMusic(synth, tracks, '/')
    music.play('upbeat')
    music.pause()
    calls.length = 0
    music.setManifest(manifest)
    expect(calls).toEqual([])
  })

  it('falls back to synth for moods without a track', () => {
    const { calls, synth, tracks } = fakes()
    const music = new HybridMusic(synth, tracks, '/')
    music.setManifest(manifest)
    music.play('calm')
    expect(calls).toEqual(['tracks.pause', 'synth.play:calm'])
  })

  it('switches the current mood to synth when its track fails, and never retries it', () => {
    const { calls, synth, tracks } = fakes()
    const music = new HybridMusic(synth, tracks, '/')
    music.setManifest(manifest)
    music.play('upbeat')
    calls.length = 0
    music.trackFailed('upbeat')
    expect(calls).toEqual(['tracks.pause', 'synth.play:upbeat'])
    calls.length = 0
    music.play('upbeat')
    expect(calls).toEqual(['tracks.pause', 'synth.play:upbeat'])
  })

  it('does not resume music when a track fails while paused', () => {
    const { calls, synth, tracks } = fakes()
    const music = new HybridMusic(synth, tracks, '/')
    music.setManifest(manifest)
    music.play('upbeat')
    music.pause()
    calls.length = 0
    music.trackFailed('upbeat')
    expect(calls).toEqual([])
  })

  it('pauses both sources', () => {
    const { calls, synth, tracks } = fakes()
    new HybridMusic(synth, tracks, '/').pause()
    expect(calls).toEqual(['synth.pause', 'tracks.pause'])
  })
})
