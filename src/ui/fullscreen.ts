/**
 * Fullscreen with vendor fallbacks. iPhone Safari has no element fullscreen at
 * all: there the only way is installing the app to the home screen (PWA).
 */

type WebkitDocument = Document & {
  webkitFullscreenElement?: Element | null
  webkitExitFullscreen?: () => Promise<void> | void
}
type WebkitElement = HTMLElement & { webkitRequestFullscreen?: () => Promise<void> | void }

export function isFullscreen(): boolean {
  const doc = document as WebkitDocument
  return Boolean(doc.fullscreenElement ?? doc.webkitFullscreenElement)
}

/** True when launched from the home screen (already chrome-less). */
export function isStandalone(): boolean {
  return window.matchMedia('(display-mode: fullscreen), (display-mode: standalone)').matches
}

export function canFullscreen(): boolean {
  const el = document.documentElement as WebkitElement
  return typeof el.requestFullscreen === 'function' || typeof el.webkitRequestFullscreen === 'function'
}

/** Returns false when the browser cannot go fullscreen (caller should explain the PWA route). */
export async function toggleFullscreen(): Promise<boolean> {
  const doc = document as WebkitDocument
  const el = document.documentElement as WebkitElement
  if (isFullscreen()) {
    await (doc.exitFullscreen?.() ?? doc.webkitExitFullscreen?.())
    return true
  }
  if (!canFullscreen()) return false
  await (el.requestFullscreen?.({ navigationUI: 'hide' }) ?? el.webkitRequestFullscreen?.())
  return true
}

export function onFullscreenChange(listener: () => void): void {
  document.addEventListener('fullscreenchange', listener)
  document.addEventListener('webkitfullscreenchange', listener)
}
