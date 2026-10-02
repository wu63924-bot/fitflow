import { db } from './db';
import { mockExercises, mockNutritionTarget, mockUser, mockWorkoutPlan } from '../data/mock';
import { builtinFoods } from '../data/foodCatalog';
import { plannedExerciseFromDefinition } from '../utils/workout';
import type { StoredAppSettings, StoredNutritionTarget, TrainingSettings } from '../types';

export const defaultTrainingSettings: TrainingSettings = {
  defaultRestSeconds: 90,
  vibrationEnabled: true,
  soundEnabled: false,
  autoRestTimer: true,
  weightUnit: 'kg'
};

export const defaultAppSettings: StoredAppSettings = {
  id: 'app',
  activePlanId: mockWorkoutPlan.id,
  trainingSettings: defaultTrainingSettings,
  user: mockUser
};

export const defaultNutritionTarget: StoredNutritionTarget = { ...mockNutritionTarget, id: 'current' };

export async function initializeDatabase(): Promise<void> {
  await db.transaction('rw', [db.trainingPlans, db.exercises, db.foods, db.bodyRecords, db.nutritionTargets, db.settings], async () => {
    if (await db.trainingPlans.count() === 0) await db.trainingPlans.put(clonePlan());
    if (await db.exercises.count() === 0) await db.exercises.bulkPut(mockExercises.map(exercise => ({ ...exercise })));
    for (const food of builtinFoods) if (!await db.foods.get(food.id)) await db.foods.add(food);
    if (!await db.nutritionTargets.get('current')) await db.nutritionTargets.put(defaultNutritionTarget);
    if (!await db.settings.get('app')) await db.settings.put(defaultAppSettings);
  });
}

function clonePlan() {
  const presets: Record<string, string[]> = {
    'ppl-tue': ['lat-pulldown', 'barbell-row', 'seated-row', 'barbell-curl'],
    'ppl-wed': ['squat', 'leg-press', 'plank'],
    'ppl-fri': ['bench', 'incline-dumbbell', 'lateral-raise', 'pushdown'],
    'ppl-sat': ['lat-pulldown', 'barbell-row', 'seated-row', 'barbell-curl']
  };
  const definitions = new Map(mockExercises.map(exercise => [exercise.id, exercise]));
  return {
    ...mockWorkoutPlan,
    days: mockWorkoutPlan.days.map(day => ({
      ...day,
      exercises: day.exercises.length ? day.exercises.map(exercise => ({ ...exercise }))
        : (presets[day.id] ?? []).flatMap((exerciseId, order) => {
          const definition = definitions.get(exerciseId);
          return definition ? [{ ...plannedExerciseFromDefinition(definition, order), order }] : [];
        })
    }))
  };
}

