import { db } from '../db/db';
import type { WorkoutSession } from '../types';

export async function listWorkoutSessions(): Promise<WorkoutSession[]> {
  return db.workoutSessions.orderBy('startedAt').reverse().toArray();
}

export async function listCompletedSessions(): Promise<WorkoutSession[]> {
  const sessions = await db.workoutSessions.where('status').equals('completed').toArray();
  return sessions.sort((a, b) => (b.endedAt ?? 0) - (a.endedAt ?? 0));
}

export async function getWorkoutSession(id: string): Promise<WorkoutSession | undefined> {
  return db.workoutSessions.get(id);
}

export async function getInProgressSession(): Promise<WorkoutSession | undefined> {
  return db.workoutSessions.where('status').equals('in_progress').first();
}

export async function saveWorkoutSession(session: WorkoutSession): Promise<void> {
  await db.workoutSessions.put(session);
}

export async function mutateWorkoutSession(id: string, update: (session: WorkoutSession) => void): Promise<WorkoutSession | undefined> {
  return db.transaction('rw', [db.workoutSessions, db.dailySchedules], async () => {
    const current = await db.workoutSessions.get(id);
    if (!current) return undefined;
    const changed = cloneSession(current);
    update(changed);
    await db.workoutSessions.put(changed);
    if (changed.status === 'completed') {
      const schedule = await db.dailySchedules.where('workoutSessionId').equals(id).first();
      if (schedule) await db.dailySchedules.put({ ...schedule, status: 'completed', updatedAt: Date.now() });
    }
    return changed;
  });
}

export async function deleteWorkoutSession(id: string): Promise<void> {
  await db.transaction('rw', [db.workoutSessions, db.dailySchedules], async () => {
    await db.workoutSessions.delete(id);
    const schedule = await db.dailySchedules.where('workoutSessionId').equals(id).first();
    if (!schedule) return;
    if (schedule.note?.trim()) {
      await db.dailySchedules.put({ ...schedule, type: undefined, status: 'planned', workoutTemplate: undefined, cardioData: undefined, workoutSessionId: undefined, updatedAt: Date.now() });
    } else {
      await db.dailySchedules.delete(schedule.id);
    }
  });
}

function cloneSession(session: WorkoutSession): WorkoutSession {
  return {
    ...session,
    restTimer: session.restTimer ? { ...session.restTimer } : undefined,
    exercises: session.exercises.map(exercise => ({ ...exercise, sets: exercise.sets.map(set => ({ ...set })) }))
  };
}
