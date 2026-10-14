import type { Mood } from '../core/types'
import type { AudioEngine } from './engine'
import type { TrackPlayer } from './music'

const FADE_S = 0.03
const PAUSE_DELAY_MS = 60

/** Loops one `<audio>` element per mood, routed through the engine so mute applies. */
export class TrackMusic implements TrackPlayer {
  private readonly elements = new Map<Mood, HTMLAudioElement>()
  private bus: GainNode | null = null
  private active: HTMLAudioElement | null = null
  private pauseTimer: number | undefined

  constructor(
    private readonly engine: AudioEngine,
    private readonly onError: (mood: Mood) => void,
  ) {}

  play(mood: Mood, url: string): void {
    const out = this.engine.output()
    if (!out) return
    window.clearTimeout(this.pauseTimer)
    const element = this.elementFor(mood, url, out.ctx, out.bus)
    if (this.active && this.active !== element) this.active.pause()
    this.active = element
    this.bus!.gain.cancelScheduledValues(out.ctx.currentTime)
    this.bus!.gain.setTargetAtTime(1, out.ctx.currentTime, FADE_S / 3)
    element.play().catch((error: unknown) => {
      console.warn(`Music track for "${mood}" could not play; using synthesized music`, error)
      this.onError(mood)
    })
  }

  pause(): void {
    const out = this.engine.output()
    if (!out || !this.bus || !this.active) return
    this.bus.gain.cancelScheduledValues(out.ctx.currentTime)
    this.bus.gain.setTargetAtTime(0, out.ctx.currentTime, FADE_S / 3)
    const element = this.active
    window.clearTimeout(this.pauseTimer)
    this.pauseTimer = window.setTimeout(() => element.pause(), PAUSE_DELAY_MS)
  }

  private elementFor(mood: Mood, url: string, ctx: AudioContext, destination: AudioNode): HTMLAudioElement {
    const existing = this.elements.get(mood)
    if (existing) return existing
    if (!this.bus) {
      this.bus = ctx.createGain()
      this.bus.gain.value = 0
      this.bus.connect(destination)
    }
    const element = new Audio(url)
    element.loop = true
    element.preload = 'auto'
    element.addEventListener('error', () => {
      console.warn(`Music track for "${mood}" failed to load; using synthesized music`, element.error)
      this.onError(mood)
    })
    ctx.createMediaElementSource(element).connect(this.bus)
    this.elements.set(mood, element)
    return element
  }
}
