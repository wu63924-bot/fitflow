import { Exercise, NutritionTarget, TrainingPlan, User } from '../types';

export const mockUser: User = {
  name: 'Alex',
  avatarText: 'A',
  goal: '增肌 · 保持规律训练'
};

export const mockExercises: Exercise[] = [
  { id: 'bench', name: '杠铃卧推', muscle: '胸部', category: '胸', sets: 4, repRange: '8–10', restSeconds: 120, referenceWeight: 60, lastSets: [{ weight: 60, reps: 10 }, { weight: 60, reps: 9 }, { weight: 60, reps: 8 }] },
  { id: 'dumbbell-bench', name: '哑铃卧推', muscle: '胸部', category: '胸', sets: 4, repRange: '8–12', restSeconds: 90, referenceWeight: 22.5 },
  { id: 'incline-barbell', name: '上斜杠铃卧推', muscle: '胸部', category: '胸', sets: 4, repRange: '8–10', restSeconds: 120 },
  { id: 'incline-dumbbell', name: '上斜哑铃卧推', muscle: '胸部', category: '胸', sets: 4, repRange: '8–12', restSeconds: 90, referenceWeight: 22, lastSets: [{ weight: 22, reps: 10 }, { weight: 22, reps: 10 }, { weight: 20, reps: 11 }] },
  { id: 'fly', name: '蝴蝶机夹胸', muscle: '胸部', category: '胸', sets: 3, repRange: '10–15', restSeconds: 60, referenceWeight: 35, lastSets: [{ weight: 35, reps: 12 }, { weight: 35, reps: 12 }, { weight: 30, reps: 14 }] },
  { id: 'cable-press', name: '绳索夹胸', muscle: '胸部', category: '胸', sets: 3, repRange: '10–15', restSeconds: 60, referenceWeight: 12.5, lastSets: [{ weight: 12.5, reps: 12 }, { weight: 12.5, reps: 12 }, { weight: 10, reps: 15 }] },
  { id: 'lat-pulldown', name: '高位下拉', muscle: '背部', category: '背', sets: 4, repRange: '8–12', restSeconds: 90 },
  { id: 'barbell-row', name: '杠铃划船', muscle: '背部', category: '背', sets: 4, repRange: '8–10', restSeconds: 120 },
  { id: 'seated-row', name: '坐姿划船', muscle: '背部', category: '背', sets: 3, repRange: '10–12', restSeconds: 90 },
  { id: 'shoulder-press', name: '坐姿哑铃推举', muscle: '肩部', category: '肩', sets: 4, repRange: '8–12', restSeconds: 90 },
  { id: 'lateral-raise', name: '哑铃侧平举', muscle: '肩部', category: '肩', sets: 3, repRange: '12–15', restSeconds: 60 },
  { id: 'barbell-curl', name: '杠铃弯举', muscle: '二头', category: '二头', sets: 3, repRange: '8–12', restSeconds: 60 },
  { id: 'pushdown', name: '绳索下压', muscle: '三头', category: '三头', sets: 3, repRange: '10–12', restSeconds: 60, referenceWeight: 25, lastSets: [{ weight: 25, reps: 10 }, { weight: 25, reps: 10 }, { weight: 22.5, reps: 12 }] },
  { id: 'overhead-extension', name: '哑铃过顶臂屈伸', muscle: '三头', category: '三头', sets: 3, repRange: '10–12', restSeconds: 60, referenceWeight: 16, lastSets: [{ weight: 16, reps: 10 }, { weight: 16, reps: 10 }, { weight: 14, reps: 12 }] },
  { id: 'squat', name: '杠铃深蹲', muscle: '腿部', category: '腿', sets: 4, repRange: '6–10', restSeconds: 150 },
  { id: 'leg-press', name: '腿举', muscle: '腿部', category: '腿', sets: 4, repRange: '10–12', restSeconds: 120 },
  { id: 'plank', name: '平板支撑', muscle: '核心', category: '核心', sets: 3, repRange: '30–60', restSeconds: 60 },
  { id: 'treadmill', name: '跑步机', muscle: '全身', category: '有氧', sets: 1, repRange: '20–30', restSeconds: 60 }
];

export const mockWorkoutPlan: TrainingPlan = {
  id: 'ppl',
  name: 'PPL 训练计划',
  days: [
    { id: 'ppl-mon', weekday: '周一', cycleIndex: 1, order: 0, name: 'Push', targetMuscles: '胸 + 肩 + 三头', isRestDay: false, exercises: [
      { id: 'ppl-mon-bench', exerciseId: 'bench', order: 0, sets: 4, repsMin: 8, repsMax: 10, referenceWeight: 60, restSeconds: 120 },
      { id: 'ppl-mon-incline', exerciseId: 'incline-dumbbell', order: 1, sets: 4, repsMin: 8, repsMax: 12, referenceWeight: 22, restSeconds: 90 },
      { id: 'ppl-mon-fly', exerciseId: 'fly', order: 2, sets: 3, repsMin: 10, repsMax: 15, referenceWeight: 35, restSeconds: 60 },
      { id: 'ppl-mon-cable', exerciseId: 'cable-press', order: 3, sets: 3, repsMin: 10, repsMax: 15, referenceWeight: 12.5, restSeconds: 60 },
      { id: 'ppl-mon-pushdown', exerciseId: 'pushdown', order: 4, sets: 3, repsMin: 10, repsMax: 12, referenceWeight: 25, restSeconds: 60 },
      { id: 'ppl-mon-extension', exerciseId: 'overhead-extension', order: 5, sets: 3, repsMin: 10, repsMax: 12, referenceWeight: 16, restSeconds: 60 }
    ] },
    { id: 'ppl-tue', weekday: '周二', cycleIndex: 2, order: 1, name: 'Pull', targetMuscles: '背 + 二头', isRestDay: false, exercises: [] },
    { id: 'ppl-wed', weekday: '周三', cycleIndex: 3, order: 2, name: 'Legs', targetMuscles: '腿', isRestDay: false, exercises: [] },
    { id: 'ppl-thu', weekday: '周四', cycleIndex: 4, order: 3, name: '休息', targetMuscles: '恢复与拉伸', isRestDay: true, exercises: [] },
    { id: 'ppl-fri', weekday: '周五', cycleIndex: 5, order: 4, name: 'Push', targetMuscles: '胸 + 肩 + 三头', isRestDay: false, exercises: [] },
    { id: 'ppl-sat', weekday: '周六', cycleIndex: 6, order: 5, name: 'Pull', targetMuscles: '背 + 二头', isRestDay: false, exercises: [] },
    { id: 'ppl-sun', weekday: '周日', cycleIndex: 0, order: 6, name: '休息', targetMuscles: '恢复与拉伸', isRestDay: true, exercises: [] }
  ],
  createdAt: 0,
  updatedAt: 0
};

export const mockNutritionTarget: NutritionTarget = { calories: 2400, protein: 150, carbs: 300, fat: 65 };


