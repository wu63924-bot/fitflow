import { db } from '../db/db';
import { initializeDatabase } from '../db/seed';
import { builtinFoods } from '../data/foodCatalog';
import { dateKey } from '../utils/format';
import { migrateMealRecord } from '../utils/nutrition';
import type { BackupData, FitFlowBackup } from '../types';
import type { BodyRecord, DailySchedule, Exercise, FavoriteFood, Food, RecentFood, TrainingPlan, WorkoutSession } from '../types';
import type { StoredAppSettings, StoredMeal, StoredNutritionTarget } from '../types';
import { listAllBodyRecords } from '../repositories/bodyRecordRepository';
import { listDailySchedules } from '../repositories/dailyScheduleRepository';
import { listAllMeals } from '../repositories/mealRepository';
import { listExercises } from '../repositories/exerciseRepository';
import { listTrainingPlans } from '../repositories/trainingPlanRepository';
import { listWorkoutSessions } from '../repositories/workoutRepository';
import { getNutritionTarget, getSettings } from '../repositories/settingsRepository';

export async function createBackup(): Promise<FitFlowBackup> {
  const [trainingPlans, exercises, workoutSessions, dailySchedules, meals, foods, favoriteFoods, recentFoods, bodyRecords, nutritionTarget, settings] = await Promise.all([
    listTrainingPlans(), listExercises(), listWorkoutSessions(), listDailySchedules(), listAllMeals(), db.foods.toArray(),
    db.favoriteFoods.toArray(), db.recentFoods.toArray(), listAllBodyRecords(), getNutritionTarget(), getSettings()
  ]);
  return { version: 3, app: 'FitFlow', exportedAt: new Date().toISOString(), data: { trainingPlans, exercises, workoutSessions, dailySchedules, meals, foods, favoriteFoods, recentFoods, bodyRecords, nutritionTarget, settings } };
}

export function parseBackup(text: string): FitFlowBackup {
  const value: unknown = JSON.parse(text);
  if (!isRecord(value) || (value.version !== 1 && value.version !== 2 && value.version !== 3) || value.app !== 'FitFlow' || !isRecord(value.data)) throw new Error('备份文件版本或应用标识无效');
  const data = value.data;
  const version = value.version;
  const dailySchedules = version === 1 ? [] : data.dailySchedules;
  const legacyMeals = version !== 3;
  if (!Array.isArray(data.trainingPlans) || !data.trainingPlans.every(isTrainingPlan)
    || !Array.isArray(data.exercises) || !data.exercises.every(isExercise)
    || !Array.isArray(data.workoutSessions) || !data.workoutSessions.every(isWorkoutSession)
    || !Array.isArray(data.meals) || !data.meals.every(meal => legacyMeals ? isLegacyMeal(meal) : isStoredMeal(meal))
    || !Array.isArray(data.bodyRecords) || !data.bodyRecords.every(isBodyRecord)
    || !Array.isArray(dailySchedules) || !dailySchedules.every(isDailySchedule)
    || !isStoredNutritionTarget(data.nutritionTarget) || !isStoredAppSettings(data.settings)) {
    throw new Error('备份内容不完整或格式不正确');
  }

  const foods = version === 3 ? data.foods : builtinFoods;
  const favoriteFoods = version === 3 ? data.favoriteFoods : [];
  const recentFoods = version === 3 ? data.recentFoods : [];
  if (!Array.isArray(foods) || !foods.every(isFood) || !Array.isArray(favoriteFoods) || !favoriteFoods.every(isFavoriteFood)
    || !Array.isArray(recentFoods) || !recentFoods.every(isRecentFood)) throw new Error('备份中的食物资料格式不正确');

  const backup: FitFlowBackup = {
    version: 3,
    sourceVersion: value.version,
    app: 'FitFlow',
    exportedAt: typeof value.exportedAt === 'string' ? value.exportedAt : '',
    data: {
      trainingPlans: data.trainingPlans,
      exercises: data.exercises,
      workoutSessions: data.workoutSessions,
      dailySchedules,
      meals: legacyMeals ? data.meals.map(migrateMealRecord) : data.meals,
      foods,
      favoriteFoods,
      recentFoods,
      bodyRecords: data.bodyRecords,
      nutritionTarget: data.nutritionTarget,
      settings: data.settings
    } as BackupData
  };
  const allFoodIds = new Set(backup.data.foods.map(food => food.id));
  if (!unique(backup.data.trainingPlans.map(item => item.id)) || !unique(backup.data.exercises.map(item => item.id))
    || !unique(backup.data.workoutSessions.map(item => item.id)) || !unique(backup.data.meals.map(item => item.id))
    || !unique(backup.data.bodyRecords.map(item => item.date)) || !unique(backup.data.dailySchedules.map(item => item.id))
    || !unique(backup.data.dailySchedules.map(item => item.date)) || !unique(backup.data.foods.map(item => item.id))
    || !unique(backup.data.favoriteFoods.map(item => item.foodId)) || !unique(backup.data.recentFoods.map(item => item.foodId))
    || backup.data.favoriteFoods.some(item => !allFoodIds.has(item.foodId)) || backup.data.recentFoods.some(item => !allFoodIds.has(item.foodId))) {
    throw new Error('备份文件中有重复的数据标识或失效的食物引用');
  }
  return backup;
}

export async function restoreBackup(backup: FitFlowBackup): Promise<void> {
  const data = backup.data;
  await db.transaction('rw', [db.trainingPlans, db.exercises, db.workoutSessions, db.dailySchedules, db.meals, db.foods, db.favoriteFoods, db.recentFoods, db.bodyRecords, db.nutritionTargets, db.settings], async () => {
    await Promise.all([db.trainingPlans.clear(), db.exercises.clear(), db.workoutSessions.clear(), db.dailySchedules.clear(), db.meals.clear(), db.foods.clear(), db.favoriteFoods.clear(), db.recentFoods.clear(), db.bodyRecords.clear(), db.nutritionTargets.clear(), db.settings.clear()]);
    if (data.trainingPlans.length) await db.trainingPlans.bulkPut(data.trainingPlans);
    if (data.exercises.length) await db.exercises.bulkPut(data.exercises);
    if (data.workoutSessions.length) await db.workoutSessions.bulkPut(data.workoutSessions);
    if (data.dailySchedules.length) await db.dailySchedules.bulkPut(data.dailySchedules);
    if (data.meals.length) await db.meals.bulkPut(data.meals);
    if (data.foods.length) await db.foods.bulkPut(data.foods);
    if (data.favoriteFoods.length) await db.favoriteFoods.bulkPut(data.favoriteFoods);
    if (data.recentFoods.length) await db.recentFoods.bulkPut(data.recentFoods);
    if (data.bodyRecords.length) await db.bodyRecords.bulkPut(data.bodyRecords);
    await db.nutritionTargets.put(data.nutritionTarget);
    await db.settings.put(data.settings);
  });
  await initializeDatabase();
}

export async function clearLocalData(): Promise<void> {
  await db.delete();
  await db.open();
  await initializeDatabase();
}

export function backupCounts(backup: FitFlowBackup) {
  return {
    plans: backup.data.trainingPlans.length,
    sessions: backup.data.workoutSessions.length,
    schedules: backup.data.dailySchedules.length,
    meals: backup.data.meals.reduce((count, meal) => count + meal.items.length, 0),
    foods: backup.data.foods.length,
    favorites: backup.data.favoriteFoods.length,
    bodyRecords: backup.data.bodyRecords.length
  };
}

function isTrainingPlan(value: unknown): value is TrainingPlan {
  return isRecord(value) && typeof value.id === 'string' && typeof value.name === 'string' && Array.isArray(value.days);
}
function isExercise(value: unknown): value is Exercise {
  return isRecord(value) && typeof value.id === 'string' && typeof value.name === 'string';
}
function isWorkoutSession(value: unknown): value is WorkoutSession {
  return isRecord(value) && typeof value.id === 'string' && Array.isArray(value.exercises) && (value.status === 'in_progress' || value.status === 'completed');
}
function isDailySchedule(value: unknown): value is DailySchedule {
  if (!isRecord(value) || typeof value.id !== 'string' || typeof value.date !== 'string' || value.id !== value.date
    || !['planned', 'in_progress', 'completed'].includes(String(value.status))
    || (value.type !== undefined && !['strength', 'cardio', 'rest'].includes(String(value.type)))) return false;
  const parsedDate = new Date(`${value.date}T12:00:00`);
  if (Number.isNaN(parsedDate.getTime()) || dateKey(parsedDate) !== value.date) return false;
  if (value.type === 'strength') {
    const template = value.workoutTemplate;
    if (!isRecord(template) || typeof template.planName !== 'string' || typeof template.workoutDayName !== 'string' || !Array.isArray(template.exercises)) return false;
    if (!template.exercises.every(exercise => isRecord(exercise) && typeof exercise.exerciseId === 'string'
      && typeof exercise.name === 'string' && typeof exercise.muscle === 'string' && typeof exercise.category === 'string'
      && typeof exercise.restSeconds === 'number' && Number.isFinite(exercise.restSeconds) && Array.isArray(exercise.sets)
      && exercise.sets.every(set => isRecord(set) && typeof set.weight === 'number' && Number.isFinite(set.weight) && typeof set.reps === 'number' && Number.isFinite(set.reps)))) return false;
  }
  if (value.type === 'cardio') {
    const cardio = value.cardioData;
    if (!isRecord(cardio) || !['跑步', '骑行', '椭圆机', '爬楼机', '跳绳', '游泳', '其他'].includes(String(cardio.activity))) return false;
    if (['plannedDurationMinutes', 'actualDurationMinutes', 'distanceKm'].some(key => cardio[key] !== undefined && (typeof cardio[key] !== 'number' || !Number.isFinite(cardio[key] as number)))) return false;
    if (cardio.note !== undefined && typeof cardio.note !== 'string') return false;
  }
  return typeof value.createdAt === 'number' && Number.isFinite(value.createdAt)
    && typeof value.updatedAt === 'number' && Number.isFinite(value.updatedAt)
    && (value.note === undefined || typeof value.note === 'string')
    && (value.workoutSessionId === undefined || typeof value.workoutSessionId === 'string');
}
function isStoredMeal(value: unknown): value is StoredMeal {
  return isRecord(value) && typeof value.id === 'string' && typeof value.date === 'string' && isMealType(value.type)
    && typeof value.title === 'string' && finite(value.createdAt) && finite(value.updatedAt)
    && Array.isArray(value.items) && value.items.every(isMealItem);
}
function isLegacyMeal(value: unknown): value is Record<string, unknown> {
  return isRecord(value) && typeof value.id === 'string' && typeof value.date === 'string' && Array.isArray(value.items)
    && value.items.every(item => isRecord(item) && typeof item.name === 'string' && finite(item.amount)
      && ['calories', 'protein', 'carbs', 'fat'].every(key => finite(item[key])));
}
function isMealItem(value: unknown): boolean {
  if (!isRecord(value) || typeof value.id !== 'string' || typeof value.foodId !== 'string' || typeof value.foodNameSnapshot !== 'string'
    || !finite(value.amount) || value.amount <= 0 || !isMealAmountUnit(value.unit) || !isRecord(value.nutritionSnapshot)) return false;
  const snapshot = value.nutritionSnapshot;
  return ['calories', 'protein', 'carbs', 'fat'].every(key => finite(snapshot[key]) && snapshot[key] >= 0)
    && finite(snapshot.referenceAmount) && snapshot.referenceAmount > 0 && isMealAmountUnit(snapshot.referenceUnit)
    && (snapshot.gramsPerUnit === undefined || (finite(snapshot.gramsPerUnit) && snapshot.gramsPerUnit > 0));
}
function isFood(value: unknown): value is Food {
  return isRecord(value) && typeof value.id === 'string' && typeof value.name === 'string' && !!value.name.trim()
    && ['主食', '肉类', '蛋奶', '蔬菜', '水果', '豆制品', '饮品', '零食', '其他'].includes(String(value.category))
    && finite(value.servingBase) && value.servingBase > 0 && isFoodUnit(value.servingUnit)
    && (value.nutritionUnit === 'g' || value.nutritionUnit === 'ml') && value.nutritionPer === 100
    && ['calories', 'protein', 'carbs', 'fat'].every(key => finite(value[key]) && value[key] >= 0)
    && (value.gramsPerUnit === undefined || (finite(value.gramsPerUnit) && value.gramsPerUnit > 0))
    && (value.isCustom === undefined || typeof value.isCustom === 'boolean');
}
function isFavoriteFood(value: unknown): value is FavoriteFood {
  return isRecord(value) && typeof value.foodId === 'string' && finite(value.createdAt);
}
function isRecentFood(value: unknown): value is RecentFood {
  return isRecord(value) && typeof value.foodId === 'string' && finite(value.lastUsedAt);
}
function isMealType(value: unknown): value is StoredMeal['type'] {
  return value === 'breakfast' || value === 'lunch' || value === 'dinner' || value === 'snack';
}
function isMealAmountUnit(value: unknown): value is 'g' | 'ml' | '个' | '份' {
  return value === 'g' || value === 'ml' || value === '个' || value === '份';
}
function isFoodUnit(value: unknown): value is Food['servingUnit'] {
  return value === 'g' || value === 'ml' || value === '个';
}
function isBodyRecord(value: unknown): value is BodyRecord {
  return isRecord(value) && typeof value.date === 'string' && finite(value.weight) && finite(value.height);
}
function isStoredNutritionTarget(value: unknown): value is StoredNutritionTarget {
  return isRecord(value) && value.id === 'current' && ['calories', 'protein', 'carbs', 'fat'].every(key => finite(value[key]) && (value[key] as number) >= 0);
}
function isStoredAppSettings(value: unknown): value is StoredAppSettings {
  return isRecord(value) && value.id === 'app' && isRecord(value.trainingSettings) && isRecord(value.user);
}
function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}
function finite(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}
function unique(values: string[]): boolean {
  return new Set(values).size === values.length;
}
