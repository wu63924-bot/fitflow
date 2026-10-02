import { db } from '../db/db';
import type { Exercise } from '../types';

export async function listExercises(): Promise<Exercise[]> {
  return db.exercises.orderBy('name').toArray();
}

export async function saveExercise(exercise: Exercise): Promise<void> {
  await db.exercises.put({ ...exercise, isCustom: true });
}

export async function deleteExercise(id: string): Promise<void> {
  await db.exercises.delete(id);
}
