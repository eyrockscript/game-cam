import type { Mood } from '../core/types'
import type { AudioEngine } from './engine'
import type { TrackPlayer } from './music'

/** Time constant for gain ramps; ~5 constants (50 ms) reach silence. */
const RAMP_S = 0.01
/** Sources are stopped after their fade-out has effectively reached zero. */
const STOP_DELAY_S = 0.06

interface ActiveTrack {
  mood: Mood
  source: AudioBufferSourceNode
  gain: GainNode
  startedAt: number
  duration: number
}

/**
 * Loops a decoded AudioBuffer per mood, routed through the engine so mute applies.
 * Decoding up front avoids `<audio>` pitfalls: interrupted play() promises,
 * Range requests against the precache, and gesture-gated play() on iOS.
 */
export class TrackMusic implements TrackPlayer {
  private readonly buffers = new Map<string, Promise<AudioBuffer>>()
  private readonly positions = new Map<Mood, number>()
  private active: ActiveTrack | null = null
  /** Bumped on every play()/pause() so late loads can tell they are stale. */
  private token = 0

  constructor(
    private readonly engine: AudioEngine,
    private readonly onError: (mood: Mood) => void,
  ) {}

  play(mood: Mood, url: string): void {
    const out = this.engine.output()
    if (!out) return
    const token = ++this.token
    if (this.active?.mood === mood) {
      this.rampTo(this.active.gain, 1, out.ctx.currentTime)
      return
    }
    this.load(url, out.ctx).then(
      (buffer) => {
        if (token === this.token) this.start(mood, buffer, out.ctx, out.bus)
      },
      (error: unknown) => {
        if (token !== this.token) return
        console.warn(`Music track for "${mood}" failed to load; using synthesized music`, error)
        this.onError(mood)
      },
    )
  }

  preload(url: string): void {
    const out = this.engine.output()
    // Failures surface (and fall back to synth) when the track is actually played.
    if (out) this.load(url, out.ctx).catch(() => undefined)
  }

  pause(): void {
    this.token++
    const out = this.engine.output()
    if (!out) return
    this.stopActive(out.ctx.currentTime)
  }

  private load(url: string, ctx: AudioContext): Promise<AudioBuffer> {
    const cached = this.buffers.get(url)
    if (cached) return cached
    const promise = fetch(url)
      .then((response) => {
        if (!response.ok) throw new Error(`HTTP ${response.status}`)
        return response.arrayBuffer()
      })
      .then((data) => ctx.decodeAudioData(data))
    // A failed load must not poison the cache: a later play() may retry.
    promise.catch(() => this.buffers.delete(url))
    this.buffers.set(url, promise)
    return promise
  }

  private start(mood: Mood, buffer: AudioBuffer, ctx: AudioContext, destination: AudioNode): void {
    const now = ctx.currentTime
    this.stopActive(now)
    const gain = ctx.createGain()
    gain.gain.value = 0
    gain.connect(destination)
    const source = ctx.createBufferSource()
    source.buffer = buffer
    source.loop = true
    source.connect(gain)
    source.onended = () => {
      source.disconnect()
      gain.disconnect()
    }
    const offset = (this.positions.get(mood) ?? 0) % buffer.duration
    source.start(now, offset)
    this.rampTo(gain, 1, now)
    this.active = { mood, source, gain, startedAt: now - offset, duration: buffer.duration }
  }

  private stopActive(now: number): void {
    const active = this.active
    if (!active) return
    this.active = null
    this.positions.set(active.mood, (now - active.startedAt) % active.duration)
    this.rampTo(active.gain, 0, now)
    active.source.stop(now + STOP_DELAY_S)
  }

  private rampTo(gain: GainNode, value: number, now: number): void {
    gain.gain.cancelScheduledValues(now)
    gain.gain.setTargetAtTime(value, now, RAMP_S)
  }
}
