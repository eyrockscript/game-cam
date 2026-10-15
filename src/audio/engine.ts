const MUTED_KEY = 'game-cam.muted'
/** Music sits under the game: loud enough to dance to, quiet enough to talk over. */
const MASTER_VOLUME = 0.8
const MUTE_RAMP_S = 0.02

/** Owns the AudioContext. Browsers only allow starting it from a user gesture: call unlock() in a click handler. */
export class AudioEngine {
  private ctx: AudioContext | null = null
  private master: GainNode | null = null
  private isMuted: boolean

  constructor(private readonly storage: Storage = localStorage) {
    this.isMuted = storage.getItem(MUTED_KEY) === '1'
  }

  /** Creates (or resumes) the context. Safe to call more than once. */
  unlock(): void {
    if (this.ctx) {
      this.ctx.resume().catch((error: unknown) => console.warn('Audio context could not resume', error))
      return
    }
    const ctx = new AudioContext()
    const master = ctx.createGain()
    master.gain.value = this.isMuted ? 0 : MASTER_VOLUME
    master.connect(ctx.destination)
    this.ctx = ctx
    this.master = master
    // Background tabs throttle timers, which would garble the sequencer: suspend instead.
    document.addEventListener('visibilitychange', () => {
      const change = document.hidden ? ctx.suspend() : ctx.resume()
      change.catch((error: unknown) => console.warn('Audio context visibility change failed', error))
    })
  }

  /** Context and output bus, or null before unlock(). */
  output(): { ctx: AudioContext; bus: AudioNode } | null {
    return this.ctx && this.master ? { ctx: this.ctx, bus: this.master } : null
  }

  muted(): boolean {
    return this.isMuted
  }

  setMuted(muted: boolean): void {
    this.isMuted = muted
    this.storage.setItem(MUTED_KEY, muted ? '1' : '0')
    if (this.ctx && this.master) {
      this.master.gain.setTargetAtTime(muted ? 0 : MASTER_VOLUME, this.ctx.currentTime, MUTE_RAMP_S)
    }
  }
}
