import { Exercise, PlannedExercise, TrainingPlan, WorkoutDay, WorkoutSession, WorkoutSessionExercise, WorkoutSet } from '../types';
import { mockExercises } from '../data/mock';

export function getTodayWorkoutDay(plan: TrainingPlan | undefined, date: Date = new Date()): WorkoutDay | undefined {
  if (!plan?.days.length) return undefined;
  const cycleIndex = date.getDay();
  return plan.days.find(day => day.cycleIndex === cycleIndex) ?? plan.days.slice().sort((a, b) => a.order - b.order)[cycleIndex];
}

export function createSet(weight: number, reps: number, index: number, seed: string): WorkoutSet {
  return { id: `set-${seed}-${Date.now()}-${index}-${Math.floor(Math.random() * 10000)}`, weight, reps, completed: false };
}

export function getExercise(id: string, customExercises: Exercise[] = []): Exercise {
  return customExercises.find(exercise => exercise.id === id)
    ?? mockExercises.find(exercise => exercise.id === id)
    ?? mockExercises[0];
}

export function getPreviousPerformance(exerciseId: string, sessions: WorkoutSession[]): WorkoutSessionExercise | undefined {
  return sessions
    .filter(session => session.status === 'completed' && session.endedAt !== undefined)
    .slice()
    .sort((a, b) => (b.endedAt ?? 0) - (a.endedAt ?? 0))
    .map(session => session.exercises.find(exercise => exercise.exerciseId === exerciseId && exercise.sets.some(set => set.completed)))
    .find((exercise): exercise is WorkoutSessionExercise => Boolean(exercise));
}

export function countSets(exercises: WorkoutSessionExercise[]): number {
  return exercises.filter(exercise => !exercise.skipped).reduce((total, exercise) => total + exercise.sets.length, 0);
}

export function countCompletedSets(session: WorkoutSession): number {
  return session.exercises.reduce((total, exercise) => total + exercise.sets.filter(set => set.completed).length, 0);
}

export function calculateVolume(session: WorkoutSession): number {
  return session.exercises.reduce((total, exercise) => {
    if (exercise.category === '有氧') return total;
    return total + exercise.sets.reduce((sum, set) => sum + (set.completed && Number.isFinite(set.weight) && Number.isFinite(set.reps) && set.weight >= 0 && set.reps > 0 ? set.weight * set.reps : 0), 0);
  }, 0);
}

export function hasIncompleteSets(session: WorkoutSession): boolean {
  return session.exercises.some(exercise => !exercise.skipped && exercise.sets.some(set => !set.completed));
}

export function countIncompleteContent(session: WorkoutSession): { exercises: number; sets: number } {
  const incomplete = session.exercises.filter(exercise => !exercise.skipped && exercise.sets.some(set => !set.completed));
  return {
    exercises: incomplete.length,
    sets: incomplete.reduce((total, exercise) => total + exercise.sets.filter(set => !set.completed).length, 0)
  };
}

export function findNextSet(session: WorkoutSession, fromExercise: number, fromSet: number): { exerciseIndex: number; setIndex: number; set: WorkoutSet } | undefined {
  const length = session.exercises.length;
  if (!length) return undefined;
  const startExercise = fromExercise >= length ? 0 : Math.max(0, fromExercise);
  for (let offset = 0; offset < length; offset += 1) {
    const exerciseIndex = (startExercise + offset) % length;
    const exercise = session.exercises[exerciseIndex];
    if (exercise.skipped) continue;
    const startAt = offset === 0 ? Math.max(0, fromSet) : 0;
    for (let setIndex = startAt; setIndex < exercise.sets.length; setIndex += 1) {
      const set = exercise.sets[setIndex];
      if (!set.completed) return { exerciseIndex, setIndex, set };
    }
  }
  return undefined;
}

export function moveItem<T>(items: T[], index: number, delta: number): T[] {
  const destination = index + delta;
  if (index < 0 || destination < 0 || destination >= items.length) return items;
  const reordered = items.slice();
  [reordered[index], reordered[destination]] = [reordered[destination], reordered[index]];
  return reordered;
}

export function parseRepRange(value: string): [number, number] {
  const parts = value.match(/\d+/g)?.map(Number) ?? [10];
  return [parts[0], parts[1] ?? parts[0]];
}

export function plannedExerciseFromDefinition(exercise: Exercise, order: number): PlannedExercise {
  const [repsMin, repsMax] = parseRepRange(exercise.repRange);
  return {
    id: `planned-${exercise.id}-${Date.now()}-${Math.floor(Math.random() * 10000)}`,
    exerciseId: exercise.id,
    order,
    sets: exercise.sets,
    repsMin,
    repsMax,
    referenceWeight: exercise.referenceWeight,
    restSeconds: exercise.restSeconds
  };
}

function createSetIds(prefix: string, planned: PlannedExercise, previousSets: WorkoutSet[]): WorkoutSet[] {
  return Array.from({ length: planned.sets }, (_, index) => {
    const previous = previousSets[index];
    return createSet(previous?.weight ?? planned.referenceWeight ?? 0, previous?.reps ?? planned.repsMin, index, `${prefix}-${planned.id}`);
  });
}

export function createSessionExercise(planned: PlannedExercise, customExercises: Exercise[], sessions: WorkoutSession[], seed: string): WorkoutSessionExercise {
  const definition = getExercise(planned.exerciseId, customExercises);
  const previous = getPreviousPerformance(planned.exerciseId, sessions);
  const previousSets = previous?.sets.filter(set => set.completed) ?? [];
  return {
    id: `session-exercise-${seed}-${planned.id}`,
    exerciseId: definition.id,
    name: definition.name,
    muscle: definition.muscle,
    category: definition.category,
    restSeconds: planned.restSeconds,
    skipped: false,
    sets: createSetIds(seed, { ...planned, referenceWeight: planned.referenceWeight ?? definition.referenceWeight }, previousSets)
  };
}
