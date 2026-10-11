import type { Session } from '../app/session'
import type { AnyMiniGame } from '../core/types'

function byId<T extends HTMLElement>(id: string): T {
  const el = document.getElementById(id)
  if (!el) throw new Error(`Missing element #${id}`)
  return el as T
}

function setText(el: HTMLElement, text: string): void {
  if (el.textContent !== text) el.textContent = text
}

/** Above this many lives the pips would crowd the chip, so we show the number instead. */
const MAX_PIPS = 5

/** Lives as filled pips (screen readers get the number via aria-label). */
function setLives(el: HTMLElement, lives: number | undefined): void {
  const key = String(lives ?? '')
  if (el.dataset.count === key) return
  el.dataset.count = key
  el.setAttribute('aria-label', key)
  if (lives === undefined || lives <= 0 || lives > MAX_PIPS) {
    el.classList.remove('hud-pips')
    el.textContent = key
    return
  }
  el.classList.add('hud-pips')
  el.replaceChildren(
    ...Array.from({ length: lives }, () => {
      const pip = document.createElement('span')
      pip.className = 'hud-pip'
      pip.setAttribute('aria-hidden', 'true')
      return pip
    }),
  )
}

export interface Hud {
  showMessage(text: string): void
  hideOverlay(): void
  hideStartButton(): void
  update(session: Session, games: readonly AnyMiniGame[], playerCount: number): void
}

export function createHud(): Hud {
  const overlay = byId('overlay')
  const message = byId('message')
  const startButton = byId('start-camera')
  const hud = byId('hud')
  const score = byId('score')
  const lives = byId('lives')
  const time = byId('time')
  const best = byId('best')
  const players = byId('players')

  return {
    showMessage(text) {
      overlay.hidden = false
      setText(message, text)
    },
    hideOverlay() {
      overlay.hidden = true
    },
    hideStartButton() {
      startButton.hidden = true
    },
    update(session, games, playerCount) {
      setText(players, String(playerCount))
      const { screen } = session
      const playing = screen.kind === 'playing'
      hud.classList.toggle('in-game', playing)
      if (!playing) return
      const game = games[screen.gameIndex]
      const status = game.status(screen.state)
      setText(score, String(status.score))
      setText(best, String(session.bests[game.id] ?? 0))
      lives.parentElement!.hidden = status.lives === undefined
      time.parentElement!.hidden = status.secondsLeft === undefined
      setLives(lives, status.lives)
      setText(time, String(status.secondsLeft ?? ''))
    },
  }
}
