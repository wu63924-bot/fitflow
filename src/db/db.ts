import Dexie, { type EntityTable } from 'dexie';
import type { BodyRecord, DailySchedule, Exercise, FavoriteFood, Food, RecentFood, TrainingPlan, WorkoutSession } from '../types';
import type { StoredAppSettings, StoredMeal, StoredNutritionTarget } from '../types';
import { migrateMealRecord } from '../utils/nutrition';

export const db = new Dexie('FitFlowDB') as Dexie & {
  trainingPlans: EntityTable<TrainingPlan, 'id'>;
  exercises: EntityTable<Exercise, 'id'>;
  workoutSessions: EntityTable<WorkoutSession, 'id'>;
  dailySchedules: EntityTable<DailySchedule, 'id'>;
  meals: EntityTable<StoredMeal, 'id'>;
  foods: EntityTable<Food, 'id'>;
  favoriteFoods: EntityTable<FavoriteFood, 'foodId'>;
  recentFoods: EntityTable<RecentFood, 'foodId'>;
  bodyRecords: EntityTable<BodyRecord, 'date'>;
  nutritionTargets: EntityTable<StoredNutritionTarget, 'id'>;
  settings: EntityTable<StoredAppSettings, 'id'>;
};

db.version(1).stores({
  trainingPlans: '&id, name, updatedAt',
  exercises: '&id, name, category, isCustom',
  workoutSessions: '&id, sessionId, status, startedAt, endedAt, planId, workoutDayId',
  meals: '&id, type, date',
  bodyRecords: '&date',
  nutritionTargets: '&id',
  settings: '&id, activePlanId'
});

db.version(2).stores({
  trainingPlans: '&id, name, updatedAt',
  exercises: '&id, name, category, isCustom',
  workoutSessions: '&id, sessionId, status, startedAt, endedAt, planId, workoutDayId',
  dailySchedules: '&id, date, type, status, workoutSessionId, updatedAt',
  meals: '&id, type, date',
  bodyRecords: '&date',
  nutritionTargets: '&id',
  settings: '&id, activePlanId'
});

db.version(3).stores({
  trainingPlans: '&id, name, updatedAt',
  exercises: '&id, name, category, isCustom',
  workoutSessions: '&id, sessionId, status, startedAt, endedAt, planId, workoutDayId',
  dailySchedules: '&id, date, type, status, workoutSessionId, updatedAt',
  meals: '&id, type, date',
  foods: '&id, name, category, isCustom',
  favoriteFoods: '&foodId, createdAt',
  recentFoods: '&foodId, lastUsedAt',
  bodyRecords: '&date',
  nutritionTargets: '&id',
  settings: '&id, activePlanId'
}).upgrade(async transaction => {
  const meals = transaction.table('meals');
  const records = await meals.toArray() as unknown[];
  for (const record of records) await meals.put(migrateMealRecord(record));
});
