import type { AnyMiniGame } from '../core/types'
import { bubblesGame } from './bubbles'
import { copyPoseGame } from './copyPose'
import { dodgeGame } from './dodge'
import { keepUpGame } from './keepUp'
import { ninjaGame } from './ninja'
import { statuesGame } from './statues'
import { workoutGame } from './workout'

/** Menu order. Add a new game here and in src/i18n/es.json → games.<id>. */
export const GAMES: readonly AnyMiniGame[] = [keepUpGame, bubblesGame, ninjaGame, dodgeGame, statuesGame, copyPoseGame, workoutGame] as readonly AnyMiniGame[]
