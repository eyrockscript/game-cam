import { describe, expect, it } from 'vitest'
import { EMPTY_MANIFEST, parseManifest, trackUrl } from './manifest'

describe('parseManifest', () => {
  it('keeps valid tracks', () => {
    const manifest = parseManifest({ tracks: [{ mood: 'upbeat', file: 'upbeat-1.mp3' }] })
    expect(manifest.tracks).toEqual([{ mood: 'upbeat', file: 'upbeat-1.mp3' }])
  })

  it('drops entries with unknown moods or unsafe file names', () => {
    const manifest = parseManifest({
      tracks: [
        { mood: 'party', file: 'a.mp3' },
        { mood: 'calm', file: '../secret.mp3' },
        { mood: 'calm', file: 'https://example.com/x.mp3' },
        { mood: 'calm', file: 'calm.wav' },
        { mood: 'calm' },
        'calm.mp3',
        { mood: 'calm', file: 'calm-1.mp3' },
      ],
    })
    expect(manifest.tracks).toEqual([{ mood: 'calm', file: 'calm-1.mp3' }])
  })

  it('returns an empty manifest for anything that is not a manifest', () => {
    for (const raw of [null, 42, 'x', [], {}, { tracks: 'nope' }]) expect(parseManifest(raw)).toEqual(EMPTY_MANIFEST)
  })
})

describe('trackUrl', () => {
  const manifest = parseManifest({ tracks: [{ mood: 'menu', file: 'menu-1.mp3' }, { mood: 'menu', file: 'menu-2.mp3' }] })

  it('returns the first track for the mood under the base path', () => {
    expect(trackUrl(manifest, 'menu', '/')).toBe('/music/menu-1.mp3')
    expect(trackUrl(manifest, 'menu', '/game/')).toBe('/game/music/menu-1.mp3')
  })

  it('returns null when the mood has no track', () => {
    expect(trackUrl(manifest, 'calm', '/')).toBeNull()
  })
})
