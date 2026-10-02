import { useEffect, useMemo, useState } from 'react';
import type { FormEvent } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router';
import { moveItem, plannedExerciseFromDefinition } from '../utils/workout';
import { useAsyncData } from '../hooks/useAsyncData';
import { listExercises, saveExercise } from '../repositories/exerciseRepository';
import { getSettings, saveSettings } from '../repositories/settingsRepository';
import { getTrainingPlan, saveTrainingPlan } from '../repositories/trainingPlanRepository';
import { BackHeader, EmptyState, useToast } from '../components/UI';
import type { Exercise, ExerciseCategory, PlannedExercise, TrainingPlan, WorkoutDay } from '../types';

const weekdays = ['周一', '周二', '周三', '周四', '周五', '周六', '周日'];
const categories: ExerciseCategory[] = ['胸', '背', '肩', '二头', '三头', '腿', '核心', '有氧', '其他'];

function newPlan(): TrainingPlan {
  const now = Date.now();
  return {
    id: `plan-${now}-${Math.floor(Math.random() * 100000)}`,
    name: '我的训练计划', createdAt: now, updatedAt: now,
    days: weekdays.map((weekday, index) => ({
      id: `day-${now}-${index}`, weekday, cycleIndex: (index + 1) % 7, order: index,
      name: index === 0 ? '训练日' : '休息', targetMuscles: index === 0 ? '自定义训练' : '恢复与拉伸',
      isRestDay: index !== 0, exercises: []
    }))
  };
}

export function PlanEditorPage() {
  const { planId = 'new' } = useParams();
  const isNew = planId === 'new';
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const toast = useToast();
  const [draft, setDraft] = useState<TrainingPlan>();
  const [extraExercises, setExtraExercises] = useState<Exercise[]>([]);
  const [selectedDayId, setSelectedDayId] = useState('');
  const [exerciseId, setExerciseId] = useState('');
  const [showCustomExercise, setShowCustomExercise] = useState(false);
  const [customName, setCustomName] = useState('');
  const [customCategory, setCustomCategory] = useState<ExerciseCategory>('胸');
  const { data, loading } = useAsyncData(async () => {
    const [plan, exercises] = await Promise.all([isNew ? Promise.resolve(newPlan()) : getTrainingPlan(planId), listExercises()]);
    return { plan, exercises };
  }, [planId]);
  useEffect(() => {
    if (!data?.plan) return;
    setDraft(data.plan);
    const requestedDay = searchParams.get('day');
    if (requestedDay) setSelectedDayId(requestedDay);
  }, [data, searchParams]);

  const selectedDay = draft?.days.find(day => day.id === selectedDayId);
  const exerciseOptions = useMemo(() => [...(data?.exercises ?? []), ...extraExercises], [data?.exercises, extraExercises]);
  if (loading || !data) return <div className="page"><div className="loading-state"><span className="spinner" />正在读取计划…</div></div>;
  if (!draft) return <div className="page"><BackHeader title="找不到计划" /><EmptyState title="这个训练计划不存在">返回训练页重新打开计划。</EmptyState></div>;
  const currentDraft = draft;

  function updateDay(dayId: string, change: Partial<WorkoutDay>) {
    setDraft(current => current && ({ ...current, days: current.days.map(day => day.id === dayId ? { ...day, ...change } : day) }));
  }

  function updateExercise(dayId: string, exerciseIdToUpdate: string, change: Partial<PlannedExercise>) {
    setDraft(current => current && ({ ...current, days: current.days.map(day => day.id === dayId ? {
      ...day, exercises: day.exercises.map(item => item.id === exerciseIdToUpdate ? { ...item, ...change } : item)
    } : day) }));
  }

  function reorderExercise(day: WorkoutDay, index: number, delta: number) {
    const reordered = moveItem(day.exercises.slice().sort((a, b) => a.order - b.order), index, delta).map((item, order) => ({ ...item, order }));
    updateDay(day.id, { exercises: reordered });
  }

  async function onSave() {
    if (!currentDraft.name.trim()) { toast('请输入计划名称'); return; }
    await saveTrainingPlan({ ...currentDraft, name: currentDraft.name.trim() });
    const settings = await getSettings();
    if (!settings.activePlanId) await saveSettings({ ...settings, activePlanId: currentDraft.id });
    toast('训练计划已保存');
    navigate('/workout', { replace: true });
  }

  async function addExercise() {
    if (!selectedDay || selectedDay.isRestDay) { toast('先选择一个训练日'); return; }
    const definition = exerciseOptions.find(item => item.id === exerciseId);
    if (!definition) { toast('请选择动作'); return; }
    const planned = plannedExerciseFromDefinition(definition, selectedDay.exercises.length);
    updateDay(selectedDay.id, { exercises: [...selectedDay.exercises, planned] });
    setExerciseId('');
  }

  async function onCreateExercise(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const name = customName.trim();
    if (!name) { toast('请输入动作名称'); return; }
    const exercise: Exercise = {
      id: `custom-${Date.now()}-${Math.floor(Math.random() * 10000)}`, name,
      muscle: `${customCategory}部`, category: customCategory, sets: 3, repRange: '8–12', restSeconds: 90, isCustom: true
    };
    await saveExercise(exercise);
    setExtraExercises(current => [...current, exercise]);
    if (selectedDay) updateDay(selectedDay.id, { exercises: [...selectedDay.exercises, plannedExerciseFromDefinition(exercise, selectedDay.exercises.length)] });
    setCustomName('');
    setShowCustomExercise(false);
    toast('动作已添加');
  }

  return <div className="page">
    <BackHeader title={isNew ? '新建训练计划' : '编辑训练计划'} subtitle="所有更改会保存在本机" />
    <label className="field-label">计划名称<input className="text-input" value={draft.name} onChange={event => setDraft({ ...draft, name: event.target.value })} maxLength={40} /></label>
    <section className="section">
      <div className="section-head"><h2 className="section-title">训练周期</h2><span className="muted small">七天循环</span></div>
      <div className="day-editor-list">
        {draft.days.slice().sort((a, b) => a.order - b.order).map(day => <button key={day.id} className={`day-editor-card card${selectedDayId === day.id ? ' day-editor-selected' : ''}`} onClick={() => setSelectedDayId(day.id)}>
          <span className="day-editor-weekday">{day.weekday}</span>
          <span className="day-editor-copy"><strong>{day.name}</strong><small>{day.isRestDay ? '休息日' : `${day.exercises.length} 个动作 · ${day.targetMuscles}`}</small></span>
          <span className="exercise-chevron">›</span>
        </button>)}
      </div>
    </section>

    {selectedDay && <section className="section day-detail-editor card">
      <div className="row-between"><h2 className="section-title">编辑 {selectedDay.weekday}</h2><button className="text-button" onClick={() => setSelectedDayId('')}>收起</button></div>
      <label className="field-label">训练日名称<input className="text-input" value={selectedDay.name} onChange={event => updateDay(selectedDay.id, { name: event.target.value })} maxLength={32} /></label>
      <label className="field-label">目标肌群<input className="text-input" value={selectedDay.targetMuscles} onChange={event => updateDay(selectedDay.id, { targetMuscles: event.target.value })} maxLength={48} /></label>
      <label className="toggle-row"><input type="checkbox" checked={selectedDay.isRestDay} onChange={event => updateDay(selectedDay.id, { isRestDay: event.target.checked, name: event.target.checked ? '休息' : '训练日' })} /><span>设为休息日</span></label>

      {!selectedDay.isRestDay && <>
        <div className="section-head compact-head"><h3 className="section-title">动作安排</h3><span className="muted small">可调整顺序与参数</span></div>
        {!selectedDay.exercises.length && <p className="muted small">还没有动作，从动作库添加一个。</p>}
        {selectedDay.exercises.slice().sort((a, b) => a.order - b.order).map((item, index) => {
          const exercise = exerciseOptions.find(definition => definition.id === item.exerciseId);
          return <div className="planned-editor card" key={item.id}>
            <div className="planned-editor-title"><strong>{exercise?.name ?? '未知动作'}</strong><div className="inline-actions"><button className="icon-button" aria-label="上移" disabled={index === 0} onClick={() => reorderExercise(selectedDay, index, -1)}>↑</button><button className="icon-button" aria-label="下移" disabled={index === selectedDay.exercises.length - 1} onClick={() => reorderExercise(selectedDay, index, 1)}>↓</button><button className="icon-button danger-icon" aria-label="删除" onClick={() => updateDay(selectedDay.id, { exercises: selectedDay.exercises.filter(exerciseItem => exerciseItem.id !== item.id).map((exerciseItem, order) => ({ ...exerciseItem, order })) })}>×</button></div></div>
            <div className="planned-fields">
              <label>组数<input type="number" min="1" max="20" value={item.sets} onChange={event => updateExercise(selectedDay.id, item.id, { sets: Math.max(1, Math.min(20, Number(event.target.value) || 1)) })} /></label>
              <label>次数下限<input type="number" min="1" value={item.repsMin} onChange={event => { const repsMin = Math.max(1, Number(event.target.value) || 1); updateExercise(selectedDay.id, item.id, { repsMin, repsMax: Math.max(item.repsMax, repsMin) }); }} /></label>
              <label>次数上限<input type="number" min="1" value={item.repsMax} onChange={event => updateExercise(selectedDay.id, item.id, { repsMax: Math.max(item.repsMin, Number(event.target.value) || item.repsMin) })} /></label>
              <label>参考重量 kg<input type="number" min="0" step="0.5" value={item.referenceWeight ?? 0} onChange={event => updateExercise(selectedDay.id, item.id, { referenceWeight: Math.max(0, Number(event.target.value) || 0) })} /></label>
              <label>休息秒数<input type="number" min="0" max="600" step="15" value={item.restSeconds} onChange={event => updateExercise(selectedDay.id, item.id, { restSeconds: Math.max(0, Math.min(600, Number(event.target.value) || 0)) })} /></label>
            </div>
          </div>;
        })}
        <div className="add-exercise-row">
          <select className="text-input" aria-label="选择动作" value={exerciseId} onChange={event => setExerciseId(event.target.value)}>
            <option value="">选择动作库动作</option>
            {exerciseOptions.map(item => <option key={item.id} value={item.id}>{item.name}{item.isCustom ? ' · 自定义' : ''}</option>)}
          </select>
          <button className="secondary-button" onClick={() => void addExercise()}>添加动作</button>
        </div>
        <button className="text-button custom-exercise-toggle" onClick={() => setShowCustomExercise(value => !value)}>{showCustomExercise ? '收起自定义动作' : '＋ 新建自定义动作'}</button>
        {showCustomExercise && <form className="custom-exercise-form" onSubmit={event => void onCreateExercise(event)}>
          <input className="text-input" placeholder="动作名称" value={customName} onChange={event => setCustomName(event.target.value)} required />
          <select className="text-input" value={customCategory} onChange={event => setCustomCategory(event.target.value as ExerciseCategory)}>{categories.map(category => <option key={category}>{category}</option>)}</select>
          <button className="secondary-button">保存动作</button>
        </form>}
      </>}
    </section>}
    <button className="primary-button sticky-action" onClick={() => void onSave()}>保存训练计划</button>
  </div>;
}
