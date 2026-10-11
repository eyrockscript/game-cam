import type { MiniGame } from '../core/types'
import { blockAt } from '../workout/routine'
import { renderWorkout } from '../workout/render'
import { type WorkoutState, advance, initialState } from '../workout/state'

/** Guided exercise routine: each player's reps are counted from their skeleton. */
export const workoutGame: MiniGame<WorkoutState> = {
  id: 'workout',
  titleKey: 'games.workout.title',
  descriptionKey: 'games.workout.description',
  start: () => initialState(),
  step: (state, input) => advance(state, input.players, input.dt),
  render: renderWorkout,
  status: (state) => ({
    score: state.score,
    secondsLeft: Math.max(0, Math.ceil(blockAt(state.routine, state.elapsed)?.remaining ?? 0)),
  }),
}
