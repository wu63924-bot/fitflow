import { db } from '../db/db';
import type { BodyRecord } from '../types';

export async function listBodyRecords(): Promise<BodyRecord[]> {
  return db.bodyRecords.orderBy('date').reverse().toArray();
}

export async function saveBodyRecord(record: BodyRecord): Promise<void> {
  await db.bodyRecords.put(record);
}

export async function deleteBodyRecord(date: string): Promise<void> {
  await db.bodyRecords.delete(date);
}

export async function listAllBodyRecords(): Promise<BodyRecord[]> {
  return db.bodyRecords.toArray();
}
