import { RestNotificationOffer } from '../components/ActiveWorkout';
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
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});
  const [restDetailsOpen, setRestDetailsOpen] = useState(false);
  const [addExerciseOpen, setAddExerciseOpen] = useState(false);
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

  async function onMinimize() {
    try {
      const values = readDraftValues();
      await mutate(current => applySetValues(current, values));
      navigate('/home');
    } catch (error) { toast(error instanceof Error ? error.message : '组数据保存失败'); }
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

  return <div className="page session-page simple-session">
    <header className="session-toolbar"><button className="ghost-button" onClick={() => void onMinimize()}>‹ 返回主页</button><strong>FitFlow</strong><button className="end-button" onClick={() => void onFinish()}>结束训练</button></header>
    <h1 className="session-title">{activeSession.workoutDayName}</h1>
    <p className="session-summary"><span className="elapsed">{formatDuration((now - activeSession.startedAt) / 1000)}</span> · 已完成 {countCompletedSets(activeSession)}/{countSets(activeSession.exercises)} 组</p>
    {timer && <RestNotificationOffer />}
    {!exerciseViews.length && <EmptyState title="本次训练还没有动作">从动作库临时添加一个动作。</EmptyState>}
    {exerciseViews.map((exercise, index) => <ExercisePanel key={exercise.id} collapsed={collapsed[exercise.id] ?? index !== currentIndex} onToggle={() => setCollapsed(current => ({ ...current, [exercise.id]: !(current[exercise.id] ?? index !== currentIndex) }))} exercise={exercise} exerciseIndex={index} sessions={activeData.sessions} draftInputs={draftInputs} onInputChange={onInputChange} onAdjustSet={onAdjustSet} onSaveSets={onSaveSets} onCompleteSet={onCompleteSet} onAddSet={onAddSet} onDeleteSet={onDeleteSet} onSkipExercise={onSkipExercise} />)}
    <button className="add-set simple-add-exercise" aria-expanded={addExerciseOpen} onClick={() => setAddExerciseOpen(value => !value)}>＋ 添加动作</button>
    {addExerciseOpen && <div className="add-exercise-row session-add-exercise"><select className="text-input" aria-label="选择临时动作" value={exerciseId} onChange={event => setExerciseId(event.target.value)}><option value="">临时添加动作</option>{activeData.exercises.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}</select><button className="secondary-button" onClick={() => void addTemporaryExercise()}>添加</button></div>}
    {timer && <aside className="rest-widget" aria-label="休息计时器">
      {restDetailsOpen && <section className="rest-controls card" aria-label="休息操作">
        <div className="row-between"><strong>休息设置</strong><button className="ghost-button" aria-label="收起休息设置" onClick={() => setRestDetailsOpen(false)}>收起</button></div>
        <p className="muted small">第 {timerTarget ? timerTarget.setIndex + 1 : 1} 组 · {timerTarget?.exercise.name ?? ''}</p>
        <div className="button-row"><button className="ghost-button" onClick={() => void onAdjustRest(-30)}>−30秒</button><button className="secondary-button" onClick={() => void onAdjustRest(30)}>＋30秒</button><button className="primary-button" onClick={() => { setRestDetailsOpen(false); void onSkipRest(); }}>跳过休息</button></div>
      </section>}
      <button className="rest-tile" aria-label="休息设置" aria-expanded={restDetailsOpen} onClick={() => setRestDetailsOpen(value => !value)}><span className="rest-tile-expand" aria-hidden="true">{restDetailsOpen ? '×' : '↗'}</span><span className="rest-label">{remaining ? '休息' : '休息结束'}</span><strong className="rest-clock">{formatClock(remaining)}</strong></button>
    </aside>}
    {exerciseViews.length > 0 && <nav className="session-footer" aria-label="动作导航"><button className="secondary-button" disabled={currentIndex === 0} onClick={() => { const index = currentIndex - 1; setCollapsed(current => ({ ...current, [exerciseViews[currentIndex].id]: true, [exerciseViews[index].id]: false })); void mutate(current => { current.currentExerciseIndex = index; }); }}>‹ 上一动作</button><button className="primary-button" disabled={currentIndex >= exerciseViews.length - 1} onClick={() => { const index = currentIndex + 1; setCollapsed(current => ({ ...current, [exerciseViews[currentIndex].id]: true, [exerciseViews[index].id]: false })); void mutate(current => { current.currentExerciseIndex = index; }); }}>下一动作 ›</button></nav>}
  </div>;
}

function ExercisePanel({ collapsed, onToggle, exercise, exerciseIndex, sessions, draftInputs, onInputChange, onAdjustSet, onSaveSets, onCompleteSet, onAddSet, onDeleteSet, onSkipExercise }: {
  collapsed: boolean; onToggle: () => void;
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
  const [editing, setEditing] = useState<{ setId: string; field: 'weight' | 'reps' }>();
  const nextSetIndex = exercise.sets.findIndex(set => !set.completed);
  const editingIndex = exercise.sets.findIndex(set => set.id === editing?.setId);
  return <article className={`exercise-session card simple-exercise${exercise.skipped ? ' exercise-skipped' : ''}`}>
    <div className="row-between exercise-session-head"><h2 className="exercise-name">{exercise.name}</h2><span className="exercise-count">{exercise.sets.filter(set => set.completed).length}/{exercise.sets.length} 组</span><button className="exercise-toggle" aria-label={collapsed ? '展开动作' : '收起动作'} aria-expanded={!collapsed} onClick={onToggle}>{collapsed ? '⌄' : '⌃'}</button><button className="secondary-button exercise-add-set" aria-label="添加一组" onClick={() => onAddSet(exerciseIndex)}>＋ 加一组</button><details className="exercise-more"><summary aria-label={`${exercise.name}更多操作`}>⋯</summary><div className="exercise-menu">
      <div className="last-performance"><span className="last-label">上次成绩</span>{previousSets.length ? previousSets.map((set, index) => <span className="last-set" key={index}>{set.weight}kg × {set.reps}</span>) : <span className="last-set">暂无记录</span>}</div>
      <button className="ghost-button" onClick={onSaveSets}>保存组数据</button><button className="ghost-button" onClick={() => onSkipExercise(exerciseIndex)}>{exercise.skipped ? '恢复动作' : '跳过动作'}</button>
    </div></details></div>
    <div className={`exercise-details${collapsed ? ' is-collapsed' : ''}`} inert={collapsed}><div>
      {!exercise.skipped && <>
        <table className="simple-sets"><thead><tr><th>组</th><th>重量 kg</th><th>次数</th><th>操作</th></tr></thead><tbody>
          {exercise.sets.map((set, setIndex) => <tr className={set.completed ? 'is-complete' : ''} key={set.id}><td>{setIndex + 1}</td><td><label><span className="sr-only">重量（公斤）</span><input className="set-input" type="text" inputMode="decimal" onPointerDown={event => { if (document.activeElement !== event.currentTarget) event.currentTarget.dataset.selectOnClick = "true"; }} onFocus={event => { setEditing({ setId: set.id, field: 'weight' }); event.currentTarget.select(); }} onClick={event => { if (event.currentTarget.dataset.selectOnClick) { const input = event.currentTarget; const value = input.value; requestAnimationFrame(() => { if (document.activeElement === input && input.value === value) input.setSelectionRange(0, value.length); delete input.dataset.selectOnClick; }); } }} onBlur={event => { if (!event.currentTarget.value.trim()) onInputChange(exerciseIndex, setIndex, "weight", "0"); }} value={draftInputs[set.id]?.weight ?? set.weight} onChange={event => onInputChange(exerciseIndex, setIndex, 'weight', event.target.value)} /></label></td><td><label><span className="sr-only">次数</span><input className="set-input reps-input" type="number" inputMode="numeric" onFocus={() => setEditing({ setId: set.id, field: 'reps' })} min="1" step="1" value={draftInputs[set.id]?.reps ?? set.reps} onChange={event => onInputChange(exerciseIndex, setIndex, 'reps', event.target.value)} /></label></td><td><div className="simple-set-actions"><button className={`set-done${set.completed ? ' done' : ''}`} aria-label={set.completed ? '撤销完成组' : '标记完成组'} onClick={() => onCompleteSet(exerciseIndex, setIndex)}>{set.completed ? '✓' : '○'}</button><button className="set-delete" aria-label={`删除第 ${setIndex + 1} 组`} onClick={() => onDeleteSet(exerciseIndex, setIndex)}><span className="trash-icon" aria-hidden="true" /></button></div></td></tr>)}
        </tbody></table>
        {editing && editingIndex >= 0 && <div className="set-edit-toolbar" aria-label="数字调整"><span>第 {editingIndex + 1} 组 · {editing.field === 'weight' ? '重量 kg' : '次数'}</span><button className="secondary-button" aria-label={editing.field === 'weight' ? '减少 2 公斤' : '减少 1 次'} onPointerDown={event => event.preventDefault()} onClick={() => onAdjustSet(exerciseIndex, editingIndex, editing.field, editing.field === 'weight' ? -2 : -1)}>−</button><button className="secondary-button" aria-label={editing.field === 'weight' ? '增加 2 公斤' : '增加 1 次'} onPointerDown={event => event.preventDefault()} onClick={() => onAdjustSet(exerciseIndex, editingIndex, editing.field, editing.field === 'weight' ? 2 : 1)}>＋</button><button className="ghost-button" aria-label="关闭数字调整" onClick={() => setEditing(undefined)}>完成</button></div>}
        <button className="primary-button full-button complete-next" disabled={nextSetIndex < 0} onClick={() => { setEditing(undefined); onCompleteSet(exerciseIndex, nextSetIndex); }}>{nextSetIndex < 0 ? '本动作已完成' : '完成下一组'}</button>
      </>}
      {exercise.skipped && <button className="secondary-button full-button" onClick={() => onSkipExercise(exerciseIndex)}>恢复动作</button>}
    </div></div>
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
