import { db } from '../db/db';
import { defaultAppSettings } from '../db/seed';
import type { StoredAppSettings, TrainingPlan } from '../types';

export async function listTrainingPlans(): Promise<TrainingPlan[]> {
  return db.trainingPlans.orderBy('updatedAt').reverse().toArray();
}

export async function getTrainingPlan(id: string): Promise<TrainingPlan | undefined> {
  return db.trainingPlans.get(id);
}

export async function saveTrainingPlan(plan: TrainingPlan): Promise<void> {
  await db.trainingPlans.put({ ...plan, updatedAt: Date.now() });
}

export async function deleteTrainingPlan(id: string): Promise<void> {
  await db.transaction('rw', db.trainingPlans, db.settings, async () => {
    await db.trainingPlans.delete(id);
    const settings = await getAppSettings();
    if (settings.activePlanId === id) {
      const next = await db.trainingPlans.orderBy('updatedAt').first();
      await db.settings.put({ ...settings, activePlanId: next?.id });
    }
  });
}

export async function getAppSettings(): Promise<StoredAppSettings> {
  return (await db.settings.get('app')) ?? defaultAppSettings;
}

export async function setActiveTrainingPlan(id: string): Promise<void> {
  await db.transaction('rw', db.trainingPlans, db.settings, async () => {
    if (!await db.trainingPlans.get(id)) return;
    const settings = await getAppSettings();
    await db.settings.put({ ...settings, activePlanId: id });
  });
}

export async function duplicateTrainingPlan(plan: TrainingPlan): Promise<TrainingPlan> {
  const now = Date.now();
  const copy: TrainingPlan = {
    ...plan,
    id: `plan-${now}-${Math.floor(Math.random() * 100000)}`,
    name: `${plan.name} 副本`,
    createdAt: now,
    updatedAt: now,
    days: plan.days.map((day, index) => ({
      ...day,
      id: `day-${now}-${index}-${Math.floor(Math.random() * 1000)}`,
      exercises: day.exercises.map((exercise, exerciseIndex) => ({ ...exercise, id: `planned-${now}-${index}-${exerciseIndex}` }))
    }))
  };
  await db.trainingPlans.put(copy);
  return copy;
}
