import type { BodyRecord, DailySchedule, Exercise, NutritionTarget, StoredMeal, WorkoutSession, WorkoutSessionExercise, WorkoutSet } from '../types';
import { calculateMealItem } from '../utils/nutrition';
import { dateKey } from '../utils/format';

export const analyticsPeriods = [{ label: '7天', days: 7 }, { label: '30天', days: 30 }, { label: '90天', days: 90 }, { label: '半年', days: 180 }, { label: '一年', days: 365 }];
export interface AnalyticsInput { sessions: WorkoutSession[]; schedules: DailySchedule[]; weights: BodyRecord[]; meals: StoredMeal[]; exercises: Exercise[]; target: NutritionTarget }
export interface ChartPoint { date: string; value: number; secondary?: number }
export interface Performance { date: string; sessionId: string; weight: number; reps: number; volume: number }
const muscles = ['胸', '背', '肩', '腿', '二头', '三头', '腹部', '核心'];
const finite = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value);
const positive = (value: unknown): value is number => finite(value) && value > 0;
export function validDate(value: string): boolean {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const parsed = new Date(`${value}T12:00:00`);
  return Number.isFinite(parsed.getTime()) && dateKey(parsed) === value;
}
export function shiftDate(date: string, offset: number): string {
  const value = new Date(`${date}T12:00:00`); value.setDate(value.getDate() + offset); return dateKey(value);
}
function week(date: string): string { const day = new Date(`${date}T12:00:00`).getDay(); return shiftDate(date, -((day + 6) % 7)); }
function sum(values: number[]): number { return values.reduce((a, b) => a + b, 0); }
function validSets(exercise: WorkoutSessionExercise): WorkoutSet[] {
  return !exercise || exercise.skipped || exercise.category === '有氧' || !Array.isArray(exercise.sets) ? []
    : exercise.sets.filter(set => set && set.completed === true && finite(set.weight) && set.weight >= 0 && set.weight <= 10000 && positive(set.reps) && set.reps <= 1000 && Number.isInteger(set.reps) && Number.isFinite(set.weight * set.reps));
}
function buckets(start: string, end: string, step: 'day' | 'week' | 'month', points: ChartPoint[]): ChartPoint[] {
  const key = (date: string) => step === 'week' ? week(date) : step === 'month' ? `${date.slice(0, 7)}-01` : date;
  const values = new Map<string, number>();
  for (let date = start; date <= end; date = shiftDate(date, 1)) values.set(key(date), 0);
  for (const point of points) values.set(key(point.date), (values.get(key(point.date)) ?? 0) + point.value);
  return [...values].map(([date, value]) => ({ date, value }));
}

export function calculateAnalytics(input: AnalyticsInput, days: number, today = dateKey(new Date())) {
  const start = shiftDate(today, 1 - days);
  const within = (date: string) => validDate(date) && date >= start && date <= today;
  const sessions = input.sessions.filter(session => session && typeof session.id === 'string' && session.id.length > 0 && session.status === 'completed' && finite(session.startedAt) && finite(session.endedAt)
    && session.endedAt >= session.startedAt && Array.isArray(session.exercises) && within(dateKey(new Date(session.endedAt))));
  const cardio = input.schedules.filter(schedule => schedule && schedule.type === 'cardio' && schedule.status === 'completed' && within(schedule.date)
    && schedule.cardioData && ['跑步', '骑行', '椭圆机', '爬楼机', '跳绳', '游泳', '其他'].includes(schedule.cardioData.activity) && positive(schedule.cardioData.actualDurationMinutes));
  const sessionMinutes = sessions.map(session => (session.endedAt! - session.startedAt) / 60000);
  const cardioMinutes = cardio.map(schedule => schedule.cardioData!.actualDurationMinutes!);
  const durations = [...sessionMinutes, ...cardioMinutes];
  const volumePoints: ChartPoint[] = [];
  const performances = new Map<string, { id: string; name: string; history: Performance[] }>();
  const muscleCounts = new Map(muscles.map(name => [name, 0]));
  for (const session of sessions) {
    const date = dateKey(new Date(session.endedAt!));
    let volume = 0;
    const involved = new Set<string>();
    const perSession = new Map<string, Performance>();
    for (const exercise of session.exercises) {
      const sets = validSets(exercise);
      if (!sets.length || typeof exercise.exerciseId !== 'string') continue;
      const exerciseVolume = sum(sets.map(set => set.weight * set.reps)); volume += exerciseVolume;
      const definition = input.exercises.find(item => item && item.id === exercise.exerciseId);
      const descriptions = `${exercise.category || definition?.category || ''} ${exercise.muscle || definition?.muscle || ''}`;
      for (const muscle of muscles) if (descriptions.includes(muscle)) involved.add(muscle);
      const best = sets.reduce((a, b) => b.weight > a.weight || b.weight === a.weight && b.reps > a.reps ? b : a);
      const previous = perSession.get(exercise.exerciseId);
      perSession.set(exercise.exerciseId, { date, sessionId: session.id, weight: Math.max(best.weight, previous?.weight ?? 0),
        reps: previous && (previous.weight > best.weight || previous.weight === best.weight && previous.reps > best.reps) ? previous.reps : best.reps,
        volume: exerciseVolume + (previous?.volume ?? 0) });
      if (!performances.has(exercise.exerciseId)) performances.set(exercise.exerciseId, { id: exercise.exerciseId, name: exercise.name || definition?.name || '未命名动作', history: [] });
    }
    for (const [id, performance] of perSession) performances.get(id)!.history.push(performance);
    for (const muscle of involved) muscleCounts.set(muscle, muscleCounts.get(muscle)! + 1);
    volumePoints.push({ date, value: volume });
  }
  // Same-day body rows use the last stored row; IndexedDB currently has date as its unique key.
  const weightMap = new Map<string, BodyRecord>();
  for (const record of input.weights) if (record && validDate(record.date) && record.date <= today && positive(record.weight) && record.weight <= 1000) weightMap.set(record.date, record);
  const weights = [...weightMap.values()].sort((a, b) => a.date.localeCompare(b.date));
  const weightPoints = weights.filter(record => within(record.date)).map(record => {
    const window = weights.filter(item => item.date >= shiftDate(record.date, -6) && item.date <= record.date);
    return { date: record.date, value: record.weight, secondary: sum(window.map(item => item.weight)) / window.length };
  });
  const firstWeight = weightPoints[0]; const lastWeight = weightPoints.at(-1);
  const dailyMeals = new Map<string, { calories: number; protein: number; carbs: number; fat: number }>();
  for (const meal of input.meals) {
    if (!meal || !within(meal.date) || !Array.isArray(meal.items)) continue;
    for (const item of meal.items) {
      if (!item || !positive(item.amount) || item.amount > 10000 || !item.nutritionSnapshot || !positive(item.nutritionSnapshot.referenceAmount)
        || !['g', 'ml', '个', '份'].includes(item.unit) || !['g', 'ml', '个', '份'].includes(item.nutritionSnapshot.referenceUnit)
        || item.unit !== item.nutritionSnapshot.referenceUnit && !(item.nutritionSnapshot.referenceUnit === 'g' && positive(item.gramsEquivalent))) continue;
      const nutrients = calculateMealItem(item);
      if (!Object.values(nutrients).every(value => finite(value) && value >= 0 && value <= 1000000)) continue;
      const current = dailyMeals.get(meal.date) ?? { calories: 0, protein: 0, carbs: 0, fat: 0 };
      dailyMeals.set(meal.date, { calories: current.calories + nutrients.calories, protein: current.protein + nutrients.protein, carbs: current.carbs + nutrients.carbs, fat: current.fat + nutrients.fat });
    }
  }
  const nutritionDays = [...dailyMeals].sort(([a], [b]) => a.localeCompare(b)).map(([date, nutrients]) => ({ date, ...nutrients }));
  const average = nutritionDays.length ? {
    calories: sum(nutritionDays.map(day => day.calories)) / nutritionDays.length,
    protein: sum(nutritionDays.map(day => day.protein)) / nutritionDays.length,
    carbs: sum(nutritionDays.map(day => day.carbs)) / nutritionDays.length,
    fat: sum(nutritionDays.map(day => day.fat)) / nutritionDays.length
  } : undefined;
  const activityTypes = [...new Set(cardio.map(item => item.cardioData!.activity))].map(activity => {
    const records = cardio.filter(item => item.cardioData!.activity === activity);
    const distances = records.map(item => item.cardioData!.distanceKm).filter((value): value is number => finite(value) && value >= 0);
    return { activity, count: records.length, minutes: sum(records.map(item => item.cardioData!.actualDurationMinutes!)), distance: distances.length ? sum(distances) : undefined, distanceDays: distances.length };
  });
  const count = sessions.length + cardio.length;
  return {
    start, end: today, days, count, strengthCount: sessions.length, cardioCount: cardio.length, weeklyFrequency: count / (days / 7),
    totalMinutes: sum(durations), averageMinutes: count ? sum(durations) / count : undefined, longestMinutes: durations.length ? Math.max(...durations) : undefined,
    frequencyUnit: days <= 30 ? '日' : days <= 180 ? '周' : '月',
    frequency: buckets(start, today, days <= 30 ? 'day' : days <= 180 ? 'week' : 'month', [...sessions.map(session => ({ date: dateKey(new Date(session.endedAt!)), value: 1 })), ...cardio.map(schedule => ({ date: schedule.date, value: 1 }))]),
    volume: sum(volumePoints.map(point => point.value)), weeklyVolume: buckets(start, today, 'week', volumePoints), muscles: [...muscleCounts].map(([name, count]) => ({ name, count })),
    performances: [...performances.values()].map(exercise => ({ ...exercise, history: exercise.history.sort((a, b) => a.date.localeCompare(b.date)) })),
    weightPoints, firstWeight, lastWeight, weightChange: weightPoints.length > 1 ? lastWeight!.value - firstWeight!.value : undefined,
    nutritionDays, average, recordDays: nutritionDays.length, target: input.target,
    proteinGoalDays: positive(input.target.protein) ? nutritionDays.filter(day => day.protein >= input.target.protein).length : undefined,
    cardioMinutes: sum(cardioMinutes), cardioAverage: cardio.length ? sum(cardioMinutes) / cardio.length : undefined, activityTypes
  };
}
export type Analytics = ReturnType<typeof calculateAnalytics>;
