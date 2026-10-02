import type { Food } from '../types';

// Approximate reference values; users can edit them to match a product label.
export const builtinFoods: Food[] = [
  { id: 'food-rice', name: '米饭', category: '主食', servingBase: 100, servingUnit: 'g', nutritionUnit: 'g', nutritionPer: 100, calories: 130, protein: 2.7, carbs: 28, fat: 0.3 },
  { id: 'food-oats', name: '燕麦', category: '主食', servingBase: 50, servingUnit: 'g', nutritionUnit: 'g', nutritionPer: 100, calories: 389, protein: 16.9, carbs: 66.3, fat: 6.9 },
  { id: 'food-noodles', name: '面条（熟）', category: '主食', servingBase: 150, servingUnit: 'g', nutritionUnit: 'g', nutritionPer: 100, calories: 138, protein: 4.5, carbs: 25, fat: 2.1 },
  { id: 'food-mantou', name: '馒头', category: '主食', servingBase: 1, servingUnit: '个', nutritionUnit: 'g', nutritionPer: 100, gramsPerUnit: 80, calories: 223, protein: 7, carbs: 47, fat: 1.1 },
  { id: 'food-sweet-potato', name: '红薯', category: '主食', servingBase: 150, servingUnit: 'g', nutritionUnit: 'g', nutritionPer: 100, calories: 86, protein: 1.6, carbs: 20.1, fat: 0.1 },
  { id: 'food-chicken-breast', name: '鸡胸肉', category: '肉类', servingBase: 150, servingUnit: 'g', nutritionUnit: 'g', nutritionPer: 100, calories: 165, protein: 31, carbs: 0, fat: 3.6 },
  { id: 'food-egg', name: '鸡蛋', category: '蛋奶', servingBase: 1, servingUnit: '个', nutritionUnit: 'g', nutritionPer: 100, gramsPerUnit: 50, calories: 143, protein: 13, carbs: 0.7, fat: 9.5 },
  { id: 'food-beef', name: '牛肉（瘦）', category: '肉类', servingBase: 100, servingUnit: 'g', nutritionUnit: 'g', nutritionPer: 100, calories: 180, protein: 26, carbs: 0, fat: 8 },
  { id: 'food-pork', name: '猪肉（瘦）', category: '肉类', servingBase: 100, servingUnit: 'g', nutritionUnit: 'g', nutritionPer: 100, calories: 143, protein: 20.3, carbs: 0, fat: 6.2 },
  { id: 'food-fish', name: '鱼肉', category: '肉类', servingBase: 120, servingUnit: 'g', nutritionUnit: 'g', nutritionPer: 100, calories: 105, protein: 20, carbs: 0, fat: 2.3 },
  { id: 'food-milk', name: '牛奶', category: '饮品', servingBase: 250, servingUnit: 'ml', nutritionUnit: 'ml', nutritionPer: 100, calories: 54, protein: 3, carbs: 5, fat: 3.2 },
  { id: 'food-yogurt', name: '原味酸奶', category: '蛋奶', servingBase: 150, servingUnit: 'g', nutritionUnit: 'g', nutritionPer: 100, calories: 72, protein: 3.5, carbs: 5, fat: 3.5 },
  { id: 'food-soy-milk', name: '豆浆', category: '豆制品', servingBase: 250, servingUnit: 'ml', nutritionUnit: 'ml', nutritionPer: 100, calories: 31, protein: 3, carbs: 1.2, fat: 1.6 },
  { id: 'food-tofu', name: '豆腐', category: '豆制品', servingBase: 100, servingUnit: 'g', nutritionUnit: 'g', nutritionPer: 100, calories: 81, protein: 8.1, carbs: 4.2, fat: 4.2 },
  { id: 'food-broccoli', name: '西兰花', category: '蔬菜', servingBase: 100, servingUnit: 'g', nutritionUnit: 'g', nutritionPer: 100, calories: 35, protein: 2.4, carbs: 6.6, fat: 0.4 },
  { id: 'food-spinach', name: '菠菜', category: '蔬菜', servingBase: 100, servingUnit: 'g', nutritionUnit: 'g', nutritionPer: 100, calories: 23, protein: 2.9, carbs: 3.6, fat: 0.4 },
  { id: 'food-tomato', name: '番茄', category: '蔬菜', servingBase: 1, servingUnit: '个', nutritionUnit: 'g', nutritionPer: 100, gramsPerUnit: 150, calories: 18, protein: 0.9, carbs: 3.9, fat: 0.2 },
  { id: 'food-banana', name: '香蕉', category: '水果', servingBase: 1, servingUnit: '个', nutritionUnit: 'g', nutritionPer: 100, gramsPerUnit: 120, calories: 89, protein: 1.1, carbs: 22.8, fat: 0.3 },
  { id: 'food-apple', name: '苹果', category: '水果', servingBase: 1, servingUnit: '个', nutritionUnit: 'g', nutritionPer: 100, gramsPerUnit: 180, calories: 52, protein: 0.3, carbs: 13.8, fat: 0.2 },
  { id: 'food-orange', name: '橙子', category: '水果', servingBase: 1, servingUnit: '个', nutritionUnit: 'g', nutritionPer: 100, gramsPerUnit: 160, calories: 47, protein: 0.9, carbs: 11.8, fat: 0.1 },
  { id: 'food-nuts', name: '混合坚果', category: '零食', servingBase: 20, servingUnit: 'g', nutritionUnit: 'g', nutritionPer: 100, calories: 567, protein: 20, carbs: 21, fat: 49 },
  { id: 'food-bread', name: '全麦面包', category: '主食', servingBase: 1, servingUnit: '个', nutritionUnit: 'g', nutritionPer: 100, gramsPerUnit: 35, calories: 247, protein: 13, carbs: 41, fat: 4.2 }
];
