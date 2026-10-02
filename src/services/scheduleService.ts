import { dateKey } from '../utils/format';
import { getExercise, getPreviousPerformance } from '../utils/workout';
import { db } from '../db/db';
import { getDailySchedule } from '../repositories/dailyScheduleRepository';
import { listExercises } from '../repositories/exerciseRepository';
import { getTrainingPlan } from '../repositories/trainingPlanRepository';
import { getInProgressSession, getWorkoutSession } from '../repositories/workoutRepository';
import type { DailySchedule, ScheduledCardioData, ScheduledStrengthTemplate, TrainingPlan, WorkoutDay, WorkoutSession } from '../types';

export class DailyScheduleConflictError extends Error {
  constructor(readonly kind: 'existing' | 'locked' | 'recorded', message: string) {
    super(message);
    this.name = 'DailyScheduleConflictError';
  }
}

type ScheduledContent =
  | { type: 'strength'; workoutTemplate: ScheduledStrengthTemplate }
  | { type: 'cardio'; cardioData: ScheduledCardioData }
  | { type: 'rest' };

export async function createStrengthTemplateFromPlan(planId: string, dayId: string): Promise<ScheduledStrengthTemplate> {
  const [plan, exercises, sessions] = await Promise.all([
    getTrainingPlan(planId), listExercises(), db.workoutSessions.toArray()
  ]);
  const day = plan?.days.find(item => item.id === dayId);
  if (!plan || !day || day.isRestDay) throw new Error('找不到可安排的训练日');
  return templateFromPlan(plan, day, exercises, sessions);
}

export async function saveDailySchedule(date: string, content: ScheduledContent, replaceExisting = false): Promise<DailySchedule> {
  assertDateKey(date);
  if (date < dateKey(new Date()) && content.type !== 'rest') throw new Error('过去日期不能安排新的训练');
  const now = Date.now();
  return db.transaction('rw', [db.dailySchedules, db.workoutSessions], async () => {
    const current = await db.dailySchedules.get(date);
    const sessions = await db.workoutSessions.toArray();
    const onDate = sessions.filter(sessionDate => dateKey(new Date(sessionDate.endedAt ?? sessionDate.startedAt)) === date);
    const linkedSession = current?.workoutSessionId ? sessions.find(session => session.id === current.workoutSessionId) : undefined;
    if (current?.status === 'in_progress' || linkedSession?.status === 'in_progress') {
      const message = date === dateKey(new Date())
        ? '今天有一场正在进行的训练，请先完成或结束当前训练。'
        : '这一天有一场正在进行的训练，不能修改安排';
      throw new DailyScheduleConflictError('locked', message);
    }
    if (current?.status === 'completed' || linkedSession?.status === 'completed') throw new DailyScheduleConflictError('locked', '这一天的训练已经完成，不能修改安排');
    if (current?.type && !replaceExisting) throw new DailyScheduleConflictError('existing', '当天已经有训练安排');
    if (date === dateKey(new Date()) && content.type) {
      const active = sessions.find(session => session.status === 'in_progress');
      if (active) throw new DailyScheduleConflictError('locked', '今天有一场正在进行的训练，请先完成或结束当前训练。');
    }
    if (content.type && onDate.some(session => session.status === 'in_progress' || session.status === 'completed')) {
      throw new DailyScheduleConflictError('recorded', '当天已有训练记录，不能再安排另一项主要训练');
    }
    const schedule: DailySchedule = {
      id: date,
      date,
      type: content.type,
      status: 'planned',
      workoutTemplate: content.type === 'strength' ? content.workoutTemplate : undefined,
      cardioData: content.type === 'cardio' ? content.cardioData : undefined,
      note: current?.note,
      createdAt: current?.createdAt ?? now,
      updatedAt: now
    };
    await db.dailySchedules.put(schedule);
    return schedule;
  });
}

export async function saveDailyNote(date: string, value: string): Promise<void> {
  assertDateKey(date);
  const note = value.trim().slice(0, 200) || undefined;
  await db.transaction('rw', db.dailySchedules, async () => {
    const current = await db.dailySchedules.get(date);
    if (!current && !note) return;
    if (current) {
      if (!current.type && !note) await db.dailySchedules.delete(date);
      else await db.dailySchedules.put({ ...current, note, updatedAt: Date.now() });
      return;
    }
    const now = Date.now();
    await db.dailySchedules.put({ id: date, date, status: 'planned', note, createdAt: now, updatedAt: now });
  });
}

export async function removeScheduledActivity(date: string): Promise<void> {
  await db.transaction('rw', [db.dailySchedules, db.workoutSessions], async () => {
    const current = await db.dailySchedules.get(date);
    if (!current) return;
    const linked = current.workoutSessionId ? await db.workoutSessions.get(current.workoutSessionId) : undefined;
    if (current.status !== 'planned' || linked?.status === 'in_progress' || linked?.status === 'completed') {
      throw new DailyScheduleConflictError('locked', '已开始或完成的训练不能删除安排');
    }
    if (current.note?.trim()) {
      await db.dailySchedules.put({ ...current, type: undefined, status: 'planned', workoutTemplate: undefined, cardioData: undefined, workoutSessionId: undefined, updatedAt: Date.now() });
    } else {
      await db.dailySchedules.delete(date);
    }
  });
}

export async function completeCardio(date: string, values: { durationMinutes: number; distanceKm?: number; note?: string }): Promise<void> {
  if (date !== dateKey(new Date())) throw new Error('只能在当天记录有氧完成情况');
  if (!Number.isFinite(values.durationMinutes) || values.durationMinutes <= 0) throw new Error('请输入有效的有氧时长');
  if (values.distanceKm !== undefined && (!Number.isFinite(values.distanceKm) || values.distanceKm < 0)) throw new Error('距离不能小于 0');
  await db.transaction('rw', db.dailySchedules, async () => {
    const current = await db.dailySchedules.get(date);
    if (current?.type !== 'cardio' || current.status !== 'planned' || !current.cardioData) throw new Error('找不到待完成的有氧安排');
    await db.dailySchedules.put({
      ...current,
      status: 'completed',
      cardioData: {
        ...current.cardioData,
        actualDurationMinutes: values.durationMinutes,
        distanceKm: values.distanceKm,
        note: values.note?.trim() || undefined
      },
      updatedAt: Date.now()
    });
  });
}

export async function copyWorkoutToDate(sourceSessionId: string, targetDate: string, replaceExisting = false): Promise<DailySchedule> {
  const source = await getWorkoutSession(sourceSessionId);
  if (!source || source.status !== 'completed') throw new Error('只能复制已完成的训练记录');
  const workoutTemplate: ScheduledStrengthTemplate = {
    planName: source.planName,
    workoutDayName: source.workoutDayName,
    planId: source.planId,
    workoutDayId: source.workoutDayId,
    exercises: source.exercises.map(exercise => ({
      exerciseId: exercise.exerciseId,
      name: exercise.name,
      muscle: exercise.muscle,
      category: exercise.category,
      restSeconds: exercise.restSeconds,
      sets: exercise.sets.map(set => ({ weight: set.weight, reps: set.reps }))
    }))
  };
  return saveDailySchedule(targetDate, { type: 'strength', workoutTemplate }, replaceExisting);
}

export async function startScheduledStrengthWorkout(date: string): Promise<WorkoutSession> {
  if (date !== dateKey(new Date())) throw new Error('只能开始今天的训练安排');
  const existing = await getDailySchedule(date);
  if (existing?.status === 'in_progress' && existing.workoutSessionId) {
    const linked = await getWorkoutSession(existing.workoutSessionId);
    if (linked?.status === 'in_progress') return linked;
  }
  if (existing?.status === 'completed') throw new DailyScheduleConflictError('locked', '今天的训练已完成');
  if (existing?.type !== 'strength' || !existing.workoutTemplate || existing.status !== 'planned') throw new Error('今天没有待开始的力量训练安排');
  const active = await getInProgressSession();
  if (active) throw new DailyScheduleConflictError('locked', '已有一场正在进行的训练，请先完成或结束当前训练。');

  const now = Date.now();
  const session = sessionFromTemplate(existing, now);
  return db.transaction('rw', [db.dailySchedules, db.workoutSessions], async () => {
    const current = await db.dailySchedules.get(date);
    if (!current || current.type !== 'strength' || current.status !== 'planned' || current.updatedAt !== existing.updatedAt) {
      throw new DailyScheduleConflictError('locked', '训练安排已发生变化，请刷新后重试');
    }
    if (await db.workoutSessions.where('status').equals('in_progress').first()) {
      throw new DailyScheduleConflictError('locked', '已有一场正在进行的训练，请先完成或结束当前训练。');
    }
    await db.workoutSessions.put(session);
    await db.dailySchedules.put({ ...current, status: 'in_progress', workoutSessionId: session.id, updatedAt: now });
    return session;
  });
}

function templateFromPlan(plan: TrainingPlan, day: WorkoutDay, exercises: Awaited<ReturnType<typeof listExercises>>, sessions: WorkoutSession[]): ScheduledStrengthTemplate {
  return {
    planId: plan.id,
    planName: plan.name,
    workoutDayId: day.id,
    workoutDayName: day.name,
    exercises: day.exercises.slice().sort((a, b) => a.order - b.order).map(planned => {
      const definition = exercises.find(exercise => exercise.id === planned.exerciseId) ?? getExercise(planned.exerciseId);
      const previous = getPreviousPerformance(planned.exerciseId, sessions)?.sets.filter(set => set.completed) ?? [];
      return {
        exerciseId: planned.exerciseId,
        name: definition.name,
        muscle: definition.muscle,
        category: definition.category,
        restSeconds: planned.restSeconds,
        sets: Array.from({ length: planned.sets }, (_, index) => ({
          weight: previous[index]?.weight ?? planned.referenceWeight ?? definition.referenceWeight ?? 0,
          reps: previous[index]?.reps ?? planned.repsMin
        }))
      };
    })
  };
}

function sessionFromTemplate(schedule: DailySchedule, now: number): WorkoutSession {
  const template = schedule.workoutTemplate!;
  const id = `session-${now}-${Math.floor(Math.random() * 100000)}`;
  return {
    id,
    sessionId: id,
    planId: template.planId ?? `schedule-${schedule.date}`,
    workoutDayId: template.workoutDayId ?? `schedule-${schedule.date}`,
    planName: template.planName,
    workoutDayName: template.workoutDayName,
    startedAt: now,
    status: 'in_progress',
    currentExerciseIndex: 0,
    exercises: template.exercises.map((exercise, exerciseIndex) => ({
      id: `session-exercise-${id}-${exerciseIndex}`,
      exerciseId: exercise.exerciseId,
      name: exercise.name,
      muscle: exercise.muscle,
      category: exercise.category,
      restSeconds: exercise.restSeconds,
      skipped: false,
      sets: exercise.sets.map((set, setIndex) => ({
        id: `set-${id}-${exerciseIndex}-${setIndex}`,
        weight: set.weight,
        reps: set.reps,
        completed: false
      }))
    }))
  };
}

function assertDateKey(date: string): void {
  const parsed = new Date(`${date}T12:00:00`);
  if (Number.isNaN(parsed.getTime()) || dateKey(parsed) !== date) throw new Error('日期格式无效');
}
