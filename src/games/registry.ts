import type { AnyMiniGame } from '../core/types'
import { bubblesGame } from './bubbles'
import { dodgeGame } from './dodge'
import { keepUpGame } from './keepUp'
import { ninjaGame } from './ninja'
import { workoutGame } from './workout'

/** Menu order. Add a new game here and in src/i18n/es.json → games.<id>. */
export const GAMES: readonly AnyMiniGame[] = [keepUpGame, bubblesGame, ninjaGame, dodgeGame, workoutGame] as readonly AnyMiniGame[]
