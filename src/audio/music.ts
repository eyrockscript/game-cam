import type { Mood } from '../core/types'
import { EMPTY_MANIFEST, type TrackManifest, trackUrl } from './manifest'

/** Something that can loop music for a mood. `play` on the current mood resumes it. */
export interface MusicSource {
  play(mood: Mood): void
  /** Must silence within ~50 ms (Statues depends on it). */
  pause(): void
}

export interface TrackPlayer {
  play(mood: Mood, url: string): void
  pause(): void
}

/**
 * Plays the CC0 track listed for a mood, or synthesized music when there is
 * none or it failed to load. A failed mood stays on synth for the session.
 */
export class HybridMusic implements MusicSource {
  private manifest: TrackManifest = EMPTY_MANIFEST
  private readonly failed = new Set<Mood>()
  private current: Mood | null = null
  private playing = false

  constructor(
    private readonly synth: MusicSource,
    private readonly tracks: TrackPlayer,
    private readonly baseUrl: string,
  ) {}

  setManifest(manifest: TrackManifest): void {
    this.manifest = manifest
    // A manifest that arrives after the first cue switches the current mood from synth to its track.
    if (this.playing && this.current) this.play(this.current)
  }

  play(mood: Mood): void {
    this.current = mood
    this.playing = true
    const url = this.failed.has(mood) ? null : trackUrl(this.manifest, mood, this.baseUrl)
    if (url) {
      this.synth.pause()
      this.tracks.play(mood, url)
    } else {
      this.tracks.pause()
      this.synth.play(mood)
    }
  }

  pause(): void {
    this.playing = false
    this.synth.pause()
    this.tracks.pause()
  }

  /** Called by the track player when a file can't be fetched or decoded. */
  trackFailed(mood: Mood): void {
    this.failed.add(mood)
    if (this.playing && this.current === mood) this.play(mood)
  }
}
