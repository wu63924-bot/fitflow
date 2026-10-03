import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router';
import { findNextSet, getPreviousPerformance, hasIncompleteSets, plannedExerciseFromDefinition, countCompletedSets, countSets, calculateVolume, createSet } from '../utils/workout';
import { adjustRestTimer, createRestTimer, remainingSeconds } from '../utils/timer';
import { formatClock, formatDuration } from '../utils/format';
import { useAsyncData } from '../hooks/useAsyncData';
import { listExercises } from '../repositories/exerciseRepository';
import { getSettings } from '../repositories/settingsRepository';
import { getWorkoutSession, listWorkoutSessions, mutateWorkoutSession } from '../repositories/workoutRepository';
import { addExerciseToWorkout } from '../services/workoutService';
import { BackHeader, EmptyState, useToast } from '../components/UI';
import type { WorkoutSession, WorkoutSessionExercise } from '../types';

interface SessionLoaded { session?: WorkoutSession; sessions: WorkoutSession[]; autoRestTimer: boolean; vibrationEnabled: boolean; exercises: Awaited<ReturnType<typeof listExercises>>; }
type SetInput = { weight?: string; reps?: string };

function readSetValues(set: WorkoutSessionExercise['sets'][number], input: SetInput | undefined, label: string) {
  const weightInput = input?.weight ?? String(set.weight);
  const repsInput = input?.reps ?? String(set.reps);
  const weight = Number(weightInput);
  const reps = Number(repsInput);
  if (!weightInput.trim() || !Number.isFinite(weight) || weight < 0) throw new Error(`${label}：请填写不小于 0 的重量`);
  if (!repsInput.trim() || !Number.isInteger(reps) || reps < 1) throw new Error(`${label}：请填写大于 0 的整数次数`);
  return { weight, reps };
}

function applySetValues(session: WorkoutSession, values: Map<string, ReturnType<typeof readSetValues>>) {
  for (const exercise of session.exercises) for (const set of exercise.sets) {
    const value = values.get(set.id);
    if (value) Object.assign(set, value);
  }
}

export function SessionPage() {
  const { sessionId = '' } = useParams();
  const navigate = useNavigate();
  const toast = useToast();
  const [now, setNow] = useState(Date.now());
  const [draftInputs, setDraftInputs] = useState<Record<string, SetInput>>({});
  const [exerciseId, setExerciseId] = useState('');
  const { data, loading, refresh, setData } = useAsyncData<SessionLoaded>(async () => {
    const [session, sessions, settings, exercises] = await Promise.all([getWorkoutSession(sessionId), listWorkoutSessions(), getSettings(), listExercises()]);
    return { session, sessions, autoRestTimer: settings.trainingSettings.autoRestTimer, vibrationEnabled: settings.trainingSettings.vibrationEnabled, exercises };
  }, [sessionId]);
  const session = data?.session;

  useEffect(() => {
    const intervalId = window.setInterval(() => setNow(Date.now()), 1000);
    const recalibrate = () => { setNow(Date.now()); if (document.visibilityState === 'visible') void refresh(); };
    document.addEventListener('visibilitychange', recalibrate);
    window.addEventListener('pageshow', recalibrate);
    return () => { window.clearInterval(intervalId); document.removeEventListener('visibilitychange', recalibrate); window.removeEventListener('pageshow', recalibrate); };
  }, [refresh]);

  useEffect(() => {
    if (!session?.restTimer || remainingSeconds(session.restTimer, now) !== 0 || session.restTimer.expiredNotified) return;
    void mutateWorkoutSession(session.id, stored => {
      if (!stored.restTimer || stored.restTimer.restEndsAt > Date.now() || stored.restTimer.expiredNotified) return;
      stored.restTimer.expiredNotified = true;
    }).then(() => refresh());
    if (data?.vibrationEnabled && typeof navigator.vibrate === 'function') navigator.vibrate(100);
  }, [session?.id, session?.restTimer?.restEndsAt, session?.restTimer?.expiredNotified, now, data?.vibrationEnabled, refresh]);

  if (loading || !data) return <div className="page"><div className="loading-state"><span className="spinner" />正在恢复训练…</div></div>;
  if (!session || session.status !== 'in_progress') return <div className="page"><BackHeader title="训练已结束" /><EmptyState title="找不到进行中的训练">返回训练页开始新的训练。</EmptyState><button className="primary-button full-button" onClick={() => navigate('/workout')}>回到训练</button></div>;
  const activeData = data;
  const activeSession = session;

  const currentIndex = Math.max(0, Math.min(activeSession.currentExerciseIndex, Math.max(0, activeSession.exercises.length - 1)));
  const timer = activeSession.restTimer;
  const remaining = timer ? remainingSeconds(timer, now) : 0;
  const timerTarget = timer ? resolveTarget(activeSession, timer) : undefined;
  const incompleteSets = activeSession.exercises.reduce((total, exercise) => total + (!exercise.skipped ? exercise.sets.filter(set => !set.completed).length : 0), 0);

  async function mutate(change: (current: WorkoutSession) => void) {
    const updated = await mutateWorkoutSession(activeSession.id, change);
    if (updated) setData(current => current ? { ...current, session: updated, sessions: current.sessions.map(item => item.id === updated.id ? updated : item) } : current);
  }

  function onInputChange(exerciseIndex: number, setIndex: number, field: 'weight' | 'reps', raw: string) {
    const set = activeSession.exercises[exerciseIndex]?.sets[setIndex];
    if (!set) return;
    setDraftInputs(current => ({ ...current, [set.id]: { ...current[set.id], [field]: raw } }));
  }

  function onAdjustSet(exerciseIndex: number, setIndex: number, field: 'weight' | 'reps', delta: number) {
    const set = activeSession.exercises[exerciseIndex]?.sets[setIndex];
    if (!set) return;
    const draftValue = draftInputs[set.id]?.[field];
    const parsedDraft = draftValue === undefined || draftValue === '' ? set[field] : Number(draftValue);
    const currentValue = Number.isFinite(parsedDraft) ? parsedDraft : set[field];
    const value = field === 'weight' ? Math.max(0, Math.round((currentValue + delta) * 10) / 10) : Math.max(1, currentValue + delta);
    setDraftInputs(current => ({ ...current, [set.id]: { ...current[set.id], [field]: String(value) } }));
  }

  function readDraftValues() {
    const values = new Map<string, ReturnType<typeof readSetValues>>();
    for (const exercise of activeSession.exercises) exercise.sets.forEach((set, index) => {
      const input = draftInputs[set.id];
      if (input) values.set(set.id, readSetValues(set, input, `${exercise.name}第 ${index + 1} 组`));
    });
    return values;
  }

  async function onSaveSets() {
    try {
      const values = readDraftValues();
      await mutate(current => applySetValues(current, values));
      setDraftInputs(current => Object.fromEntries(Object.entries(current).filter(([id, input]) => input !== draftInputs[id])));
      toast('组数据已保存');
    } catch (error) { toast(error instanceof Error ? error.message : '组数据保存失败'); }
  }

  async function onCompleteSet(exerciseIndex: number, setIndex: number) {
    const set = activeSession.exercises[exerciseIndex]?.sets[setIndex];
    if (!set) return;
    let values = { weight: set.weight, reps: set.reps };
    if (!set.completed) {
      try { values = readSetValues(set, draftInputs[set.id], `第 ${setIndex + 1} 组`); }
      catch (error) { toast(error instanceof Error ? error.message : '请检查本组数据'); return; }
    }
    const completedAt = Date.now();
    await mutate(current => {
      const activeSet = current.exercises[exerciseIndex].sets[setIndex];
      if (activeSet.completed) {
        activeSet.completed = false;
        activeSet.completedAt = undefined;
        if (current.restTimer?.triggeredBySetId === activeSet.id) current.restTimer = undefined;
        return;
      }
      activeSet.weight = values.weight;
      activeSet.reps = values.reps;
      activeSet.completed = true;
      activeSet.completedAt = completedAt;
      if (!activeData.autoRestTimer) return;
      const next = findNextSet(current, exerciseIndex, setIndex + 1);
      if (next) current.restTimer = createRestTimer(next.exerciseIndex, next.setIndex, current.exercises[next.exerciseIndex].restSeconds, completedAt, current.exercises[next.exerciseIndex].id, next.set.id, activeSet.id);
      else current.restTimer = undefined;
    });
    if (!set.completed) setDraftInputs(current => {
      if (current[set.id] !== draftInputs[set.id]) return current;
      const next = { ...current }; delete next[set.id]; return next;
    });
  }

  async function onAddSet(exerciseIndex: number) {
    if (activeSession.exercises[exerciseIndex].sets.length >= 20) { toast('每个动作最多 20 组'); return; }
    await mutate(current => {
      const exercise = current.exercises[exerciseIndex];
      const previous = exercise.sets[exercise.sets.length - 1];
      exercise.sets.push(createSet(previous?.weight ?? 0, previous?.reps ?? 10, exercise.sets.length, exercise.id));
    });
  }

  async function onDeleteSet(exerciseIndex: number, setIndex: number) {
    const set = activeSession.exercises[exerciseIndex]?.sets[setIndex];
    if (!set) return;
    if (set.completed && !window.confirm('删除这组会从训练记录和训练容量中移除，继续吗？')) return;
    await mutate(current => {
      current.exercises[exerciseIndex].sets.splice(setIndex, 1);
      if (current.restTimer?.targetSetId === set.id || current.restTimer?.triggeredBySetId === set.id) current.restTimer = undefined;
    });
  }

  async function onAdjustRest(seconds: number) {
    if (!activeSession.restTimer) return;
    await mutate(current => { if (current.restTimer) current.restTimer = adjustRestTimer(current.restTimer, seconds, Date.now()); });
  }

  async function onSkipRest() { await mutate(current => { current.restTimer = undefined; }); }

  async function addTemporaryExercise() {
    const definition = activeData.exercises.find(item => item.id === exerciseId);
    if (!definition) { toast('先选择一个动作'); return; }
    const planned = { ...plannedExerciseFromDefinition(definition, activeSession.exercises.length), sets: 1 };
    const updated = await addExerciseToWorkout(activeSession.id, planned);
    if (updated) {
      setData(current => current ? { ...current, session: updated } : current);
      setExerciseId('');
      toast('动作已添加');
    }
  }

  async function onSkipExercise(index: number) {
    await mutate(current => { current.exercises[index].skipped = !current.exercises[index].skipped; });
  }

  async function onFinish() {
    let values: ReturnType<typeof readDraftValues>;
    try { values = readDraftValues(); }
    catch (error) { toast(error instanceof Error ? error.message : '请检查组数据'); return; }
    if (hasIncompleteSets(activeSession) && !window.confirm(`还有 ${incompleteSets} 组未完成。仍要结束训练吗？`)) return;
    await mutate(current => { applySetValues(current, values); current.status = 'completed'; current.endedAt = Date.now(); current.restTimer = undefined; });
    navigate(`/workout/report/${activeSession.id}`, { replace: true });
  }

  const exerciseViews = activeSession.exercises;
  const currentExercise = exerciseViews[currentIndex];

  return <div className="page session-page">
    <div className="session-top row-between"><div><span className="eyebrow">训练中</span><h1 className="session-title">{activeSession.workoutDayName}</h1></div><button className="end-button" onClick={() => void onFinish()}>结束训练</button></div>
    <section className="timer-card card"><div><span className="timer-caption">训练总时长</span><strong className="elapsed">{formatDuration((now - activeSession.startedAt) / 1000)}</strong></div><div className="timer-stat"><span className="timer-caption">完成组数</span><strong className="timer-stat-value">{countCompletedSets(activeSession)} / {countSets(activeSession.exercises)}</strong></div></section>

    {exerciseViews.length > 0 && <div className="exercise-navigation card"><button className="nav-button" disabled={currentIndex === 0} onClick={() => void mutate(current => { current.currentExerciseIndex = Math.max(0, current.currentExerciseIndex - 1); })}>‹ 上一动作</button><span className="nav-count">{currentIndex + 1} / {exerciseViews.length}</span><button className="nav-button" disabled={currentIndex >= exerciseViews.length - 1} onClick={() => void mutate(current => { current.currentExerciseIndex = Math.min(current.exercises.length - 1, current.currentExerciseIndex + 1); })}>下一动作 ›</button></div>}
    {!exerciseViews.length && <EmptyState title="本次训练还没有动作">从动作库临时添加一个动作。</EmptyState>}

    {currentExercise && <ExercisePanel exercise={currentExercise} exerciseIndex={currentIndex} sessions={activeData.sessions} draftInputs={draftInputs} onInputChange={onInputChange} onAdjustSet={onAdjustSet} onSaveSets={onSaveSets} onCompleteSet={onCompleteSet} onAddSet={onAddSet} onDeleteSet={onDeleteSet} onSkipExercise={onSkipExercise} />}

    {exerciseViews.length > 1 && <div className="exercise-quick-nav">{exerciseViews.map((exercise, index) => <button key={exercise.id} className={`quick-exercise-chip${index === currentIndex ? ' selected' : ''}${exercise.skipped ? ' skipped' : ''}`} onClick={() => void mutate(current => { current.currentExerciseIndex = index; })}>{index + 1}. {exercise.name}</button>)}</div>}

    <div className="add-exercise-row session-add-exercise"><select className="text-input" aria-label="选择临时动作" value={exerciseId} onChange={event => setExerciseId(event.target.value)}><option value="">临时添加动作</option>{activeData.exercises.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}</select><button className="secondary-button" onClick={() => void addTemporaryExercise()}>添加</button></div>

    {timer && <section className={`rest-panel card${timer.expanded ? '' : ' rest-collapsed'}`}>
      {timer.expanded ? <>
        <div className="row-between"><div><strong className="rest-label">{remaining ? '组间休息' : '休息结束'}</strong><span className="rest-subtitle">准备第 {timerTarget ? timerTarget.setIndex + 1 : 1} 组 · {timerTarget?.exercise.name ?? ''}</span></div><strong className="rest-clock">{formatClock(remaining)}</strong></div>
        <div className="button-row"><button className="ghost-button" onClick={() => void onAdjustRest(-30)}>−30秒</button><button className="secondary-button" onClick={() => void onAdjustRest(30)}>＋30秒</button><button className="primary-button" onClick={() => void onSkipRest()}>跳过休息</button></div>
        <button className="collapse" onClick={() => void mutate(current => { if (current.restTimer) current.restTimer.expanded = false; })}>收起</button>
      </> : <><button className="rest-expand" onClick={() => void mutate(current => { if (current.restTimer) current.restTimer.expanded = true; })}>⏱ {remaining ? '休息' : '休息结束'} {formatClock(remaining)}</button><button className="collapsed-add" onClick={() => void onAdjustRest(30)}>＋30s</button></>}
    </section>}
    <button className="primary-button finish-button" onClick={() => void onFinish()}>结束训练</button>
  </div>;
}

function ExercisePanel({ exercise, exerciseIndex, sessions, draftInputs, onInputChange, onAdjustSet, onSaveSets, onCompleteSet, onAddSet, onDeleteSet, onSkipExercise }: {
  exercise: WorkoutSessionExercise; exerciseIndex: number; sessions: WorkoutSession[];
  draftInputs: Record<string, SetInput>;
  onInputChange: (exerciseIndex: number, setIndex: number, field: 'weight' | 'reps', value: string) => void;
  onAdjustSet: (exerciseIndex: number, setIndex: number, field: 'weight' | 'reps', delta: number) => void;
  onSaveSets: () => void;
  onCompleteSet: (exerciseIndex: number, setIndex: number) => void;
  onAddSet: (exerciseIndex: number) => void;
  onDeleteSet: (exerciseIndex: number, setIndex: number) => void;
  onSkipExercise: (exerciseIndex: number) => void;
}) {
  const previous = getPreviousPerformance(exercise.exerciseId, sessions.filter(item => !item.exercises.some(current => current.id === exercise.id)));
  const previousSets = previous?.sets.filter(set => set.completed) ?? [];
  return <article className={`exercise-session card${exercise.skipped ? ' exercise-skipped' : ''}`}>
    <div className="row-between exercise-session-head"><div><h2 className="exercise-name">{exercise.name}</h2><span className="exercise-meta">{exercise.muscle} · {exercise.sets.length} 组 · 休息 {exercise.restSeconds}s</span></div><span className="exercise-count">{exercise.sets.filter(set => set.completed).length}/{exercise.sets.length}</span></div>
    <div className="last-performance"><span className="last-label">上次成绩</span>{previousSets.length ? previousSets.map((set, index) => <span className="last-set" key={`${exercise.id}-last-${index}`}>{set.weight}kg × {set.reps}</span>) : <span className="last-set">暂无记录</span>}</div>
    {exercise.skipped ? <button className="secondary-button full-button" onClick={() => onSkipExercise(exerciseIndex)}>恢复动作</button> : <>
      <div className="sets-table-header"><span>组</span><span>上次成绩</span><span>本组</span></div>
      {exercise.sets.map((set, setIndex) => <div className={`set-row${set.completed ? ' is-complete' : ''}`} key={set.id}>
        <span className="set-number">{setIndex + 1}</span><span className="set-previous">{previousSets[setIndex] ? `${previousSets[setIndex].weight}×${previousSets[setIndex].reps}` : '—'}</span>
        <div className="set-actions"><button className={`set-done${set.completed ? ' done' : ''}`} aria-label={set.completed ? '撤销完成组' : '标记完成组'} onClick={() => onCompleteSet(exerciseIndex, setIndex)}>{set.completed ? '✓' : '完成'}</button><button className="set-delete" aria-label="删除组" onClick={() => onDeleteSet(exerciseIndex, setIndex)}>×</button></div>
        <div className="set-fields">
          <div className="set-stepper-control"><button className="step-button" aria-label="减少 2.5 公斤" onClick={() => onAdjustSet(exerciseIndex, setIndex, 'weight', -2.5)}>−</button><label><span className="sr-only">重量（公斤）</span><input className="set-input" type="number" inputMode="decimal" min="0" step="0.5" value={draftInputs[set.id]?.weight ?? set.weight} onChange={event => onInputChange(exerciseIndex, setIndex, 'weight', event.target.value)} /></label><button className="step-button" aria-label="增加 2.5 公斤" onClick={() => onAdjustSet(exerciseIndex, setIndex, 'weight', 2.5)}>＋</button><span className="set-unit">kg</span></div>
          <span className="set-times">×</span>
          <div className="set-stepper-control reps-stepper-control"><button className="step-button" aria-label="减少 1 次" onClick={() => onAdjustSet(exerciseIndex, setIndex, 'reps', -1)}>−</button><label><span className="sr-only">次数</span><input className="set-input reps-input" type="number" inputMode="numeric" min="1" step="1" value={draftInputs[set.id]?.reps ?? set.reps} onChange={event => onInputChange(exerciseIndex, setIndex, 'reps', event.target.value)} /></label><button className="step-button" aria-label="增加 1 次" onClick={() => onAdjustSet(exerciseIndex, setIndex, 'reps', 1)}>＋</button><span className="set-unit">次</span></div>
        </div>
      </div>)}
      <button className="secondary-button full-button" onClick={onSaveSets}>保存组数据</button>
      <p className="muted small">完成一组时也会保存本组数据。</p>
      <button className="add-set" onClick={() => onAddSet(exerciseIndex)}>＋ 添加一组</button>
      <button className="skip-exercise" onClick={() => onSkipExercise(exerciseIndex)}>跳过动作</button>
    </>}
  </article>;
}

function resolveTarget(session: WorkoutSession, timer: NonNullable<WorkoutSession['restTimer']>) {
  if (timer.targetExerciseId && timer.targetSetId) {
    const exercise = session.exercises.find(item => item.id === timer.targetExerciseId);
    const set = exercise?.sets.find(item => item.id === timer.targetSetId);
    if (exercise && set) return { exercise, set, setIndex: exercise.sets.findIndex(item => item.id === set.id) };
  }
  const next = findNextSet(session, timer.exerciseIndex, timer.setIndex);
  return next ? { exercise: session.exercises[next.exerciseIndex], set: next.set, setIndex: next.setIndex } : undefined;
}

export function WorkoutReportPage() {
  const { sessionId = '' } = useParams();
  const navigate = useNavigate();
  const { data, loading } = useAsyncData(async () => getWorkoutSession(sessionId), [sessionId]);
  if (loading) return <div className="page"><div className="loading-state"><span className="spinner" />正在整理训练报告…</div></div>;
  if (!data) return <div className="page"><BackHeader title="训练报告" /><EmptyState title="找不到这次训练" /></div>;
  const minutes = Math.max(0, Math.round(((data.endedAt ?? Date.now()) - data.startedAt) / 60000));
  return <div className="page complete-page">
    <div className="complete-mark">✓</div><h1 className="complete-title">训练完成</h1><p className="complete-subtitle">{data.workoutDayName} · {new Intl.DateTimeFormat('zh-CN', { hour: '2-digit', minute: '2-digit' }).format(new Date(data.endedAt ?? Date.now()))}</p>
    <div className="report-stats card"><div className="report-stat"><strong className="report-value">{formatDuration(minutes * 60)}</strong><span className="report-label">训练时长</span></div><div className="report-stat"><strong className="report-value">{countCompletedSets(data)}</strong><span className="report-label">完成组数</span></div><div className="report-stat"><strong className="report-value">{Math.round(calculateVolume(data)).toLocaleString()}</strong><span className="report-label">训练容量 kg</span></div></div>
    <section className="section"><h2 className="section-title">动作表现</h2>{data.exercises.map(exercise => <div className="report-exercise card" key={exercise.id}><div className="row-between"><strong>{exercise.name}</strong><span className="muted small">{exercise.skipped ? '已跳过' : `${exercise.sets.filter(set => set.completed).length} / ${exercise.sets.length} 组`}</span></div><div className="detail-sets">{exercise.sets.filter(set => set.completed).map((set, index) => <span className="detail-set" key={set.id}>{index + 1}. {set.weight}kg × {set.reps}</span>)}</div></div>)}</section>
    <button className="primary-button full-button" onClick={() => navigate('/history')}>查看训练历史</button><button className="secondary-button full-button report-home" onClick={() => navigate('/home')}>返回首页</button>
  </div>;
}
