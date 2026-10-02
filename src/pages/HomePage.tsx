import { useNavigate } from 'react-router';
import { mockUser } from '../data/mock';
import { dateKey } from '../utils/format';
import { progressPercent, sumNutrition } from '../utils/nutrition';
import { calculateVolume, countCompletedSets, getTodayWorkoutDay } from '../utils/workout';
import { listMealsForDate } from '../repositories/mealRepository';
import { getNutritionTarget, getSettings } from '../repositories/settingsRepository';
import { listBodyRecords } from '../repositories/bodyRecordRepository';
import { listTrainingPlans } from '../repositories/trainingPlanRepository';
import { getDailySchedule } from '../repositories/dailyScheduleRepository';
import { getInProgressSession, listWorkoutSessions } from '../repositories/workoutRepository';
import { startScheduledStrengthWorkout } from '../services/scheduleService';
import { useAsyncData } from '../hooks/useAsyncData';
import { EmptyState, ProgressRow, SectionTitle, todayLabel, useToast } from '../components/UI';

export function HomePage() {
  const navigate = useNavigate();
  const toast = useToast();
  const { data, loading } = useAsyncData(async () => {
    const today = dateKey(new Date());
    const [plans, sessions, meals, target, settings, bodyRecords, schedule] = await Promise.all([
      listTrainingPlans(), listWorkoutSessions(), listMealsForDate(today), getNutritionTarget(), getSettings(), listBodyRecords(), getDailySchedule(today)
    ]);
    const plan = plans.find(item => item.id === settings.activePlanId);
    const day = getTodayWorkoutDay(plan);
    const inProgress = await getInProgressSession();
    const latest = sessions.find(session => session.status === 'completed' && session.endedAt && dateKey(new Date(session.endedAt)) === today);
    const displayedSession = inProgress ?? latest;
    const completedSets = displayedSession ? countCompletedSets(displayedSession) : 0;
    const nutrition = sumNutrition(meals);
    const record = bodyRecords[0];
    return {
      today, plan, day, schedule, inProgress, latest, completedSets, nutrition, target,
      weight: record?.weight, user: settings.user ?? mockUser,
      mealCount: meals.filter(meal => meal.items.length > 0).length,
      duration: displayedSession ? Math.round(((displayedSession.endedAt ?? Date.now()) - displayedSession.startedAt) / 60000) : 0,
      volume: displayedSession ? Math.round(calculateVolume(displayedSession)) : 0,
      plannedSets: schedule?.workoutTemplate?.exercises.reduce((total, item) => total + item.sets.length, 0) ?? 0,
      plannedMinutes: schedule?.workoutTemplate?.exercises.reduce((total, item) => total + item.sets.length * 2 + item.restSeconds / 60, 0) ?? 0
    };
  });
  if (loading || !data) return <div className="page"><div className="loading-state"><span className="spinner" />正在读取今日数据…</div></div>;
  const pageData = data;

  const schedule = pageData.schedule;
  const trainingStatus = pageData.inProgress ? '进行中'
    : schedule?.status === 'completed' || pageData.latest ? '已完成'
      : schedule?.type === 'rest' ? '今日休息'
        : schedule?.type ? '已安排' : '待安排';
  const workoutTitle = pageData.inProgress?.workoutDayName ?? schedule?.workoutTemplate?.workoutDayName
    ?? (schedule?.type === 'cardio' ? `今日有氧 · ${schedule.cardioData?.activity ?? '有氧'}` : schedule?.type === 'rest' ? '今日休息' : pageData.latest?.workoutDayName ?? '今日训练待安排');
  const workoutButton = pageData.inProgress ? '继续训练'
    : schedule?.type === 'strength' ? schedule.status === 'completed' ? '查看训练记录' : '开始训练'
      : schedule?.type === 'cardio' ? schedule.status === 'completed' ? '查看有氧记录' : '记录有氧'
        : schedule?.type === 'rest' ? '查看当天安排'
          : pageData.latest ? '查看训练记录' : '安排今天';

  async function onStartWorkout() {
    if (pageData.inProgress) { navigate(`/workout/session/${pageData.inProgress.id}`); return; }
    if (schedule?.type === 'strength' && schedule.status === 'planned') {
      try {
        const session = await startScheduledStrengthWorkout(pageData.today);
        navigate(`/workout/session/${session.id}`);
      } catch (error) { toast(error instanceof Error ? error.message : '无法开始训练'); }
      return;
    }
    navigate(`/history/${pageData.today}`);
  }

  return <div className="page home-page">
    <div className="home-heading">
      <div><div className="brand">FitFlow</div><div className="home-date">{todayLabel()}</div></div>
      <div className="avatar" aria-label={data.user.name}>{data.user.avatarText}</div>
    </div>

    <section className="hero-card card">
      <div className="row-between"><span className="hero-kicker">TODAY'S WORKOUT</span><span className="tag">今日计划</span></div>
      <h2 className="hero-title">{workoutTitle}</h2>
      <p className="hero-meta">
        {data.inProgress ? `你有一场未完成训练 · 已完成 ${data.completedSets} 组`
          : schedule?.type === 'strength' && schedule.status === 'completed' ? `训练 ${data.duration} min · ${data.completedSets} 组已完成`
            : schedule?.type === 'strength' ? `${schedule.workoutTemplate?.exercises.length ?? 0} 个动作 · ${data.plannedSets} 组 · 预计 ${data.plannedMinutes} min`
              : schedule?.type === 'cardio' ? schedule.status === 'completed' ? `${schedule.cardioData?.actualDurationMinutes ?? 0} min${schedule.cardioData?.distanceKm !== undefined ? ` · ${schedule.cardioData.distanceKm} km` : ''}` : `计划 ${schedule.cardioData?.plannedDurationMinutes ? `${schedule.cardioData.plannedDurationMinutes} min` : '有氧训练'}`
                : schedule?.type === 'rest' ? '今天按安排休息，训练计划不会改变'
                  : data.latest ? `训练 ${data.duration} min · ${data.completedSets} 组已完成` : '前往日历安排力量、有氧或休息'}
      </p>
      <button className="primary-button hero-button" onClick={() => void onStartWorkout()}>{workoutButton}</button>
    </section>

    <section className="section">
      <SectionTitle title="今日营养" action="记一笔" onAction={() => navigate('/nutrition/add/snack')} />
      <div className="card nutrition-card">
        <div className="calorie-row"><strong className="value">{data.nutrition.calories}</strong><span className="calorie-target">/ {data.target.calories} kcal</span></div>
        <div className="progress-track calorie-progress"><div className="progress-fill" style={{ width: `${progressPercent(data.nutrition.calories, data.target.calories)}%` }} /></div>
        <ProgressRow label="蛋白质" value={data.nutrition.protein} target={data.target.protein} unit="g" />
        <ProgressRow label="碳水" value={data.nutrition.carbs} target={data.target.carbs} unit="g" />
        <ProgressRow label="脂肪" value={data.nutrition.fat} target={data.target.fat} unit="g" />
      </div>
    </section>

    <section className="section">
      <SectionTitle title="今日状态" />
      <div className="status-grid">
        <div className="card status-card"><span className="status-label">体重</span><strong className={`status-value${data.weight === undefined ? ' status-text' : ''}`}>{data.weight === undefined ? '暂无记录' : <>{data.weight}<small>kg</small></>}</strong><span className="status-note">最近记录</span></div>
        <div className="card status-card"><span className="status-label">训练</span><strong className="status-value status-text">{trainingStatus}</strong><span className="status-note">{workoutTitle}</span></div>
        <div className="card status-card"><span className="status-label">饮食</span><strong className="status-value status-text">{data.mealCount} 餐</strong><span className="status-note">今天已记录</span></div>
      </div>
    </section>
    {!data.plan && !schedule && <EmptyState title="从日历安排今天">可以从训练计划选择，也可以创建一次性训练。</EmptyState>}
    {data.volume > 0 && <p className="home-volume">今日训练容量 {data.volume.toLocaleString()} kg</p>}
  </div>;
}
