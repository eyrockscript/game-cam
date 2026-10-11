import '@fontsource-variable/outfit'
import './style.css'
import { type KeyCommand, type Session, createSession, stepSession } from './app/session'
import type { Point } from './app/zones'
import { startCamera } from './camera'
import type { Player } from './core/types'
import { worldFor } from './game/physics'
import { GAMES } from './games/registry'
import { applyStaticTranslations, t } from './i18n'
import { type ViewMapping, coverMapping } from './pose/bodyColliders'
import { type TrackerState, emptyTracker, trackPlayers } from './pose/players'
import { type PoseTracker, createPoseTracker } from './pose/poseTracker'
import { drawMirroredVideo } from './render/renderer'
import { renderPlayers, renderSession } from './render/sessionRenderer'
import { isFullscreen, isStandalone, onFullscreenChange, toggleFullscreen } from './ui/fullscreen'
import { createHud } from './ui/hud'

const BESTS_KEY = 'game-cam.bests'
const MAX_DT = 1 / 20
/** Caps the velocity window so a stalled detection doesn't produce a huge swing. */
const MAX_DETECTION_DT = 0.25
const KEY_COMMANDS: Record<string, KeyCommand> = {
  ArrowLeft: 'left',
  ArrowUp: 'left',
  ArrowRight: 'right',
  ArrowDown: 'right',
  Enter: 'confirm',
  Space: 'confirm',
  Escape: 'back',
  Backspace: 'back',
}

const video = document.getElementById('camera') as HTMLVideoElement
const canvas = document.getElementById('scene') as HTMLCanvasElement
const ctx = canvas.getContext('2d')!
const buildLabel = document.getElementById('build')!
const hud = createHud()

applyStaticTranslations(document)
buildLabel.textContent = __COMMIT_HASH__
hud.showMessage(t('messages.intro'))

let pendingKeys: KeyCommand[] = []
let pendingTaps: Point[] = []
// Taps/clicks on the canvas, converted to canvas pixels (the canvas is DPR-scaled).
canvas.addEventListener('pointerup', (e) => {
  const rect = canvas.getBoundingClientRect()
  const point = { x: ((e.clientX - rect.left) / rect.width) * canvas.width, y: ((e.clientY - rect.top) / rect.height) * canvas.height }
  pendingTaps = [...pendingTaps, point]
})
window.addEventListener('keydown', (e) => {
  if (e.code === 'KeyF') return void handleFullscreen()
  const command = KEY_COMMANDS[e.code]
  if (command) pendingKeys = [...pendingKeys, command]
})

const fullscreenButton = document.getElementById('fullscreen')!
const toast = document.getElementById('toast')!
const TOAST_MS = 8000

function syncFullscreenButton(): void {
  fullscreenButton.hidden = isFullscreen() || isStandalone()
}

function showToast(text: string): void {
  toast.textContent = text
  toast.hidden = false
  window.setTimeout(() => (toast.hidden = true), TOAST_MS)
}

async function handleFullscreen(): Promise<void> {
  try {
    if (!(await toggleFullscreen())) showToast(t('messages.installForFullscreen'))
  } catch (error: unknown) {
    console.warn('Fullscreen request rejected', error)
    showToast(t('messages.installForFullscreen'))
  }
}

fullscreenButton.addEventListener('click', () => void handleFullscreen())
onFullscreenChange(syncFullscreenButton)
syncFullscreenButton()

function resizeCanvas(): void {
  canvas.width = Math.round(window.innerWidth * devicePixelRatio)
  canvas.height = Math.round(window.innerHeight * devicePixelRatio)
}

function loadBests(): Record<string, number> {
  try {
    const parsed: unknown = JSON.parse(localStorage.getItem(BESTS_KEY) ?? '{}')
    if (typeof parsed !== 'object' || parsed === null) return {}
    return Object.fromEntries(Object.entries(parsed).filter(([, v]) => typeof v === 'number'))
  } catch {
    return {}
  }
}

function errorText(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

/**
 * Detection is async and slower than rendering, so it runs on its own cadence:
 * one detection in flight at a time, players updated when it resolves. Body
 * velocities use the time between camera captures, not between screen frames.
 */
function createPlayerFeed(tracker: PoseTracker): (mapping: ViewMapping, baseRadius: number) => readonly Player[] {
  let players: readonly Player[] = []
  let tracking: TrackerState = emptyTracker
  let inFlight = false
  let lastCaptureAt = performance.now()

  return (mapping, baseRadius) => {
    if (!inFlight) {
      inFlight = true
      const capturedAt = performance.now()
      tracker
        .detect(video)
        .then((poses) => {
          const dt = Math.min(MAX_DETECTION_DT, (capturedAt - lastCaptureAt) / 1000)
          lastCaptureAt = capturedAt
          const tracked = trackPlayers(poses, tracking, mapping, baseRadius, dt)
          tracking = tracked.tracker
          players = tracked.players
        })
        .catch((error: unknown) => console.error('Pose detection error', error))
        .finally(() => {
          inFlight = false
        })
    }
    return players
  }
}

function runLoop(tracker: PoseTracker): void {
  let session: Session = createSession(loadBests())
  let lastTime = performance.now()
  const playersFor = createPlayerFeed(tracker)

  const frame = (now: number): void => {
    const dt = Math.min(MAX_DT, (now - lastTime) / 1000)
    lastTime = now
    const world = worldFor(canvas.width, canvas.height)
    const mapping = coverMapping(video.videoWidth, video.videoHeight, canvas.width, canvas.height)
    const players = playersFor(mapping, Math.min(world.width, world.height) * 0.035)

    const step = stepSession(session, GAMES, { players, dt, now }, world, { keys: pendingKeys, taps: pendingTaps })
    pendingKeys = []
    pendingTaps = []
    session = step.session
    if (step.events.includes('gameOver')) localStorage.setItem(BESTS_KEY, JSON.stringify(session.bests))

    drawMirroredVideo(ctx, video, mapping)
    renderPlayers(ctx, players)
    renderSession(ctx, session, GAMES, world, now)
    hud.update(session, GAMES, players.length)
    if (players.length === 0 && session.screen.kind !== 'playing') hud.showMessage(t('messages.noBody'))
    else hud.hideOverlay()

    const buildText = `${__COMMIT_HASH__} · ${tracker.status()}`
    if (buildLabel.textContent !== buildText) buildLabel.textContent = buildText
    requestAnimationFrame(frame)
  }
  requestAnimationFrame(frame)
}

async function boot(): Promise<void> {
  hud.hideStartButton()
  try {
    await startCamera(video)
  } catch (error: unknown) {
    hud.showMessage(t('messages.cameraError', { error: errorText(error) }))
    return
  }
  hud.showMessage(t('messages.loading'))
  let tracker: PoseTracker
  try {
    tracker = await createPoseTracker()
  } catch (error: unknown) {
    hud.showMessage(t('messages.modelError', { error: errorText(error) }))
    return
  }
  resizeCanvas()
  window.addEventListener('resize', resizeCanvas)
  document.getElementById('hud')!.hidden = false
  runLoop(tracker)
}

document.getElementById('start-camera')!.addEventListener('click', () => void boot())
