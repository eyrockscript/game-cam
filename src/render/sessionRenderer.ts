/**
 * Draws the non-game UI for the current session screen. Animation timing is
 * derived from `now` and the render-only screen clock; session logic is untouched.
 */
import type { Session } from '../app/session'
import type { AnyMiniGame } from '../core/types'
import type { World } from '../game/physics'
import { renderMenu } from './menu'
import { screenAge } from './screenClock'
import { renderCountdown, renderGameOver, renderGoBanner, renderInGameMenuButton } from './screens'

export { renderPlayers } from './players'

export function renderSession(
  ctx: CanvasRenderingContext2D,
  session: Session,
  games: readonly AnyMiniGame[],
  world: World,
  now: number,
): void {
  const { screen } = session
  const ageMs = screenAge(screen, now)
  switch (screen.kind) {
    case 'menu':
      return renderMenu(ctx, session, games, world, now, ageMs)
    case 'countdown':
      renderCountdown(ctx, session, games, world, ageMs)
      return renderInGameMenuButton(ctx, screen.menuHover, world)
    case 'playing':
      games[screen.gameIndex].render(ctx, screen.state, world)
      renderGoBanner(ctx, world, ageMs)
      return renderInGameMenuButton(ctx, screen.menuHover, world)
    case 'gameOver':
      return renderGameOver(ctx, session, games, world, ageMs)
  }
}
