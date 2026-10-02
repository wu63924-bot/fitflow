import { RestTimerState } from '../types';

export function remainingSeconds(timer: RestTimerState, now: number): number {
  return Math.max(0, Math.ceil((timer.restEndsAt - now) / 1000));
}

export function createRestTimer(exerciseIndex: number, setIndex: number, seconds: number, now: number, targetExerciseId?: string, targetSetId?: string, triggeredBySetId?: string): RestTimerState {
  return {
    restStartedAt: now,
    restEndsAt: now + seconds * 1000,
    exerciseIndex,
    setIndex,
    targetExerciseId,
    targetSetId,
    triggeredBySetId,
    expanded: true,
    expiredNotified: false
  };
}

export function adjustRestTimer(timer: RestTimerState, seconds: number, now: number): RestTimerState {
  const restEndsAt = Math.max(now, timer.restEndsAt + seconds * 1000);
  const wasAlreadyNotified = timer.restEndsAt <= now && timer.expiredNotified;
  return { ...timer, restEndsAt, expiredNotified: restEndsAt > now ? false : wasAlreadyNotified };
}
