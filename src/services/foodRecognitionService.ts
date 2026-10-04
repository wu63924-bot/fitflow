import type { MealItem } from '../types';

export interface RecognizedFood { id: string; name: string; estimatedGrams: number; calories: number; protein: number; carbs: number; fat: number; confidence: number }
export interface FoodRecognitionResult { foods: RecognizedFood[] }
export interface FoodRecognitionProvider { recognizeFood(image: Blob, signal?: AbortSignal): Promise<FoodRecognitionResult> }

// Nutrition fields are totals for the user-confirmed portion, not per 100g.
export function createAiMealItem(food: RecognizedFood): MealItem {
  if (!food.name.trim() || food.name.trim().length > 60) throw new Error('食物名称需为 1～60 个字符');
  if (!Number.isFinite(food.estimatedGrams) || food.estimatedGrams <= 0 || food.estimatedGrams > 10000) throw new Error('重量需大于 0 且不超过 10000 克');
  if (![food.calories, food.protein, food.carbs, food.fat].every(nutrient)) throw new Error('营养值需为 0～10000 的有效数值');
  return {
    id: food.id, foodId: `ai-${food.id}`, foodNameSnapshot: food.name.trim(), nutritionSource: 'ai',
    amount: food.estimatedGrams, unit: 'g', gramsEquivalent: food.estimatedGrams,
    nutritionSnapshot: { calories: food.calories, protein: food.protein, carbs: food.carbs, fat: food.fat, referenceAmount: food.estimatedGrams, referenceUnit: 'g' }
  };
}

function nutrient(value: unknown): value is number { return typeof value === 'number' && Number.isFinite(value) && value >= 0 && value <= 10000; }

export const recognitionMode = import.meta.env.DEV && import.meta.env.VITE_FOOD_RECOGNITION_PROVIDER === 'remote' ? 'remote' : 'mock';
export const recognitionNotice = recognitionMode === 'remote'
  ? '图片将经本地识别服务发送给 AI，仅用于本次识别，不保存原图。食物、重量与营养均为 AI估算，请修改并确认后记录。'
  : 'AI估算（Mock 演示）：结果不根据照片判断食物。图片只在本机处理，不上传、不保存原图。';

function wait(signal?: AbortSignal) {
  return new Promise<void>((resolve, reject) => {
    const cancel = () => { clearTimeout(timer); signal?.removeEventListener('abort', cancel); reject(new DOMException('已取消识别', 'AbortError')); };
    const timer = setTimeout(() => { signal?.removeEventListener('abort', cancel); resolve(); }, 1500);
    signal?.addEventListener('abort', cancel, { once: true });
    if (signal?.aborted) cancel();
  });
}

export class MockFoodRecognitionProvider implements FoodRecognitionProvider {
  async recognizeFood(image: Blob, signal?: AbortSignal): Promise<FoodRecognitionResult> {
    if (!image.size) throw new Error('照片为空，请重新选择');
    await wait(signal);
    signal?.throwIfAborted();
    return { foods: [
      { name: '米饭', estimatedGrams: 200, calories: 260, protein: 5.4, carbs: 56, fat: 0.6, confidence: 0.93 },
      { name: '宫保鸡丁', estimatedGrams: 150, calories: 300, protein: 22, carbs: 15, fat: 17, confidence: 0.89 },
      { name: '西兰花', estimatedGrams: 100, calories: 35, protein: 2.4, carbs: 6.6, fat: 0.4, confidence: 0.66 }
    ].map(food => ({ ...food, id: crypto.randomUUID() })) };
  }
}

const messages: Record<string, string> = {
  INVALID_IMAGE: '请选择有效的食物图片', IMAGE_TOO_LARGE: '图片过大，请重新选择', UNSUPPORTED_IMAGE: '仅支持 JPEG、PNG、WebP 图片',
  AI_TIMEOUT: '识别时间过长，请重新尝试', AI_AUTH_ERROR: 'AI 服务配置异常', AI_RATE_LIMIT: 'AI 服务当前繁忙，请稍后再试',
  AI_BAD_RESPONSE: '本次识别结果异常，请重新拍摄或重试', AI_UNAVAILABLE: 'AI 服务暂时不可用，请稍后再试', INTERNAL_ERROR: '识别服务发生错误，请稍后重试'
};
export class RemoteFoodRecognitionProvider implements FoodRecognitionProvider {
  readonly apiUrl: string;
  constructor(apiUrl: string) { this.apiUrl = apiUrl.trim().replace(/\/+$/, ''); }
  async recognizeFood(image: Blob, signal?: AbortSignal): Promise<FoodRecognitionResult> {
    signal?.throwIfAborted();
    if (!this.apiUrl) throw new Error('请先配置本地识别服务地址');
    const form = new FormData();
    form.append('image', image, 'food-photo');
    let response: Response;
    try { response = await fetch(`${this.apiUrl}/api/food-recognition`, { method: 'POST', body: form, signal }); }
    catch { signal?.throwIfAborted(); throw new Error('无法连接本地识别服务，请确认服务已启动'); }
    let value: unknown;
    try { value = await response.json(); } catch { signal?.throwIfAborted(); throw new Error(messages.AI_BAD_RESPONSE); }
    if (!response.ok) {
      const error = value && typeof value === 'object' && 'error' in value ? value.error : undefined;
      const code = error && typeof error === 'object' && 'code' in error && typeof error.code === 'string' ? error.code : '';
      throw new Error(messages[code] || messages.AI_UNAVAILABLE);
    }
    if (!value || typeof value !== 'object' || !('foods' in value) || !Array.isArray(value.foods) || value.foods.length > 20) throw new Error(messages.AI_BAD_RESPONSE);
    const estimates = value.foods.map((row: unknown) => {
      if (!row || typeof row !== 'object' || !('name' in row) || typeof row.name !== 'string' || !row.name.trim() || row.name.trim().length > 60 || !('estimatedGrams' in row) || typeof row.estimatedGrams !== 'number' || !Number.isFinite(row.estimatedGrams) || row.estimatedGrams <= 0 || row.estimatedGrams > 3000 || !('confidence' in row) || typeof row.confidence !== 'number' || !Number.isFinite(row.confidence) || row.confidence < 0 || row.confidence > 1) throw new Error(messages.AI_BAD_RESPONSE);
      if (!('calories' in row) || !nutrient(row.calories) || !('protein' in row) || !nutrient(row.protein) || !('carbs' in row) || !nutrient(row.carbs) || !('fat' in row) || !nutrient(row.fat)) throw new Error(messages.AI_BAD_RESPONSE);
      return { name: row.name.trim(), estimatedGrams: row.estimatedGrams, calories: row.calories, protein: row.protein, carbs: row.carbs, fat: row.fat, confidence: row.confidence };
    });
    signal?.throwIfAborted();
    return { foods: estimates.map(row => ({ ...row, id: crypto.randomUUID() })) };
  }
}

const provider: FoodRecognitionProvider = recognitionMode === 'remote'
  ? new RemoteFoodRecognitionProvider(import.meta.env.VITE_FOOD_RECOGNITION_API_URL || '') : new MockFoodRecognitionProvider();

export async function recognizeFood(image: Blob, source: FoodRecognitionProvider = provider, signal?: AbortSignal): Promise<FoodRecognitionResult> {
  const result = await source.recognizeFood(image, signal);
  signal?.throwIfAborted();
  if (!result.foods.length) throw new Error('没有识别到食物，请重新选择照片或手动添加');
  return result;
}
