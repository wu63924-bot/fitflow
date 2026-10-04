export type MealType = 'breakfast' | 'lunch' | 'dinner' | 'snack';

export type ExerciseCategory = '胸' | '背' | '肩' | '二头' | '三头' | '腿' | '腹部' | '核心' | '有氧' | '其他';

export interface User {
  name: string;
  avatarText: string;
  goal: string;
}

export interface Exercise {
  id: string;
  name: string;
  muscle: string;
  category: ExerciseCategory;
  sets: number;
  repRange: string;
  restSeconds: number;
  referenceWeight?: number;
  lastSets?: Array<{ weight: number; reps: number }>;
  isCustom?: boolean;
}

export interface PlannedExercise {
  id: string;
  exerciseId: string;
  order: number;
  sets: number;
  repsMin: number;
  repsMax: number;
  referenceWeight?: number;
  restSeconds: number;
}

export interface WorkoutDay {
  id: string;
  name: string;
  targetMuscles: string;
  isRestDay: boolean;
  exercises: PlannedExercise[];
  order: number;
  cycleIndex: number;
  weekday: string;
}

export interface TrainingPlan {
  id: string;
  name: string;
  days: WorkoutDay[];
  createdAt: number;
  updatedAt: number;
}

export interface WorkoutSet {
  id: string;
  weight: number;
  reps: number;
  completed: boolean;
  completedAt?: number;
}

export interface WorkoutSessionExercise {
  id: string;
  exerciseId: string;
  name: string;
  muscle: string;
  category: ExerciseCategory;
  restSeconds: number;
  skipped: boolean;
  sets: WorkoutSet[];
}

export interface RestTimerState {
  restStartedAt: number;
  restEndsAt: number;
  exerciseIndex: number;
  setIndex: number;
  targetExerciseId?: string;
  targetSetId?: string;
  triggeredBySetId?: string;
  expanded: boolean;
  expiredNotified: boolean;
}

export interface WorkoutSession {
  id: string;
  sessionId: string;
  planId: string;
  workoutDayId: string;
  planName: string;
  workoutDayName: string;
  startedAt: number;
  endedAt?: number;
  status: 'in_progress' | 'completed';
  currentExerciseIndex: number;
  exercises: WorkoutSessionExercise[];
  restTimer?: RestTimerState;
}

export type DailyScheduleType = 'strength' | 'cardio' | 'rest';
export type DailyScheduleStatus = 'planned' | 'in_progress' | 'completed';
export type CardioActivity = '跑步' | '骑行' | '椭圆机' | '爬楼机' | '跳绳' | '游泳' | '其他';

export interface ScheduledStrengthExercise {
  exerciseId: string;
  name: string;
  muscle: string;
  category: ExerciseCategory;
  restSeconds: number;
  sets: Array<{ weight: number; reps: number }>;
}

export interface ScheduledStrengthTemplate {
  planId?: string;
  planName: string;
  workoutDayId?: string;
  workoutDayName: string;
  exercises: ScheduledStrengthExercise[];
}

export interface ScheduledCardioData {
  activity: CardioActivity;
  plannedDurationMinutes?: number;
  actualDurationMinutes?: number;
  distanceKm?: number;
  note?: string;
}

export interface DailySchedule {
  id: string;
  date: string;
  type?: DailyScheduleType;
  status: DailyScheduleStatus;
  workoutTemplate?: ScheduledStrengthTemplate;
  cardioData?: ScheduledCardioData;
  workoutSessionId?: string;
  note?: string;
  createdAt: number;
  updatedAt: number;
}

export type FoodCategory = '主食' | '肉类' | '蛋奶' | '蔬菜' | '水果' | '豆制品' | '饮品' | '零食' | '其他';
export type FoodUnit = 'g' | 'ml' | '个';
export type MealAmountUnit = FoodUnit | '份';

export interface Food {
  aliases?: string[];
  id: string;
  name: string;
  category: FoodCategory;
  servingBase: number;
  servingUnit: FoodUnit;
  nutritionUnit: 'g' | 'ml';
  nutritionPer: 100;
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
  gramsPerUnit?: number;
  isCustom?: boolean;
}

export interface NutritionSnapshot {
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
  referenceAmount: number;
  referenceUnit: MealAmountUnit;
  gramsPerUnit?: number;
}

export interface MealItem {
  nutritionSource?: 'ai';
  id: string;
  foodId: string;
  foodNameSnapshot: string;
  amount: number;
  unit: MealAmountUnit;
  gramsEquivalent?: number;
  nutritionSnapshot: NutritionSnapshot;
}

export interface Meal {
  id: string;
  type: MealType;
  title: string;
  items: MealItem[];
}

export interface NutritionTarget {
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
}

export interface BodyRecord {
  date: string;
  weight: number;
  height: number;
}

export interface TrainingSettings {
  defaultRestSeconds: number;
  vibrationEnabled: boolean;
  soundEnabled: boolean;
  autoRestTimer: boolean;
  weightUnit: 'kg';
}

