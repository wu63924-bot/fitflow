export * from './domain';

import type { BodyRecord, DailySchedule, Exercise, Food, Meal, MealItem, NutritionTarget, TrainingPlan, TrainingSettings, User, WorkoutSession } from './domain';

export type StoredMealItem = MealItem;

export interface StoredMeal extends Omit<Meal, 'items'> {
  date: string;
  createdAt: number;
  updatedAt: number;
  items: StoredMealItem[];
}

export interface StoredNutritionTarget extends NutritionTarget {
  id: 'current';
}

export interface StoredAppSettings {
  id: 'app';
  activePlanId?: string;
  trainingSettings: TrainingSettings;
  user: User;
}

export interface FavoriteFood {
  foodId: string;
  createdAt: number;
}

export interface RecentFood {
  foodId: string;
  lastUsedAt: number;
}

export interface BackupData {
  trainingPlans: TrainingPlan[];
  exercises: Exercise[];
  workoutSessions: WorkoutSession[];
  dailySchedules: DailySchedule[];
  meals: StoredMeal[];
  foods: Food[];
  favoriteFoods: FavoriteFood[];
  recentFoods: RecentFood[];
  bodyRecords: BodyRecord[];
  nutritionTarget: StoredNutritionTarget;
  settings: StoredAppSettings;
}

export interface FitFlowBackup {
  version: 3;
  sourceVersion?: 1 | 2 | 3;
  app: 'FitFlow';
  exportedAt: string;
  data: BackupData;
}

