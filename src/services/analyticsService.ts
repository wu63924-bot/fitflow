import { db } from '../db/db';
import { calculateAnalytics } from './analytics';
import { getNutritionTarget } from '../repositories/settingsRepository';

export async function loadAnalytics(days: number) {
  const [sessions, schedules, weights, meals, exercises, target] = await Promise.all([
    db.workoutSessions.toArray(), db.dailySchedules.toArray(), db.bodyRecords.toArray(), db.meals.toArray(), db.exercises.toArray(), getNutritionTarget()
  ]);
  return calculateAnalytics({ sessions, schedules, weights, meals, exercises, target }, days);
}
