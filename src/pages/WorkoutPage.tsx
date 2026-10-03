import { useState } from 'react';
import { useNavigate } from 'react-router';
import { dateKey } from '../utils/format';
import { getTodayWorkoutDay } from '../utils/workout';
import { useAsyncData } from '../hooks/useAsyncData';
import { listExercises } from '../repositories/exerciseRepository';
import { getDailySchedule } from '../repositories/dailyScheduleRepository';
import { getSettings } from '../repositories/settingsRepository';
import { deleteTrainingPlan, duplicateTrainingPlan, listTrainingPlans, setActiveTrainingPlan } from '../repositories/trainingPlanRepository';
import { getInProgressSession, listWorkoutSessions } from '../repositories/workoutRepository';
import { estimateWorkoutMinutes, startWorkout } from '../services/workoutService';
import { startScheduledStrengthWorkout } from '../services/scheduleService';
import { EmptyState, PageHeader, SectionTitle, useToast } from '../components/UI';
import type { TrainingPlan } from '../types';

type ViewTab = 'today' | 'plan';
export function WorkoutPage() {
  const navigate = useNavigate();
  const toast = useToast();
  const [activeTab, setActiveTab] = useState<ViewTab>('today');
  const [selectedDayId, setSelectedDayId] = useState('');
  const { data, loading, refresh } = useAsyncData(async () => {
    const today = dateKey(new Date());
    const [plans, settings, sessions, exercises, schedule] = await Promise.all([listTrainingPlans(), getSettings(), listWorkoutSessions(), listExercises(), getDailySchedule(today)]);
    const plan = plans.find(item => item.id === settings.activePlanId);
    const todayDay = getTodayWorkoutDay(plan);
    const selectedDay = plan?.days.find(day => day.id === selectedDayId) ?? todayDay;
    return { plans, plan, todayDay, selectedDay, settings, sessions, exercises, schedule, inProgress: await getInProgressSession() };
  }, [selectedDayId]);

  if (loading || !data) return <div className="page"><div className="loading-state"><span className="spinner" />正在读取训练计划…</div></div>;
  const pageData = data;
  const day = pageData.selectedDay;
  const completedToday = pageData.sessions.some(session => session.status === 'completed' && session.endedAt && new Date(session.endedAt).toDateString() === new Date().toDateString());

  async function beginWorkout() {
    if (pageData.inProgress) { navigate(`/workout/session/${pageData.inProgress.id}`); return; }
    if (pageData.schedule?.type === 'cardio' || pageData.schedule?.type === 'rest' || pageData.schedule?.status === 'completed') { navigate(`/history/${dateKey(new Date())}`); return; }
    if (pageData.schedule?.type === 'strength') {
      try {
        const session = await startScheduledStrengthWorkout(dateKey(new Date()));
        navigate(`/workout/session/${session.id}`);
      } catch (error) { toast(error instanceof Error ? error.message : '无法开始训练'); }
      return;
    }
    if (!pageData.plan) { navigate('/workout/plans/new'); return; }
    if (!day || day.isRestDay) { toast('选择一个训练日开始'); return; }
    try {
      const session = await startWorkout(pageData.plan.id, day.id);
      navigate(`/workout/session/${session.id}`);
    } catch (error) { toast(error instanceof Error ? error.message : '无法开始训练'); }
  }

  async function onDelete(plan: TrainingPlan) {
    if (!window.confirm(`删除「${plan.name}」及其训练日安排？历史训练记录会保留。`)) return;
    await deleteTrainingPlan(plan.id);
    if (pageData.plan?.id === plan.id) setSelectedDayId('');
    await refresh();
    toast('计划已删除');
  }

  async function onDuplicate(plan: TrainingPlan) {
    await duplicateTrainingPlan(plan);
    await refresh();
    toast('计划已复制');
  }

  async function onSetActive(plan: TrainingPlan) {
    await setActiveTrainingPlan(plan.id);
    setSelectedDayId('');
    await refresh();
    toast('已切换当前计划');
  }

  return <div className="page">
    <PageHeader eyebrow="FITNESS" title="训练" subtitle="把每一次努力，都变成进步" />
    <div className="switcher" role="tablist">
      <button className={`switch-option${activeTab === 'today' ? ' selected' : ''}`} onClick={() => setActiveTab('today')}>今日训练</button>
      <button className={`switch-option${activeTab === 'plan' ? ' selected' : ''}`} onClick={() => setActiveTab('plan')}>训练计划</button>
    </div>

    {activeTab === 'today' ? <>
      <section className="workout-summary card">
        <div className="row-between"><span className="tag">{data.plan ? '训练计划' : '开始训练'}</span><span className="muted small">{day?.weekday}</span></div>
        <h2 className="summary-title">{data.schedule?.type === 'strength' ? data.schedule.workoutTemplate?.workoutDayName ?? '力量训练' : data.schedule?.type === 'cardio' ? `今日有氧 · ${data.schedule.cardioData?.activity ?? '有氧'}` : data.schedule?.type === 'rest' ? '今日休息' : day?.isRestDay ? '今日休息' : day?.name ?? '还没有训练计划'}</h2>
        <p className="summary-meta">{data.schedule?.type === 'strength' ? `${data.schedule.workoutTemplate?.exercises.length ?? 0} 个动作 · ${data.schedule.workoutTemplate?.exercises.reduce((total, item) => total + item.sets.length, 0) ?? 0} 组 · 今日安排` : data.schedule?.type === 'cardio' ? `${data.schedule.cardioData?.plannedDurationMinutes ? `计划 ${data.schedule.cardioData.plannedDurationMinutes} min` : '完成后记录时长和距离'}` : data.schedule?.type === 'rest' ? '今天按安排休息' : day?.isRestDay ? '今天按计划休息，也可以调整日历安排' : day ? `${day.exercises.length} 个动作 · ${day.exercises.reduce((total, item) => total + item.sets, 0)} 组 · 预计 ${estimateWorkoutMinutes(day)} min` : '创建训练计划，安排每周训练'}</p>
        <button className="primary-button" onClick={() => void beginWorkout()}>{data.inProgress ? '继续训练' : data.schedule?.type === 'cardio' ? data.schedule.status === 'completed' ? '查看有氧记录' : '记录有氧' : data.schedule?.type === 'rest' ? '查看当天安排' : data.schedule?.status === 'completed' ? '查看训练记录' : completedToday && day?.id === data.todayDay?.id ? '再次训练' : data.plan || data.schedule?.type === 'strength' ? '开始训练' : '创建训练计划'}</button>
        {completedToday && !data.inProgress && day && !day.isRestDay && <button className="text-button" onClick={() => navigate(`/history/${dateKey(new Date())}`)}>查看今日训练记录</button>}
      </section>

      {data.plan && !data.schedule?.type && <section className="section">
        <SectionTitle title={day?.isRestDay || day?.id !== data.todayDay?.id ? '选择训练日' : '本周安排'} />
        <div className="day-selector">
          {data.plan.days.slice().sort((a, b) => a.order - b.order).map(item => <button key={item.id} className={`day-chip${item.id === day?.id ? ' day-chip-active' : ''}`} onClick={() => setSelectedDayId(item.id)}>
            <span>{item.weekday}</span><strong>{item.isRestDay ? '休息' : item.name}</strong>
          </button>)}
        </div>
      </section>}

      {data.schedule?.type === 'strength' && data.schedule.workoutTemplate?.exercises.length ? <section className="section">
        <SectionTitle title="今日安排的动作" />
        {data.schedule.workoutTemplate.exercises.map((exercise, index) => <div className="exercise-card card" key={`${exercise.exerciseId}-${index}`}>
          <span className="exercise-index">{index + 1}</span><div className="exercise-info"><strong className="exercise-name">{exercise.name}</strong><span className="exercise-meta">{exercise.sets.length} 组 · {exercise.sets.map(set => `${set.weight}kg × ${set.reps}`).join(' / ')} · 休息 {exercise.restSeconds}s</span></div>
        </div>)}
      </section> : !data.schedule?.type && day?.exercises.length ? <section className="section">
        <SectionTitle title="动作安排" action="编辑训练日" onAction={() => navigate(`/workout/plans/${data.plan?.id}?day=${day.id}`)} />
        {day.exercises.slice().sort((a, b) => a.order - b.order).map((planned, index) => {
          const exercise = data.exercises.find(item => item.id === planned.exerciseId);
          return <div className="exercise-card card" key={planned.id}>
            <span className="exercise-index">{index + 1}</span><div className="exercise-info"><strong className="exercise-name">{exercise?.name ?? '动作'}</strong><span className="exercise-meta">{planned.sets} 组 × {planned.repsMin === planned.repsMax ? planned.repsMin : `${planned.repsMin}-${planned.repsMax}`} 次 · {planned.referenceWeight ?? 0}kg · 休息 {planned.restSeconds}s</span></div>
          </div>;
        })}
      </section> : !data.schedule?.type && day && !day.isRestDay ? <div className="section"><EmptyState title="这个训练日还没有动作">编辑训练日并从动作库添加动作。</EmptyState><button className="secondary-button full-button" onClick={() => navigate(`/workout/plans/${data.plan?.id}?day=${day.id}`)}>编辑训练日</button></div> : null}
    </> : <>
      {data.plan && <section className="plan-intro card">
        <div className="row-between"><span className="tag">当前计划</span><span className="muted small">{data.plan.days.length} 天周期</span></div>
        <h2 className="summary-title">{data.plan.name}</h2><p className="summary-meta">编辑训练日名称、目标肌群和动作安排</p>
        <button className="secondary-button" onClick={() => navigate(`/workout/plans/${data.plan?.id}`)}>编辑当前计划</button>
      </section>}
      <section className="section">
        <SectionTitle title="我的计划" action="＋ 新建计划" onAction={() => navigate('/workout/plans/new')} />
        {!data.plans.length && <EmptyState title="还没有训练计划">创建计划，安排自己的训练日。</EmptyState>}
        {data.plans.map(plan => <article className="plan-card card" key={plan.id}>
          <div className="row-between"><div><strong className="plan-name">{plan.name}</strong><span className="plan-focus">{plan.days.filter(item => !item.isRestDay).length} 个训练日</span></div>{plan.id === data.settings.activePlanId && <span className="tag">当前使用</span>}</div>
          <div className="plan-actions">
            {plan.id !== data.settings.activePlanId && <button className="secondary-button" onClick={() => void onSetActive(plan)}>设为当前</button>}
            <button className="ghost-button" onClick={() => navigate(`/workout/plans/${plan.id}`)}>编辑</button>
            <button className="ghost-button" onClick={() => void onDuplicate(plan)}>复制</button>
            <button className="danger-button" onClick={() => void onDelete(plan)}>删除</button>
          </div>
        </article>)}
      </section>
    </>}
  </div>;
}
