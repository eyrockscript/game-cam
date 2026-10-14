import type { Mood } from '../core/types'
import type { AudioEngine } from './engine'
import type { MusicSource } from './music'

/** Four bars of sixteenth notes. */
const STEPS = 64
const STEPS_PER_BAR = 16
/** Generous so a busy main thread (late timer ticks) still gets every note scheduled in time. */
const LOOKAHEAD_S = 0.3
const TICK_MS = 25
const FADE_S = 0.03

type Chord = readonly [number, number, number]

interface Pattern {
  readonly bpm: number
  /** One chord per bar (MIDI notes). */
  readonly chords: readonly [Chord, Chord, Chord, Chord]
  readonly lead: OscillatorType
  /** Bass notes per bar: 2 = half notes, 8 = eighth notes. */
  readonly bassPerBar: number
  /** Sixteenth-note steps (within a bar) that get a kick / a hi-hat. */
  readonly kicks: readonly number[]
  readonly hats: readonly number[]
}

const PATTERNS: Readonly<Record<Mood, Pattern>> = {
  menu: {
    bpm: 96,
    chords: [[57, 60, 64], [53, 57, 60], [60, 64, 67], [55, 59, 62]], // Am F C G
    lead: 'triangle',
    bassPerBar: 2,
    kicks: [0, 8],
    hats: [4, 12],
  },
  upbeat: {
    bpm: 128,
    chords: [[60, 64, 67], [55, 59, 62], [57, 60, 64], [53, 57, 60]], // C G Am F
    lead: 'square',
    bassPerBar: 8,
    kicks: [0, 4, 8, 12],
    hats: [2, 6, 10, 14],
  },
  calm: {
    bpm: 84,
    chords: [[62, 65, 69], [58, 62, 65], [65, 69, 72], [60, 64, 67]], // Dm Bb F C
    lead: 'sine',
    bassPerBar: 2,
    kicks: [0],
    hats: [],
  },
}

/** Chord tone order for the eighth-note arpeggio. */
const ARP = [0, 1, 2, 1] as const

const frequency = (midi: number): number => 440 * 2 ** ((midi - 69) / 12)

/** Loops a 4-bar chiptune pattern per mood with a lookahead scheduler. */
export class SynthMusic implements MusicSource {
  private bus: GainNode | null = null
  private noise: AudioBuffer | null = null
  private timer: number | undefined
  private mood: Mood | null = null
  private step = 0
  private nextTime = 0

  constructor(private readonly engine: AudioEngine) {}

  play(mood: Mood): void {
    const out = this.engine.output()
    if (!out) return
    const bus = this.ensureBus(out.ctx, out.bus)
    if (mood !== this.mood) {
      this.mood = mood
      this.step = 0
    }
    bus.gain.cancelScheduledValues(out.ctx.currentTime)
    bus.gain.setTargetAtTime(1, out.ctx.currentTime, FADE_S / 3)
    if (this.timer === undefined) {
      this.nextTime = out.ctx.currentTime + 0.05
      this.timer = window.setInterval(() => this.tick(out.ctx), TICK_MS)
    }
  }

  pause(): void {
    window.clearInterval(this.timer)
    this.timer = undefined
    const out = this.engine.output()
    if (!out || !this.bus) return
    this.bus.gain.cancelScheduledValues(out.ctx.currentTime)
    this.bus.gain.setTargetAtTime(0, out.ctx.currentTime, FADE_S / 3)
  }

  private ensureBus(ctx: AudioContext, destination: AudioNode): GainNode {
    if (this.bus) return this.bus
    const bus = ctx.createGain()
    bus.gain.value = 0
    bus.connect(destination)
    const noise = ctx.createBuffer(1, Math.floor(ctx.sampleRate * 0.05), ctx.sampleRate)
    const data = noise.getChannelData(0)
    for (let i = 0; i < data.length; i += 1) data[i] = Math.random() * 2 - 1
    this.bus = bus
    this.noise = noise
    return bus
  }

  private tick(ctx: AudioContext): void {
    if (!this.mood) return
    const pattern = PATTERNS[this.mood]
    const stepSeconds = 60 / pattern.bpm / 4
    // A busy main thread delays ticks; drop the missed steps instead of firing them all at once.
    if (this.nextTime < ctx.currentTime) {
      const missed = Math.ceil((ctx.currentTime - this.nextTime) / stepSeconds)
      this.nextTime += missed * stepSeconds
      this.step = (this.step + missed) % STEPS
    }
    while (this.nextTime < ctx.currentTime + LOOKAHEAD_S) {
      this.schedule(ctx, pattern, this.step, this.nextTime, stepSeconds)
      this.nextTime += stepSeconds
      this.step = (this.step + 1) % STEPS
    }
  }

  private schedule(ctx: AudioContext, p: Pattern, step: number, time: number, stepSeconds: number): void {
    const chord = p.chords[Math.floor(step / STEPS_PER_BAR)]
    const inBar = step % STEPS_PER_BAR
    if (inBar % 2 === 0) {
      const tone = chord[ARP[(inBar / 2) % ARP.length]]
      this.tone(ctx, frequency(tone + 12), time, stepSeconds * 1.8, p.lead, 0.07)
    }
    const bassEvery = STEPS_PER_BAR / p.bassPerBar
    if (inBar % bassEvery === 0) this.tone(ctx, frequency(chord[0] - 24), time, stepSeconds * bassEvery * 0.9, 'triangle', 0.22)
    if (p.kicks.includes(inBar)) this.kick(ctx, time)
    if (p.hats.includes(inBar)) this.hat(ctx, time)
  }

  private tone(ctx: AudioContext, freq: number, time: number, duration: number, type: OscillatorType, volume: number): void {
    if (!this.bus) return
    const osc = ctx.createOscillator()
    const gain = ctx.createGain()
    osc.type = type
    osc.frequency.value = freq
    gain.gain.setValueAtTime(0.0001, time)
    gain.gain.exponentialRampToValueAtTime(volume, time + 0.008)
    gain.gain.exponentialRampToValueAtTime(0.0001, time + duration)
    osc.connect(gain).connect(this.bus)
    osc.start(time)
    osc.stop(time + duration + 0.02)
  }

  private kick(ctx: AudioContext, time: number): void {
    if (!this.bus) return
    const osc = ctx.createOscillator()
    const gain = ctx.createGain()
    osc.frequency.setValueAtTime(150, time)
    osc.frequency.exponentialRampToValueAtTime(40, time + 0.12)
    gain.gain.setValueAtTime(0.6, time)
    gain.gain.exponentialRampToValueAtTime(0.0001, time + 0.15)
    osc.connect(gain).connect(this.bus)
    osc.start(time)
    osc.stop(time + 0.16)
  }

  private hat(ctx: AudioContext, time: number): void {
    if (!this.bus || !this.noise) return
    const source = ctx.createBufferSource()
    const filter = ctx.createBiquadFilter()
    const gain = ctx.createGain()
    source.buffer = this.noise
    filter.type = 'highpass'
    filter.frequency.value = 7000
    gain.gain.setValueAtTime(0.12, time)
    gain.gain.exponentialRampToValueAtTime(0.0001, time + 0.04)
    source.connect(filter).connect(gain).connect(this.bus)
    source.start(time)
  }
}
