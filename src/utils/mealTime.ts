import type { MealType } from '../types';

/** Choose a meal from the device's local recognition-start time. */
export function mealTypeAtTime(time: Date): MealType {
  const hour = time.getHours();
  if (hour >= 5 && hour < 11) return 'breakfast';
  if (hour >= 11 && hour < 15) return 'lunch';
  if (hour >= 15 && hour < 21) return 'dinner';
  return 'snack';
}
