import type { ExerciseId } from './exercises'

export type Block =
  | { readonly kind: 'exercise'; readonly exerciseId: ExerciseId; readonly seconds: number }
  | { readonly kind: 'rest'; readonly nextExerciseId: ExerciseId; readonly seconds: number }

export type Routine = readonly Block[]

export interface BlockPosition {
  readonly index: number
  readonly block: Block
  /** Seconds remaining in this block. */
  readonly remaining: number
  /** 0..1 progress through this block. */
  readonly progress: number
}

export const EXERCISE_SECONDS = 30
export const REST_SECONDS = 10
export const DEFAULT_ORDER: readonly ExerciseId[] = ['squats', 'jumpingJacks', 'highKnees', 'armRaises']

/** Builds [exercise → rest(next)] → ... → last exercise (no trailing rest). */
export function buildRoutine(
  order: readonly ExerciseId[] = DEFAULT_ORDER,
  exerciseSeconds = EXERCISE_SECONDS,
  restSeconds = REST_SECONDS,
): Routine {
  return order.flatMap((exerciseId, i): Block[] => {
    const work: Block = { kind: 'exercise', exerciseId, seconds: exerciseSeconds }
    const next = order[i + 1]
    return next === undefined ? [work] : [work, { kind: 'rest', nextExerciseId: next, seconds: restSeconds }]
  })
}

export function totalSeconds(routine: Routine): number {
  return routine.reduce((sum, b) => sum + b.seconds, 0)
}

/** Locates the block active at `elapsed` seconds, or null once the routine is over. */
export function blockAt(routine: Routine, elapsed: number): BlockPosition | null {
  let start = 0
  for (let index = 0; index < routine.length; index += 1) {
    const block = routine[index]
    const end = start + block.seconds
    if (elapsed < end) {
      const into = Math.max(0, elapsed - start)
      return { index, block, remaining: end - Math.max(elapsed, start), progress: into / block.seconds }
    }
    start = end
  }
  return null
}
