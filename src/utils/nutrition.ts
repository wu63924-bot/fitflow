import type { Food, Meal, MealAmountUnit, MealItem, NutritionSnapshot, NutritionTarget } from '../types';

export interface NutritionSummary {
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
}

export function nutritionSnapshotForFood(food: Food): NutritionSnapshot {
  return {
    calories: food.calories,
    protein: food.protein,
    carbs: food.carbs,
    fat: food.fat,
    referenceAmount: food.nutritionPer,
    referenceUnit: food.nutritionUnit,
    gramsPerUnit: food.gramsPerUnit
  };
}

export function createMealItem(food: Food, amount: number, id: string = crypto.randomUUID()): MealItem {
  if (!Number.isFinite(amount) || amount <= 0 || amount > 10000) throw new Error('份量需大于 0 且不超过 10000');
  const item: MealItem = {
    id,
    foodId: food.id,
    foodNameSnapshot: food.name,
    amount,
    unit: food.servingUnit,
    nutritionSnapshot: nutritionSnapshotForFood(food)
  };
  return withAmount(item, amount);
}

export function createMealItemInGrams(food: Food, grams: number, id?: string): MealItem {
  if (food.nutritionUnit !== 'g') throw new Error('该食物按毫升计算，请在食物库手动记录');
  return createMealItem({ ...food, servingUnit: 'g' }, grams, id);
}

export function withAmount(item: MealItem, amount: number): MealItem {
  if (!Number.isFinite(amount) || amount <= 0 || amount > 10000) throw new Error('份量需大于 0 且不超过 10000');
  const gramsEquivalent = item.unit === 'g' ? amount
    : item.unit === '个' && item.nutritionSnapshot.gramsPerUnit ? amount * item.nutritionSnapshot.gramsPerUnit
      : undefined;
  return { ...item, amount, gramsEquivalent };
}

export function calculateMealItem(item: MealItem): NutritionSummary {
  const snapshot = item.nutritionSnapshot;
  const amount = item.unit === snapshot.referenceUnit
    ? item.amount
    : snapshot.referenceUnit === 'g' && item.gramsEquivalent !== undefined
      ? item.gramsEquivalent
      : item.amount;
  const multiplier = amount / snapshot.referenceAmount;
  return {
    calories: snapshot.calories * multiplier,
    protein: snapshot.protein * multiplier,
    carbs: snapshot.carbs * multiplier,
    fat: snapshot.fat * multiplier
  };
}

export function sumNutrition(meals: Pick<Meal, 'items'>[]): NutritionSummary {
  return meals.reduce((total, meal) => meal.items.reduce((current, item) => add(current, calculateMealItem(item)), total), zeroNutrition());
}

export function sumItems(items: MealItem[]): NutritionSummary {
  return items.reduce((total, item) => add(total, calculateMealItem(item)), zeroNutrition());
}

export function progressPercent(value: number, target: number): number {
  return target > 0 ? Math.min(100, Math.round(value / target * 100)) : 0;
}

export function targetSnapshot(target: NutritionTarget): NutritionSummary {
  return { ...target };
}

export function migrateMealRecord(value: unknown): import('../types').StoredMeal {
  if (!isRecord(value)) throw new Error('饮食记录格式无效');
  const type = isMealType(value.type) ? value.type : 'snack';
  const title = typeof value.title === 'string' ? value.title : mealTitle(type);
  // V1/V2 seeded demo rows used these fixed IDs; real entries were timestamped.
  const items = Array.isArray(value.items) ? value.items.map(migrateMealItem).filter(item => !legacyDemoItemIds.has(item.id)) : [];
  return {
    id: typeof value.id === 'string' ? value.id : crypto.randomUUID(),
    date: typeof value.date === 'string' ? value.date : '',
    type,
    title,
    createdAt: finiteOr(value.createdAt, Date.now()),
    updatedAt: finiteOr(value.updatedAt, Date.now()),
    items
  };
}

const legacyDemoItemIds = new Set(['oats', 'eggs', 'milk', 'rice', 'chicken', 'broccoli', 'yogurt-snack', 'banana-snack', 'nuts-snack']);

function migrateMealItem(value: unknown): MealItem {
  if (!isRecord(value)) throw new Error('餐食项目格式无效');
  if (isMealItem(value)) return value;
  const amount = positive(value.amount) ? value.amount : 1;
  const unit = isMealAmountUnit(value.unit) ? value.unit : isMealAmountUnit(value.amountUnit) ? value.amountUnit : '份';
  const oldNutrition = {
    calories: nonnegative(value.calories),
    protein: nonnegative(value.protein),
    carbs: nonnegative(value.carbs),
    fat: nonnegative(value.fat)
  };
  const nutritionSnapshot: NutritionSnapshot = {
    ...oldNutrition,
    referenceAmount: amount,
    referenceUnit: unit
  };
  return {
    id: typeof value.id === 'string' ? value.id : crypto.randomUUID(),
    foodId: typeof value.foodId === 'string' ? value.foodId : `legacy-${String(value.id ?? crypto.randomUUID())}`,
    foodNameSnapshot: typeof value.foodNameSnapshot === 'string' ? value.foodNameSnapshot : typeof value.name === 'string' ? value.name : '未知食物',
    amount,
    unit,
    gramsEquivalent: positive(value.gramsEquivalent) ? value.gramsEquivalent : undefined,
    nutritionSnapshot
  };
}

function isMealItem(value: unknown): value is MealItem {
  return isRecord(value) && typeof value.id === 'string' && typeof value.foodId === 'string' && typeof value.foodNameSnapshot === 'string'
    && positive(value.amount) && isMealAmountUnit(value.unit) && isNutritionSnapshot(value.nutritionSnapshot);
}

function isNutritionSnapshot(value: unknown): value is NutritionSnapshot {
  return isRecord(value) && ['calories', 'protein', 'carbs', 'fat'].every(key => nonnegative(value[key]) === value[key])
    && positive(value.referenceAmount) && isMealAmountUnit(value.referenceUnit)
    && (value.gramsPerUnit === undefined || positive(value.gramsPerUnit));
}

function isMealType(value: unknown): value is Meal['type'] {
  return value === 'breakfast' || value === 'lunch' || value === 'dinner' || value === 'snack';
}

function isMealAmountUnit(value: unknown): value is MealAmountUnit {
  return value === 'g' || value === 'ml' || value === '个' || value === '份';
}

function mealTitle(type: Meal['type']): string {
  return ({ breakfast: '早餐', lunch: '午餐', dinner: '晚餐', snack: '加餐' })[type];
}

function zeroNutrition(): NutritionSummary {
  return { calories: 0, protein: 0, carbs: 0, fat: 0 };
}

function add(a: NutritionSummary, b: NutritionSummary): NutritionSummary {
  return { calories: a.calories + b.calories, protein: a.protein + b.protein, carbs: a.carbs + b.carbs, fat: a.fat + b.fat };
}

function positive(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value > 0;
}

function nonnegative(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : 0;
}

function finiteOr(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}
