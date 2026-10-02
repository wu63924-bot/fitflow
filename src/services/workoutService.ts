import { dateKey } from '../utils/format';
import { createSessionExercise } from '../utils/workout';
import type { PlannedExercise, WorkoutDay, WorkoutSession } from '../types';
import { listExercises } from '../repositories/exerciseRepository';
import { getInProgressSession, listWorkoutSessions, saveWorkoutSession } from '../repositories/workoutRepository';
import { getDailySchedule } from '../repositories/dailyScheduleRepository';
import { createStrengthTemplateFromPlan, saveDailySchedule, startScheduledStrengthWorkout } from './scheduleService';

export async function startWorkout(planId: string, dayId: string): Promise<WorkoutSession> {
  const inProgress = await getInProgressSession();
  if (inProgress) return inProgress;
  const today = dateKey(new Date());
  const schedule = await getDailySchedule(today);
  if (!schedule?.type) {
    const workoutTemplate = await createStrengthTemplateFromPlan(planId, dayId);
    await saveDailySchedule(today, { type: 'strength', workoutTemplate });
  }
  return startScheduledStrengthWorkout(today);
}

export async function addExerciseToWorkout(sessionId: string, planned: PlannedExercise): Promise<WorkoutSession | undefined> {
  const sessions = await listWorkoutSessions();
  const session = sessions.find(item => item.id === sessionId && item.status === 'in_progress');
  if (!session) return undefined;
  const [exercises, workoutSessions] = await Promise.all([listExercises(), listWorkoutSessions()]);
  session.exercises.push(createSessionExercise(planned, exercises.filter(exercise => exercise.isCustom), workoutSessions, session.id));
  session.currentExerciseIndex = session.exercises.length - 1;
  await saveWorkoutSession(session);
  return session;
}

export function estimateWorkoutMinutes(day: WorkoutDay): number {
  return Math.max(0, Math.round(day.exercises.reduce((total, exercise) => total + exercise.sets * 2 + exercise.restSeconds / 60, 0)));
}
