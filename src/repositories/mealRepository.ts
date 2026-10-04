import { db } from '../db/db';
import { dateKey } from '../utils/format';
import { createMealItem, withAmount } from '../utils/nutrition';
import type { Food, MealItem, MealType, StoredMeal } from '../types';

export const mealTitles: Record<MealType, string> = { breakfast: '早餐', lunch: '午餐', dinner: '晚餐', snack: '加餐' };
export const mealOrder: MealType[] = ['breakfast', 'lunch', 'dinner', 'snack'];

export function emptyMeal(date: string, type: MealType): StoredMeal {
  return { id: `${date}-${type}`, date, type, title: mealTitles[type], items: [], createdAt: 0, updatedAt: 0 };
}

export async function listMealsForDate(date: string): Promise<StoredMeal[]> {
  const existing = await db.meals.where('date').equals(date).toArray();
  const byType = new Map(existing.map(meal => [meal.type, meal]));
  return mealOrder.map(type => byType.get(type) ?? emptyMeal(date, type));
}

export async function getMealsForDate(date: string): Promise<StoredMeal[]> {
  return listMealsForDate(date);
}

export async function addFoodToMeal(date: string, type: MealType, food: Food, amount: number): Promise<StoredMeal> {
  assertNotFuture(date);
  const item = createMealItem(food, amount);
  return db.transaction('rw', db.meals, async () => {
    const meal = await getStoredMeal(date, type);
    meal.items.push(item);
    meal.updatedAt = Date.now();
    await db.meals.put(meal);
    return meal;
  });
}

export async function addMealItems(date: string, type: MealType, items: MealItem[]): Promise<StoredMeal> {
  assertNotFuture(date);
  if (!items.length) throw new Error('请至少添加一种食物');
  items.forEach(item => withAmount(item, item.amount));
  return db.transaction('rw', db.meals, async () => {
    const meal = await getStoredMeal(date, type);
    // Stable draft IDs make retries idempotent within the selected meal.
    const existing = new Set(meal.items.map(item => item.id));
    for (const item of items) {
      if (existing.has(item.id)) continue;
      meal.items.push(cloneItem(item, false));
      existing.add(item.id);
    }
    meal.updatedAt = Date.now();
    await db.meals.put(meal);
    return meal;
  });
}

export async function removeFoodFromMeal(date: string, type: MealType, itemId: string): Promise<{ item: MealItem; index: number } | undefined> {
  const meal = await findStoredMeal(date, type);
  if (!meal) return undefined;
  const index = meal.items.findIndex(item => item.id === itemId);
  if (index < 0) return undefined;
  const [item] = meal.items.splice(index, 1);
  meal.updatedAt = Date.now();
  await db.meals.put(meal);
  return { item, index };
}

export async function restoreFoodToMeal(date: string, type: MealType, item: MealItem, index: number): Promise<void> {
  assertNotFuture(date);
  const meal = await getStoredMeal(date, type);
  meal.items.splice(Math.max(0, Math.min(index, meal.items.length)), 0, cloneItem(item, false));
  meal.updatedAt = Date.now();
  await db.meals.put(meal);
}

export async function updateFoodAmount(date: string, type: MealType, itemId: string, amount: number): Promise<void> {
  assertNotFuture(date);
  const meal = await findStoredMeal(date, type);
  if (!meal) return;
  const index = meal.items.findIndex(item => item.id === itemId);
  if (index < 0) return;
  meal.items[index] = withAmount(meal.items[index], amount);
  meal.updatedAt = Date.now();
  await db.meals.put(meal);
}

export async function moveFoodToMeal(date: string, from: MealType, to: MealType, itemId: string): Promise<void> {
  assertNotFuture(date);
  if (from === to) return;
  await db.transaction('rw', db.meals, async () => {
    const source = await findStoredMeal(date, from);
    if (!source) return;
    const index = source.items.findIndex(item => item.id === itemId);
    if (index < 0) return;
    const [item] = source.items.splice(index, 1);
    source.updatedAt = Date.now();
    const destination = await getStoredMeal(date, to);
    destination.items.push(item);
    destination.updatedAt = Date.now();
    await db.meals.bulkPut([source, destination]);
  });
}

export async function clearMeal(date: string, type: MealType): Promise<void> {
  assertNotFuture(date);
  const meal = await findStoredMeal(date, type);
  if (meal) await db.meals.delete(meal.id);
}

export async function copyMeal(sourceDate: string, sourceType: MealType, targetDate: string, targetType: MealType): Promise<number> {
  assertNotFuture(targetDate);
  return db.transaction('rw', db.meals, async () => {
    const source = await findStoredMeal(sourceDate, sourceType);
    if (!source?.items.length) return 0;
    const target = await getStoredMeal(targetDate, targetType);
    const copied = source.items.map(item => cloneItem(item));
    target.items.push(...copied);
    target.updatedAt = Date.now();
    await db.meals.put(target);
    return copied.length;
  });
}

export async function listAllMeals(): Promise<StoredMeal[]> {
  return db.meals.toArray();
}

async function getStoredMeal(date: string, type: MealType): Promise<StoredMeal> {
  return await findStoredMeal(date, type) ?? { ...emptyMeal(date, type), createdAt: Date.now(), updatedAt: Date.now() };
}

async function findStoredMeal(date: string, type: MealType): Promise<StoredMeal | undefined> {
  return (await db.meals.where('date').equals(date).toArray()).find(meal => meal.type === type);
}

function cloneItem(item: MealItem, newId = true): MealItem {
  return { ...item, id: newId ? crypto.randomUUID() : item.id, nutritionSnapshot: { ...item.nutritionSnapshot } };
}

function assertNotFuture(date: string): void {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new Error('日期格式无效');
  if (date > dateKey(new Date())) throw new Error('未来日期不能记录已吃食物');
}
