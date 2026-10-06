import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router';
import { moveItem, plannedExerciseFromDefinition } from '../utils/workout';
import { useAsyncData } from '../hooks/useAsyncData';
import { listExercises } from '../repositories/exerciseRepository';
import { getSettings, saveSettings } from '../repositories/settingsRepository';
import { getTrainingPlan, saveTrainingPlan } from '../repositories/trainingPlanRepository';
import { BackHeader, EmptyState, useToast } from '../components/UI';
import { ExercisePicker } from '../components/ExercisePicker';
import type { Exercise, TrainingPlan, WorkoutDay } from '../types';

const weekdays = ['周一', '周二', '周三', '周四', '周五', '周六', '周日'];
type ParameterField = 'sets' | 'reps' | 'referenceWeight' | 'restSeconds';

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
  const [expandedExercises, setExpandedExercises] = useState<Record<string, boolean>>({});
  const [pickerOpen, setPickerOpen] = useState(false);
  const [parameterInputs, setParameterInputs] = useState<Record<string, Partial<Record<ParameterField, string>>>>({});
  const { data, loading } = useAsyncData(async () => {
    const [plan, exercises] = await Promise.all([isNew ? Promise.resolve(newPlan()) : getTrainingPlan(planId), listExercises()]);
    return { plan, exercises };
  }, [planId]);
  useEffect(() => {
    if (!data?.plan) return;
    setDraft(data.plan);
    const requestedDay = searchParams.get('day');
    setSelectedDayId(data.plan.days.find(day => day.id === requestedDay)?.id ?? data.plan.days.slice().sort((a, b) => a.order - b.order)[0]?.id ?? '');
    setPickerOpen(false);
    setExpandedExercises({});
  }, [data, searchParams]);

  const selectedDay = draft?.days.find(day => day.id === selectedDayId);
  const exerciseOptions = useMemo(() => [...(data?.exercises ?? []), ...extraExercises], [data?.exercises, extraExercises]);
  if (loading || !data) return <div className="page"><div className="loading-state"><span className="spinner" />正在读取计划…</div></div>;
  if (!draft) return <div className="page"><BackHeader title="找不到计划" /><EmptyState title="这个训练计划不存在">返回训练页重新打开计划。</EmptyState></div>;
  const currentDraft = draft;

  function updateDay(dayId: string, change: Partial<WorkoutDay>) {
    setDraft(current => current && ({ ...current, days: current.days.map(day => day.id === dayId ? { ...day, ...change } : day) }));
  }

  function setParameterInput(id: string, field: ParameterField, value: string) {
    setParameterInputs(current => ({ ...current, [id]: { ...current[id], [field]: value } }));
  }

  function reorderExercise(day: WorkoutDay, index: number, delta: number) {
    const reordered = moveItem(day.exercises.slice().sort((a, b) => a.order - b.order), index, delta).map((item, order) => ({ ...item, order }));
    updateDay(day.id, { exercises: reordered });
  }

  async function onSave() {
    if (!currentDraft.name.trim()) { toast('请输入计划名称'); return; }
    try {
      const days = currentDraft.days.map(day => ({ ...day, exercises: day.exercises.map(item => {
        const input = parameterInputs[item.id];
        function readNumber(value: string, label: string, min: number, max = Infinity, integer = true) {
          const number = Number(value);
          if (!value.trim() || !Number.isFinite(number) || number < min || number > max || (integer && !Number.isInteger(number))) {
            setSelectedDayId(day.id);
            setExpandedExercises(current => ({ ...current, [item.id]: true }));
            throw new Error(`${day.weekday}：请填写有效的${label}`);
          }
          return number;
        }
        const reps = readNumber(input?.reps ?? String(item.repsMin), '次数', 1);
        // Retain the existing storage fields for old plans and backups; new edits use a fixed count.
        return { ...item,
          sets: readNumber(input?.sets ?? String(item.sets), '组数（1–20）', 1, 20),
          repsMin: reps, repsMax: reps,
          referenceWeight: readNumber(input?.referenceWeight ?? String(item.referenceWeight ?? 0), '参考重量', 0, Infinity, false),
          restSeconds: readNumber(input?.restSeconds ?? String(item.restSeconds), '休息秒数（0–600）', 0, 600)
        };
      }) }));
      await saveTrainingPlan({ ...currentDraft, days, name: currentDraft.name.trim() });
      const settings = await getSettings();
      if (!settings.activePlanId) await saveSettings({ ...settings, activePlanId: currentDraft.id });
      toast('训练计划已保存');
      navigate('/workout', { replace: true });
    } catch (error) { toast(error instanceof Error ? error.message : '训练计划保存失败'); }
  }

  function addExercise(definition: Exercise) {
    if (!selectedDay || selectedDay.isRestDay) return;
    if (!exerciseOptions.some(item => item.id === definition.id)) setExtraExercises(current => [...current, definition]);
    updateDay(selectedDay.id, { exercises: [...selectedDay.exercises, { ...plannedExerciseFromDefinition(definition, selectedDay.exercises.length), sets: 1 }] });
  }

  return <div className="page plan-editor-page">
    <BackHeader title={isNew ? '新建训练计划' : '编辑训练计划'} />
    <label className="field-label">计划名称<input className="text-input" value={draft.name} onChange={event => setDraft({ ...draft, name: event.target.value })} maxLength={40} /></label>
    <div className="plan-week-selector" aria-label="选择训练日">
      {draft.days.slice().sort((a, b) => a.order - b.order).map(day => <button key={day.id} className={selectedDayId === day.id ? 'selected' : ''} aria-label={day.weekday} aria-pressed={selectedDayId === day.id} onClick={() => { setSelectedDayId(day.id); setPickerOpen(false); }}>{day.weekday.replace('周', '')}</button>)}
    </div>
    <p className="plan-cycle-summary">七天循环 · 已安排 {draft.days.filter(day => !day.isRestDay).length} 个训练日</p>
    {selectedDay && <>
      <section className="plan-day-card card">
        <div className="row-between"><h2 className="section-title">{selectedDay.weekday}</h2><div className="plan-day-mode" aria-label="训练日类型"><button aria-pressed={!selectedDay.isRestDay} className={!selectedDay.isRestDay ? 'selected' : ''} onClick={() => { if (selectedDay.isRestDay) updateDay(selectedDay.id, { isRestDay: false, name: '训练日' }); }}>训练</button><button aria-pressed={selectedDay.isRestDay} className={selectedDay.isRestDay ? 'selected' : ''} onClick={() => { if (!selectedDay.isRestDay) updateDay(selectedDay.id, { isRestDay: true, name: '休息' }); }}>休息</button></div></div>
        <label className="field-label plan-day-name">{selectedDay.isRestDay ? '休息日名称' : '训练名称'}<input className="text-input" value={selectedDay.name} onChange={event => updateDay(selectedDay.id, { name: event.target.value })} maxLength={32} /></label>
        {selectedDay.isRestDay ? <p className="muted small">休息日 · 恢复与拉伸</p> : <>
          <div className="section-head compact-head"><h3 className="section-title">动作安排</h3><span className="muted small">{selectedDay.exercises.length} 个动作</span></div>
          {!selectedDay.exercises.length && <p className="muted small">还没有动作，点击下方添加。</p>}
        {selectedDay.exercises.slice().sort((a, b) => a.order - b.order).map((item, index) => {
          const exercise = exerciseOptions.find(definition => definition.id === item.exerciseId);
          return <div className="planned-editor plan-exercise-row" key={item.id}>
            <button className="plan-exercise-summary" aria-expanded={Boolean(expandedExercises[item.id])} onClick={() => setExpandedExercises(current => ({ ...current, [item.id]: !current[item.id] }))}><span><strong>{exercise?.name ?? '未知动作'}</strong><small>{parameterInputs[item.id]?.sets ?? item.sets} 组 × {parameterInputs[item.id]?.reps ?? item.repsMin} 次 · {parameterInputs[item.id]?.referenceWeight ?? item.referenceWeight ?? 0} kg · 休息 {parameterInputs[item.id]?.restSeconds ?? item.restSeconds} 秒</small></span><span aria-hidden="true">{expandedExercises[item.id] ? '⌃' : '›'}</span></button>
            {expandedExercises[item.id] && <>
            <div className="planned-fields">
              <label>组数<input type="number" min="1" max="20" step="1" inputMode="numeric" value={parameterInputs[item.id]?.sets ?? String(item.sets)} onChange={event => setParameterInput(item.id, 'sets', event.target.value)} /></label>
              <label>次数<input type="number" min="1" step="1" inputMode="numeric" value={parameterInputs[item.id]?.reps ?? String(item.repsMin)} onChange={event => setParameterInput(item.id, 'reps', event.target.value)} /></label>
              <label>参考重量 kg<input type="number" min="0" step="0.5" inputMode="decimal" value={parameterInputs[item.id]?.referenceWeight ?? String(item.referenceWeight ?? 0)} onChange={event => setParameterInput(item.id, 'referenceWeight', event.target.value)} /></label>
              <label>休息秒数<input type="number" min="0" max="600" step="1" inputMode="numeric" value={parameterInputs[item.id]?.restSeconds ?? String(item.restSeconds)} onChange={event => setParameterInput(item.id, 'restSeconds', event.target.value)} /></label>
            </div>
            <div className="plan-exercise-actions"><button className="ghost-button" aria-label="上移" disabled={index === 0} onClick={() => reorderExercise(selectedDay, index, -1)}>↑ 上移</button><button className="ghost-button" aria-label="下移" disabled={index === selectedDay.exercises.length - 1} onClick={() => reorderExercise(selectedDay, index, 1)}>↓ 下移</button><button className="ghost-button danger-icon" aria-label="删除动作" onClick={() => updateDay(selectedDay.id, { exercises: selectedDay.exercises.filter(exerciseItem => exerciseItem.id !== item.id).map((exerciseItem, order) => ({ ...exerciseItem, order })) })}>删除</button></div>
            </>}
          </div>;
        })}
        <button className="secondary-button full-button plan-add-exercise" aria-expanded={pickerOpen} onClick={() => setPickerOpen(value => !value)}>{pickerOpen ? '收起动作库' : '＋ 添加动作'}</button>
        {pickerOpen && <div className="plan-exercise-picker"><ExercisePicker exercises={exerciseOptions} onAdd={addExercise} /></div>}
        </>}
      </section>
      <details className="plan-more-settings card" key={selectedDay.id}><summary>更多设置<span aria-hidden="true">⌄</span></summary><label className="field-label">目标肌群<input className="text-input" value={selectedDay.targetMuscles} onChange={event => updateDay(selectedDay.id, { targetMuscles: event.target.value })} maxLength={48} /></label></details>
    </>}
    <div className="plan-save-bar"><button className="primary-button full-button" onClick={() => void onSave()}>保存训练计划</button></div>
  </div>;
}
