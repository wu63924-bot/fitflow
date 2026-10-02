import { db } from '../db/db';
import type { DailySchedule } from '../types';

export async function getDailySchedule(date: string): Promise<DailySchedule | undefined> {
  return db.dailySchedules.get(date);
}

export async function listDailySchedules(): Promise<DailySchedule[]> {
  return db.dailySchedules.orderBy('date').toArray();
}
