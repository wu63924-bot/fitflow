import { ApiError } from './errors.ts';
export interface FoodEstimate { name: string; estimatedGrams: number; calories: number; protein: number; carbs: number; fat: number; confidence: number }
export function validateFoods(value: unknown): { foods: FoodEstimate[] } {
  if (!value || typeof value !== 'object' || !('foods' in value) || !Array.isArray(value.foods) || value.foods.length > 20) throw new ApiError('AI_BAD_RESPONSE');
  return { foods: value.foods.map((item: unknown) => {
    if (!item || typeof item !== 'object' || !('name' in item) || typeof item.name !== 'string' || !item.name.trim() || item.name.trim().length > 60 || !('estimatedGrams' in item) || typeof item.estimatedGrams !== 'number' || !Number.isFinite(item.estimatedGrams) || item.estimatedGrams <= 0 || item.estimatedGrams > 3000 || !('confidence' in item) || typeof item.confidence !== 'number' || !Number.isFinite(item.confidence) || item.confidence < 0 || item.confidence > 1) throw new ApiError('AI_BAD_RESPONSE');
    if (!('calories' in item) || !nutrient(item.calories) || !('protein' in item) || !nutrient(item.protein) || !('carbs' in item) || !nutrient(item.carbs) || !('fat' in item) || !nutrient(item.fat)) throw new ApiError('AI_BAD_RESPONSE');
    return { name: item.name.trim(), estimatedGrams: item.estimatedGrams, calories: item.calories, protein: item.protein, carbs: item.carbs, fat: item.fat, confidence: item.confidence };
  }) };
}
function nutrient(value: unknown): value is number { return typeof value === 'number' && Number.isFinite(value) && value >= 0 && value <= 10000; }
export function parseAssistant(value: unknown) {
  try {
    if (!value || typeof value !== 'object' || !('choices' in value) || !Array.isArray(value.choices)) throw new Error();
    const text: unknown = value.choices[0]?.message?.content;
    if (typeof text !== 'string') throw new Error();
    const cleaned = text.trim().replace(/^```(?:json)?\s*\n?([\s\S]*?)\n?```$/i, '$1').trim();
    return validateFoods(JSON.parse(cleaned));
  } catch { throw new ApiError('AI_BAD_RESPONSE'); }
}
