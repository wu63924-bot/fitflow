import { db } from '../db/db';
import type { FavoriteFood, Food, FoodCategory, RecentFood } from '../types';

export interface FoodPickerData {
  foods: Food[];
  favorites: string[];
  recents: string[];
}

export async function getFoodPickerData(): Promise<FoodPickerData> {
  const [foods, favorites, recents] = await Promise.all([
    db.foods.toArray(), db.favoriteFoods.toArray(), db.recentFoods.orderBy('lastUsedAt').reverse().toArray()
  ]);
  return { foods: foods.sort((a, b) => a.name.localeCompare(b.name, 'zh-CN')), favorites: favorites.map(row => row.foodId), recents: recents.map(row => row.foodId) };
}

export async function saveFood(input: Food): Promise<void> {
  const name = input.name.trim();
  const nutrients = [input.calories, input.protein, input.carbs, input.fat];
  const validCategory = ['主食', '肉类', '蛋奶', '蔬菜', '水果', '豆制品', '饮品', '零食', '其他'].includes(input.category);
  if (!name || name.length > 60) throw new Error('请输入 1–60 个字的食物名称');
  if (!validCategory || !['g', 'ml'].includes(input.nutritionUnit) || !['g', 'ml', '个'].includes(input.servingUnit)) throw new Error('食物分类或单位无效');
  if ((input.servingUnit === 'g' && input.nutritionUnit !== 'g') || (input.servingUnit === 'ml' && input.nutritionUnit !== 'ml') || (input.servingUnit === '个' && input.nutritionUnit !== 'g')) throw new Error('份量单位与营养基准单位不匹配');
  if (!Number.isFinite(input.servingBase) || input.servingBase <= 0 || input.servingBase > 10000) throw new Error('常用份量需大于 0 且不超过 10000');
  if (input.nutritionPer !== 100 || nutrients.some(value => !Number.isFinite(value) || value < 0 || value > 10000)) throw new Error('营养值需为有效的非负数');
  if (input.servingUnit === '个' && (!input.gramsPerUnit || !Number.isFinite(input.gramsPerUnit) || input.gramsPerUnit <= 0 || input.gramsPerUnit > 10000)) throw new Error('按“个”记录时，请设置每个的约重');
  const food: Food = { ...input, name };
  await db.foods.put(food);
}

export async function createCustomFood(input: Omit<Food, 'id' | 'isCustom'>): Promise<Food> {
  const food: Food = { ...input, id: `custom-${crypto.randomUUID()}`, isCustom: true };
  await saveFood(food);
  return food;
}

export async function toggleFavoriteFood(foodId: string): Promise<boolean> {
  if (!await db.foods.get(foodId)) throw new Error('找不到这个食物');
  const current = await db.favoriteFoods.get(foodId);
  if (current) {
    await db.favoriteFoods.delete(foodId);
    return false;
  }
  const favorite: FavoriteFood = { foodId, createdAt: Date.now() };
  await db.favoriteFoods.put(favorite);
  return true;
}

export async function markFoodRecent(foodId: string): Promise<void> {
  if (!await db.foods.get(foodId)) return;
  const recent: RecentFood = { foodId, lastUsedAt: Date.now() };
  await db.recentFoods.put(recent);
  const stale = await db.recentFoods.orderBy('lastUsedAt').reverse().offset(20).toArray();
  if (stale.length) await db.recentFoods.bulkDelete(stale.map(item => item.foodId));
}

export const foodCategories: FoodCategory[] = ['主食', '肉类', '蛋奶', '蔬菜', '水果', '豆制品', '饮品', '零食', '其他'];
