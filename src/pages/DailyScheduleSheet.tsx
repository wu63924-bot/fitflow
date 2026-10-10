import { useState } from 'react';
import type { FormEvent } from 'react';
import { ExercisePicker } from '../components/ExercisePicker';
import { getTodayWorkoutDay } from '../utils/workout';
import { Modal, useToast } from '../components/UI';
import { completeCardio, createStrengthTemplateFromPlan, saveDailyNote, saveDailySchedule } from '../services/scheduleService';
import type { CardioActivity, DailySchedule, Exercise, ScheduledStrengthExercise, ScheduledStrengthTemplate, TrainingPlan } from '../types';

function customWorkoutName(exercises: { category: string }[]): string {
  const parts = [...new Set(exercises.map(exercise => exercise.category === '核心' ? '腹部' : exercise.category))];
  return parts.length ? `${parts.map(part => ['胸', '背', '肩', '腿'].includes(part) ? `${part}部` : part).join('、')}训练` : '自定义训练';
}

const cardioActivities: CardioActivity[] = ['跑步', '骑行', '椭圆机', '爬楼机', '跳绳', '游泳', '其他'];

interface CustomSetDraft { weight: string; reps: string; }
type CustomExerciseDraft = Omit<ScheduledStrengthExercise, 'sets'> & { sets: CustomSetDraft[]; restInput: string; };

export function DailyScheduleSheet({ date, schedule, plans, exercises, allowTraining, initialView = 'menu', onClose, onSaved }: {
  date: string;
  schedule?: DailySchedule;
  plans: TrainingPlan[];
  exercises: Exercise[];
  allowTraining: boolean;
  initialView?: 'menu' | 'note' | 'cardio-log';
  onClose: () => void;
  onSaved: () => void;
}) {
  const toast = useToast();
  const [view, setView] = useState<'menu' | 'strength' | 'cardio' | 'note' | 'cardio-log'>(initialView);
  const [busy, setBusy] = useState(false);
  const initialPlan = plans.find(plan => plan.id === schedule?.workoutTemplate?.planId) ?? plans[0];
  const todayPlanDay = initialPlan && getTodayWorkoutDay(initialPlan);
  const initialDay = initialPlan?.days.find(day => day.id === schedule?.workoutTemplate?.workoutDayId && !day.isRestDay)
    ?? (todayPlanDay && !todayPlanDay.isRestDay ? todayPlanDay : undefined)
    ?? initialPlan?.days.find(day => !day.isRestDay);
  const [planId, setPlanId] = useState(initialPlan?.id ?? '');
  const [dayId, setDayId] = useState(initialDay?.id ?? '');
  const [strengthMode, setStrengthMode] = useState<'plan' | 'custom'>(schedule?.workoutTemplate ? 'custom' : 'plan');
  const [customExercises, setCustomExercises] = useState<CustomExerciseDraft[]>(() => schedule?.workoutTemplate?.exercises.map(exercise => ({
    ...exercise,
    sets: exercise.sets.map(set => ({ weight: String(set.weight), reps: String(set.reps) })),
    restInput: String(exercise.restSeconds)
  })) ?? []);
  const [activity, setActivity] = useState<CardioActivity>(schedule?.cardioData?.activity ?? '跑步');
  const [plannedDuration, setPlannedDuration] = useState(schedule?.cardioData?.plannedDurationMinutes?.toString() ?? '');
  const [cardioNote, setCardioNote] = useState(schedule?.cardioData?.note ?? '');
  const [note, setNote] = useState(schedule?.note ?? '');
  const [actualDuration, setActualDuration] = useState(schedule?.cardioData?.actualDurationMinutes?.toString() ?? '');
  const [distance, setDistance] = useState(schedule?.cardioData?.distanceKm?.toString() ?? '');

  function finish() {
    onSaved();
    onClose();
  }

  async function saveNote(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    try { await saveDailyNote(date, note); finish(); }
    catch (error) { toast(error instanceof Error ? error.message : '备注保存失败'); }
    finally { setBusy(false); }
  }

  function confirmReplacement(nextType: 'strength' | 'cardio' | 'rest'): boolean {
    if (!schedule?.type || schedule.type === nextType) return true;
    const current = schedule.type === 'strength' ? '力量训练' : schedule.type === 'cardio' ? '有氧训练' : '休息日';
    const next = nextType === 'strength' ? '力量训练' : nextType === 'cardio' ? '有氧训练' : '休息日';
    return window.confirm(`当天已有${current}安排。要替换为${next}吗？`);
  }

  async function saveRest() {
    if (!confirmReplacement('rest')) return;
    setBusy(true);
    try { await saveDailySchedule(date, { type: 'rest' }, Boolean(schedule?.type)); finish(); }
    catch (error) { toast(error instanceof Error ? error.message : '休息日保存失败'); }
    finally { setBusy(false); }
  }

  async function saveCardio(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!confirmReplacement('cardio')) return;
    const duration = plannedDuration.trim() ? Number(plannedDuration) : undefined;
    if (duration !== undefined && (!Number.isFinite(duration) || duration <= 0)) { toast('计划时长需大于 0 分钟'); return; }
    setBusy(true);
    try {
      await saveDailySchedule(date, { type: 'cardio', cardioData: { activity, plannedDurationMinutes: duration, note: cardioNote.trim() || undefined } }, Boolean(schedule?.type));
      finish();
    } catch (error) { toast(error instanceof Error ? error.message : '有氧安排保存失败'); }
    finally { setBusy(false); }
  }

  function updateExercise(index: number, update: (exercise: CustomExerciseDraft) => CustomExerciseDraft) {
    setCustomExercises(current => current.map((exercise, itemIndex) => itemIndex === index ? update(exercise) : exercise));
  }

  function addCustomExercise(definition: Exercise) {
    setCustomExercises(current => [...current, {
      exerciseId: definition.id, name: definition.name, muscle: definition.muscle, category: definition.category,
      restSeconds: definition.restSeconds, restInput: String(definition.restSeconds),
      sets: [{ weight: String(definition.referenceWeight ?? 0), reps: definition.lastSets?.[0]?.reps.toString() ?? '10' }]
    }]);
  }

  async function saveStrength(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!confirmReplacement('strength')) return;
    setBusy(true);
    try {
      let workoutTemplate: ScheduledStrengthTemplate;
      if (strengthMode === 'plan') {
        if (!planId || !dayId) throw new Error('请选择训练计划和训练日');
        workoutTemplate = await createStrengthTemplateFromPlan(planId, dayId);
      } else {
        if (!customExercises.length) throw new Error('至少添加一个动作');
        const templateExercises = customExercises.map(exercise => {
          const restSeconds = Number(exercise.restInput);
          if (!exercise.exerciseId || !exercise.sets.length || exercise.sets.length > 20 || !exercise.restInput.trim() || !Number.isInteger(restSeconds) || restSeconds < 0) throw new Error('请检查动作、组数和休息时间');
          const definition = exercises.find(item => item.id === exercise.exerciseId);
          const sets = exercise.sets.map(set => {
            const weight = Number(set.weight);
            const reps = Number(set.reps);
            if (!set.weight.trim() || !set.reps.trim() || !Number.isFinite(weight) || weight < 0 || !Number.isInteger(reps) || reps < 1) throw new Error('重量不能小于 0，次数需大于 0');
            return { weight, reps };
          });
          return {
            exerciseId: exercise.exerciseId,
            name: definition?.name ?? exercise.name,
            muscle: definition?.muscle ?? exercise.muscle,
            category: definition?.category ?? exercise.category,
            restSeconds,
            sets
          };
        });
        const savedName = customWorkoutName(templateExercises);
        workoutTemplate = {
          planId: schedule?.workoutTemplate?.planId,
          planName: schedule?.workoutTemplate?.planName ?? '自定义训练',
          workoutDayId: schedule?.workoutTemplate?.workoutDayId,
          workoutDayName: savedName,
          exercises: templateExercises
        };
      }
      await saveDailySchedule(date, { type: 'strength', workoutTemplate }, Boolean(schedule?.type));
      finish();
    } catch (error) { toast(error instanceof Error ? error.message : '力量训练安排保存失败'); }
    finally { setBusy(false); }
  }

  async function saveCardioLog(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const durationMinutes = Number(actualDuration);
    const distanceKm = distance.trim() ? Number(distance) : undefined;
    if (!Number.isFinite(durationMinutes) || durationMinutes <= 0) { toast('请输入有效的有氧时长'); return; }
    if (distanceKm !== undefined && (!Number.isFinite(distanceKm) || distanceKm < 0)) { toast('距离不能小于 0'); return; }
    setBusy(true);
    try { await completeCardio(date, { durationMinutes, distanceKm, note: cardioNote }); finish(); }
    catch (error) { toast(error instanceof Error ? error.message : '有氧记录保存失败'); }
    finally { setBusy(false); }
  }

  if (view === 'note') return <Modal title="当天备注" onClose={onClose} onSubmit={event => void saveNote(event)} submitLabel={busy ? '保存中…' : '保存备注'}>
    <label className="field-label">备注<textarea className="text-input schedule-note-input" maxLength={200} placeholder="例如：出差、状态一般" value={note} onChange={event => setNote(event.target.value)} /></label>
  </Modal>;

  if (view === 'cardio-log') return <Modal title="记录有氧完成情况" onClose={onClose} onSubmit={event => void saveCardioLog(event)} submitLabel={busy ? '保存中…' : '完成记录'}>
    <p className="muted small">{schedule?.cardioData?.activity ?? '有氧'}{schedule?.cardioData?.plannedDurationMinutes ? ` · 计划 ${schedule.cardioData.plannedDurationMinutes} 分钟` : ''}</p>
    <label className="field-label">实际时长（分钟）<input className="text-input" type="number" min="1" step="1" inputMode="numeric" required value={actualDuration} onChange={event => setActualDuration(event.target.value)} /></label>
    <label className="field-label">距离（公里，可选）<input className="text-input" type="number" min="0" step="0.1" inputMode="decimal" value={distance} onChange={event => setDistance(event.target.value)} /></label>
    <label className="field-label">备注（可选）<textarea className="text-input schedule-note-input" maxLength={200} value={cardioNote} onChange={event => setCardioNote(event.target.value)} /></label>
  </Modal>;

  if (view === 'strength') {
    const selectedPlan = plans.find(plan => plan.id === planId);
    const trainingDays = selectedPlan?.days.filter(day => !day.isRestDay) ?? [];
    return <Modal title="安排力量训练" onClose={onClose} onSubmit={event => void saveStrength(event)} submitLabel={busy ? '保存中…' : '保存安排'}>
      <div className="schedule-mode switcher">
        <button type="button" className={`switch-option${strengthMode === 'plan' ? ' selected' : ''}`} onClick={() => setStrengthMode('plan')}>选择训练计划</button>
        <button type="button" className={`switch-option${strengthMode === 'custom' ? ' selected' : ''}`} onClick={() => setStrengthMode('custom')}>自定义本次</button>
      </div>
      {strengthMode === 'plan' ? <>
        <label className="field-label">训练计划<select className="text-input" value={planId} onChange={event => { const nextPlan = plans.find(plan => plan.id === event.target.value); setPlanId(event.target.value); setDayId(nextPlan?.days.find(day => !day.isRestDay)?.id ?? ''); }}>
          <option value="">请选择计划</option>{plans.map(plan => <option key={plan.id} value={plan.id}>{plan.name}</option>)}
        </select></label>
        <label className="field-label">训练日<select className="text-input" value={dayId} onChange={event => setDayId(event.target.value)}>
          <option value="">请选择训练日</option>{trainingDays.map(day => <option key={day.id} value={day.id}>{day.name}</option>)}
        </select></label>
        {!trainingDays.length && <p className="muted small">请先创建一个包含力量训练日的计划。</p>}
      </> : <>
        <p className="muted small" aria-live="polite">本次训练：<strong className="custom-workout-name">{customExercises.length ? customWorkoutName(customExercises.map(exercise => ({ category: exercises.find(item => item.id === exercise.exerciseId)?.category ?? exercise.category }))) : '添加动作后自动生成名称'}</strong></p>
        {customExercises.map((exercise, index) => <section className="custom-exercise-editor" key={`${exercise.exerciseId}-${index}`}>
          <div className="row-between"><strong>{index + 1}. {exercise.name}</strong><button className="text-button" type="button" onClick={() => setCustomExercises(current => current.filter((_, itemIndex) => itemIndex !== index))}>移除</button></div>
          <label className="field-label">动作间休息（秒）<input className="text-input" type="number" min="0" step="1" value={exercise.restInput} onChange={event => updateExercise(index, current => ({ ...current, restInput: event.target.value }))} /></label>
          {exercise.sets.map((set, setIndex) => <div className="scheduled-set-editor" key={`${exercise.exerciseId}-${index}-${setIndex}`}>
            <strong>第 {setIndex + 1} 组</strong>
            <label>重量（kg）<input className="text-input" type="number" min="0" step="0.5" value={set.weight} onChange={event => updateExercise(index, current => ({ ...current, sets: current.sets.map((item, i) => i === setIndex ? { ...item, weight: event.target.value } : item) }))} /></label>
            <label>次数<input className="text-input" type="number" min="1" step="1" value={set.reps} onChange={event => updateExercise(index, current => ({ ...current, sets: current.sets.map((item, i) => i === setIndex ? { ...item, reps: event.target.value } : item) }))} /></label>
            <button className="text-button" type="button" onClick={() => updateExercise(index, current => ({ ...current, sets: current.sets.filter((_, i) => i !== setIndex) }))}>删除组</button>
          </div>)}
          <button className="text-button" type="button" onClick={() => updateExercise(index, current => current.sets.length >= 20 ? current : ({ ...current, sets: [...current.sets, { ...(current.sets[current.sets.length - 1] ?? { weight: '0', reps: '10' }) }] }))}>＋ 添加一组</button>
        </section>)}
        <ExercisePicker exercises={exercises} onAdd={addCustomExercise} />
      </>}
    </Modal>;
  }

  if (view === 'cardio') return <Modal title="安排有氧训练" onClose={onClose} onSubmit={event => void saveCardio(event)} submitLabel={busy ? '保存中…' : '保存安排'}>
    <label className="field-label">有氧类型<select className="text-input" value={activity} onChange={event => setActivity(event.target.value as CardioActivity)}>{cardioActivities.map(item => <option key={item}>{item}</option>)}</select></label>
    <label className="field-label">计划时长（分钟，可选）<input className="text-input" type="number" min="1" step="1" value={plannedDuration} onChange={event => setPlannedDuration(event.target.value)} /></label>
    <label className="field-label">备注（可选）<textarea className="text-input schedule-note-input" maxLength={200} value={cardioNote} onChange={event => setCardioNote(event.target.value)} /></label>
  </Modal>;

  return <Modal title={`${date.slice(5).replace('-', '月')}日安排`} onClose={onClose}>
    <div className="schedule-options">
      {allowTraining && <>
        <button className="schedule-option" onClick={() => setView('strength')}><strong>力量训练</strong><span>选择训练计划或自定义本次训练</span></button>
        <button className="schedule-option" onClick={() => setView('cardio')}><strong>有氧训练</strong><span>跑步、骑行等，完成时手动记录</span></button>
      </>}
      <button className="schedule-option" disabled={busy} onClick={() => void saveRest()}><strong>休息日</strong><span>安排当天休息</span></button>
      <button className="schedule-option" onClick={() => setView('note')}><strong>添加备注</strong><span>记录出差、状态等当天情况</span></button>
    </div>
  </Modal>;
}
