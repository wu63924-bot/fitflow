import { db } from '../db/db';
import { defaultAppSettings, defaultNutritionTarget } from '../db/seed';
import type { StoredAppSettings, StoredNutritionTarget } from '../types';

export async function getSettings(): Promise<StoredAppSettings> {
  return (await db.settings.get('app')) ?? defaultAppSettings;
}

export async function saveSettings(settings: StoredAppSettings): Promise<void> {
  await db.settings.put(settings);
}

export async function getNutritionTarget(): Promise<StoredNutritionTarget> {
  return (await db.nutritionTargets.get('current')) ?? defaultNutritionTarget;
}

export async function saveNutritionTarget(target: StoredNutritionTarget): Promise<void> {
  await db.nutritionTargets.put({ ...target, id: 'current' });
}
