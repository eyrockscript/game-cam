import type { Mood } from '../core/types'

export interface Track {
  readonly mood: Mood
  /** File name inside public/music/. */
  readonly file: string
}

export interface TrackManifest {
  readonly tracks: readonly Track[]
}

export const EMPTY_MANIFEST: TrackManifest = { tracks: [] }

const MOODS: readonly Mood[] = ['menu', 'upbeat', 'calm']
/** Plain local file names only: no paths, no URLs. */
const SAFE_FILE = /^[a-z0-9][a-z0-9-]*\.mp3$/

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function toTrack(value: unknown): Track[] {
  if (!isRecord(value)) return []
  const { mood, file } = value
  if (typeof mood !== 'string' || !(MOODS as readonly string[]).includes(mood)) return []
  if (typeof file !== 'string' || !SAFE_FILE.test(file)) return []
  return [{ mood: mood as Mood, file }]
}

/** Validates untrusted JSON from public/music/manifest.json; invalid entries are dropped. */
export function parseManifest(raw: unknown): TrackManifest {
  if (!isRecord(raw) || !Array.isArray(raw.tracks)) return EMPTY_MANIFEST
  return { tracks: raw.tracks.flatMap(toTrack) }
}

const fileUrl = (track: Track, baseUrl: string): string => `${baseUrl}music/${track.file}`

/** URL of the first track for `mood`, or null to fall back to synthesized music. */
export function trackUrl(manifest: TrackManifest, mood: Mood, baseUrl: string): string | null {
  const track = manifest.tracks.find((t) => t.mood === mood)
  return track ? fileUrl(track, baseUrl) : null
}

/** URLs of every listed track, in manifest order, without duplicates. */
export function trackUrls(manifest: TrackManifest, baseUrl: string): string[] {
  return [...new Set(manifest.tracks.map((t) => fileUrl(t, baseUrl)))]
}
