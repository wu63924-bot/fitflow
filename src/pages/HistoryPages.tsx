import { EditWorkoutRecordDialog } from '../components/EditWorkoutRecordDialog';
import { lazy, Suspense, useMemo, useState } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router';
import { dateKey } from '../utils/format';
import { calculateVolume, countCompletedSets } from '../utils/workout';
import { BackHeader, EmptyState, Modal, PageHeader, SectionTitle, useToast } from '../components/UI';
import { useAsyncData } from '../hooks/useAsyncData';
import { listBodyRecords } from '../repositories/bodyRecordRepository';
import { getDailySchedule, listDailySchedules } from '../repositories/dailyScheduleRepository';
import { listExercises } from '../repositories/exerciseRepository';
import { getMealsForDate } from '../repositories/mealRepository';
import { calculateMealItem, sumNutrition } from '../utils/nutrition';
import { listTrainingPlans } from '../repositories/trainingPlanRepository';
import { deleteWorkoutSession, listCompletedSessions, listWorkoutSessions } from '../repositories/workoutRepository';
import { removeScheduledActivity, startScheduledStrengthWorkout } from '../services/scheduleService';
import { DailyScheduleSheet } from './DailyScheduleSheet';
import { CopyWorkoutDialog } from '../components/CopyWorkoutDialog';
import type { DailySchedule, WorkoutSession } from '../types';

const weekdays = ['一', '二', '三', '四', '五', '六', '日'];
const TrendsPanel = lazy(() => import('./TrendsPanel').then(module => ({ default: module.TrendsPanel })));
interface CalendarMarker { label: string; state: string; description: string; }
interface CalendarCell { date: string; day: number; currentMonth: boolean; today: boolean; marker?: CalendarMarker; }

function monthCells(date: Date, markers: Map<string, CalendarMarker>): CalendarCell[] {
  const first = new Date(date.getFullYear(), date.getMonth(), 1);
  const startOffset = (first.getDay() + 6) % 7;
  const cells: CalendarCell[] = [];
  const today = dateKey(new Date());
  for (let index = 0; index < 42; index += 1) {
    const current = new Date(date.getFullYear(), date.getMonth(), 1 - startOffset + index);
    const key = dateKey(current);
    cells.push({ date: key, day: current.getDate(), currentMonth: current.getMonth() === date.getMonth(), today: key === today, marker: markers.get(key) });
  }
  return cells;
}

function sessionDate(session: WorkoutSession): string {
  return dateKey(new Date(session.endedAt ?? session.startedAt));
}

function markerForSchedule(schedule: DailySchedule, today: string): CalendarMarker | undefined {
  if (schedule.type === 'strength') {
    if (schedule.status === 'completed') return { label: '力✓', state: 'strength-complete', description: '力量训练已完成' };
    if (schedule.status === 'in_progress') return { label: '力中', state: 'strength-active', description: '力量训练进行中' };
    if (schedule.date < today) return { label: '未完', state: 'unfinished', description: '力量训练未完成' };
    return { label: '力量', state: 'strength', description: '计划力量训练' };
  }
  if (schedule.type === 'cardio') {
    if (schedule.status === 'completed') return { label: '氧✓', state: 'cardio-complete', description: '有氧训练已完成' };
    if (schedule.date < today) return { label: '未完', state: 'unfinished', description: '有氧训练未完成' };
    return { label: '有氧', state: 'cardio', description: '计划有氧训练' };
  }
  if (schedule.type === 'rest') return { label: '休息', state: 'rest', description: '休息日' };
  if (schedule.note) return { label: '备注', state: 'note', description: '有当天备注' };
  return undefined;
}

export function HistoryPage() {
  const navigate = useNavigate();
  const toast = useToast();
  const [search, setSearch] = useSearchParams();
  const view = search.get('view') === 'trends' ? 'trends' : 'calendar';
  const [copySource, setCopySource] = useState<WorkoutSession>();
  const [showCopyPicker, setShowCopyPicker] = useState(false);
  const [copySelection, setCopySelection] = useState('');
  const [month, setMonth] = useState(() => new Date(new Date().getFullYear(), new Date().getMonth(), 1));
  const { data, loading, refresh } = useAsyncData(async () => {
    const [sessions, bodyRecords, schedules] = await Promise.all([listCompletedSessions(), listBodyRecords(), listDailySchedules()]);
    return { sessions, bodyRecords, schedules };
  });
  const monthPrefix = `${month.getFullYear()}-${String(month.getMonth() + 1).padStart(2, '0')}`;
  const monthSessions = useMemo(() => data?.sessions.filter(session => sessionDate(session).startsWith(monthPrefix)) ?? [], [data?.sessions, monthPrefix]);

  async function onDeleteSession(session: WorkoutSession) {
    if (!window.confirm(`删除「${session.workoutDayName}」这条训练记录？此操作无法撤销。`)) return;
    try { await deleteWorkoutSession(session.id); await refresh(); toast('训练记录已删除'); }
    catch (error) { toast(error instanceof Error ? error.message : '删除训练记录失败'); }
  }

  if (loading || !data) return <div className="page"><div className="loading-state"><span className="spinner" />正在读取训练日历…</div></div>;
  const today = dateKey(new Date());
  const markers = new Map(data.schedules.map(schedule => [schedule.date, markerForSchedule(schedule, today)]).filter((entry): entry is [string, CalendarMarker] => Boolean(entry[1])));
  for (const session of data.sessions) {
    const key = sessionDate(session);
    if (!markers.has(key)) markers.set(key, { label: '训练', state: 'legacy', description: '力量训练记录' });
  }
  const cells = monthCells(month, markers);
  const copyableSessions = data.sessions.filter(session => sessionDate(session) < today);
  const completedCardio = data.schedules.filter(schedule => schedule.type === 'cardio' && schedule.status === 'completed' && schedule.date.startsWith(monthPrefix));
  const monthCount = monthSessions.length + completedCardio.length;
  return <div className="page">
    <PageHeader eyebrow="YOUR JOURNEY" title="日历" subtitle="点选日期安排今天或未来训练；过去完成的训练可复制到今天" />
    <div className="switcher" role="tablist">
      <button className={`switch-option${view === 'calendar' ? ' selected' : ''}`} onClick={() => setSearch({})}>日历</button>
      <button className={`switch-option${view === 'trends' ? ' selected' : ''}`} onClick={() => setSearch({ view: 'trends' })}>趋势</button>
    </div>
    {view === 'calendar' ? <>
      <section className="calendar-card card">
        <div className="calendar-heading"><button className="month-arrow" aria-label="上个月" onClick={() => setMonth(value => new Date(value.getFullYear(), value.getMonth() - 1, 1))}>‹</button><strong className="month-label">{month.getFullYear()}年{month.getMonth() + 1}月</strong><button className="month-arrow" aria-label="下个月" onClick={() => setMonth(value => new Date(value.getFullYear(), value.getMonth() + 1, 1))}>›</button></div>
        <div className="calendar-grid weekday-row">{weekdays.map(day => <span className="weekday" key={day}>{day}</span>)}</div>
        <div className="calendar-grid">{cells.map(cell => <button key={cell.date} aria-label={`${cell.date}${cell.marker ? `，${cell.marker.description}` : '，无安排'}`} className={`calendar-cell${cell.currentMonth ? '' : ' outside-month'}${cell.today ? ' today-cell' : ''}`} onClick={() => navigate(`/history/${cell.date}`)}>
          <span className="day-number">{cell.day}</span>{cell.marker && <span className={`calendar-mark mark-${cell.marker.state}`}>{cell.marker.label}</span>}
        </button>)}</div>
        <div className="calendar-legend"><span className="calendar-legend-item"><i className="calendar-mark mark-strength">力</i>计划力量</span><span className="calendar-legend-item"><i className="calendar-mark mark-cardio">有</i>计划有氧</span><span className="calendar-legend-item"><i className="calendar-mark mark-rest">休</i>休息</span><span className="calendar-legend-item"><i className="calendar-mark mark-strength-complete">✓</i>已完成</span></div>
      </section>
      <button className="secondary-button full-button" onClick={() => { setCopySelection(copyableSessions[0]?.id ?? ''); setShowCopyPicker(true); }}>从历史复制到今天</button>
      <section className="section">
        <SectionTitle title="本月训练" action={`${monthCount} 次`} />
        {monthCount ? <div className="card record-list">
          {monthSessions.map(session => <div className={`history-record list-item${sessionDate(session) < today ? ' history-record-with-copy' : ''}`} key={session.id}>
            <button className="history-record-open" onClick={() => navigate(`/history/${sessionDate(session)}`)}>
              <span><strong className="record-date">{new Intl.DateTimeFormat('zh-CN', { month: 'long', day: 'numeric' }).format(new Date(sessionDate(session)))}</strong><small className="record-title">{session.workoutDayName} · {Math.round(((session.endedAt ?? session.startedAt) - session.startedAt) / 60000)} min</small></span>
              <span className="record-sets">{countCompletedSets(session)} 组　›</span>
            </button>
            <div className="history-record-actions">
              {sessionDate(session) < today && <button className="history-copy" aria-label={`复制${sessionDate(session)}的${session.workoutDayName}到今天`} onClick={() => setCopySource(session)}>复制到今天</button>}
              <button className="history-delete" aria-label={`删除${session.workoutDayName}训练记录`} onClick={() => void onDeleteSession(session)}>删除</button>
            </div>
          </div>)}
          {completedCardio.map(schedule => <div className="history-record list-item" key={schedule.id}>
            <button className="history-record-open" onClick={() => navigate(`/history/${schedule.date}`)}><span><strong className="record-date">{new Intl.DateTimeFormat('zh-CN', { month: 'long', day: 'numeric' }).format(new Date(`${schedule.date}T12:00:00`))}</strong><small className="record-title">{schedule.cardioData?.activity ?? '有氧'} · {schedule.cardioData?.actualDurationMinutes ?? 0} min</small></span><span className="record-sets">有氧　›</span></button>
          </div>)}
        </div> : <EmptyState title="这个月还没有训练记录">点日期安排训练。完成一场训练后，打开那天的记录即可复制到今天。</EmptyState>}
      </section>
    </> : <Suspense fallback={<div className="loading-state">正在读取趋势…</div>}><TrendsPanel /></Suspense>}
    {showCopyPicker && <Modal title="选择历史训练" onClose={() => setShowCopyPicker(false)}>
      {copyableSessions.length ? <>
        <label className="field-label">历史训练记录<select className="text-input" value={copySelection} onChange={event => setCopySelection(event.target.value)}>
          {copyableSessions.map(session => <option key={session.id} value={session.id}>{sessionDate(session)} · {session.workoutDayName} · {session.exercises.length} 个动作</option>)}
        </select></label>
        <p className="muted small">可选择其他月份的已完成力量训练，复制到今天后再开始训练。</p>
        <button className="primary-button full-button" disabled={!copySelection} onClick={() => { setCopySource(copyableSessions.find(session => session.id === copySelection)); setShowCopyPicker(false); }}>复制选中训练</button>
      </> : <EmptyState title="还没有可复制的历史训练">完成一次力量训练后，可在之后的日期将它复制到今天。</EmptyState>}
    </Modal>}
    {copySource && <CopyWorkoutDialog session={copySource} onClose={() => { setCopySource(undefined); void refresh(); }} />}
  </div>;
}

export function DayDetailPage() {
  const { date = dateKey(new Date()) } = useParams();
  const navigate = useNavigate();
  const toast = useToast();
  const [sheetView, setSheetView] = useState<'menu' | 'note' | 'cardio-log'>();
  const [copySource, setCopySource] = useState<WorkoutSession>();
  const [editingRecord, setEditingRecord] = useState<WorkoutSession>();
  const parsedDate = new Date(`${date}T12:00:00`);
  const validDate = !Number.isNaN(parsedDate.getTime()) && dateKey(parsedDate) === date;
  const { data, loading, refresh } = useAsyncData(async () => {
    const [sessions, meals, bodyRecords, schedule, plans, exercises] = await Promise.all([
      listWorkoutSessions(), getMealsForDate(date), listBodyRecords(), getDailySchedule(date), listTrainingPlans(), listExercises()
    ]);
    return { sessions: sessions.filter(session => sessionDate(session) === date), meals, bodyRecord: bodyRecords.find(record => record.date === date), schedule, plans, exercises };
  }, [date]);

  async function onDeleteSession(session: WorkoutSession) {
    if (!window.confirm(`删除「${session.workoutDayName}」这条训练记录？此操作无法撤销。`)) return;
    try { await deleteWorkoutSession(session.id); await refresh(); toast('训练记录已删除'); }
    catch (error) { toast(error instanceof Error ? error.message : '删除训练记录失败'); }
  }

  async function onDeleteSchedule() {
    if (!window.confirm('删除当天安排？备注会保留。')) return;
    try { await removeScheduledActivity(date); await refresh(); toast('当天安排已删除'); }
    catch (error) { toast(error instanceof Error ? error.message : '删除安排失败'); }
  }

  async function startTodayWorkout() {
    try {
      const session = await startScheduledStrengthWorkout(dateKey(new Date()));
      navigate(`/workout/session/${session.id}`);
    } catch (error) { toast(error instanceof Error ? error.message : '无法开始训练'); }
  }

  if (!validDate) return <div className="page"><BackHeader title="日期无效" /><EmptyState title="无法读取这一天的记录" /></div>;
  if (loading || !data) return <div className="page"><div className="loading-state"><span className="spinner" />正在读取这一天…</div></div>;
  const today = dateKey(new Date());
  const isPast = date < today;
  const isToday = date === today;
  const hasWorkoutRecord = data.sessions.length > 0;
  const editable = !isPast && !hasWorkoutRecord && (!data.schedule || data.schedule.status === 'planned');
  const canOpenMenu = editable || (!data.schedule?.type && !hasWorkoutRecord);
  const mealSummary = sumNutrition(data.meals);

  return <div className="page">
    <BackHeader title={`${parsedDate.getMonth() + 1}月${parsedDate.getDate()}日`} subtitle={new Intl.DateTimeFormat('zh-CN', { weekday: 'long' }).format(parsedDate)} />
    {data.schedule?.type && <article className="daily-schedule-card card">
      <div className="row-between"><div><span className="eyebrow">当天安排</span><h2 className="section-title">{data.schedule.type === 'strength' ? data.schedule.workoutTemplate?.workoutDayName ?? '力量训练' : data.schedule.type === 'cardio' ? `有氧 · ${data.schedule.cardioData?.activity ?? '其他'}` : '休息日'}</h2></div>
        <span className={`tag${data.schedule.status === 'completed' ? ' schedule-complete-tag' : ''}`}>{data.schedule.status === 'completed' ? '已完成' : data.schedule.status === 'in_progress' ? '进行中' : isPast ? '未完成' : '已安排'}</span></div>
      {data.schedule.type === 'strength' && <p className="summary-meta">{data.schedule.workoutTemplate?.exercises.length ?? 0} 个动作 · {data.schedule.workoutTemplate?.exercises.reduce((total, exercise) => total + exercise.sets.length, 0) ?? 0} 组{data.schedule.workoutTemplate?.planName ? ` · ${data.schedule.workoutTemplate.planName}` : ''}</p>}
      {data.schedule.type === 'strength' && data.schedule.status === 'planned' && !isPast && !isToday && <p className="summary-meta">训练当天才可开始</p>}
      {data.schedule.type === 'cardio' && <p className="summary-meta">{data.schedule.status === 'completed' ? `${data.schedule.cardioData?.actualDurationMinutes ?? 0} 分钟${data.schedule.cardioData?.distanceKm !== undefined ? ` · ${data.schedule.cardioData.distanceKm} km` : ''}` : data.schedule.cardioData?.plannedDurationMinutes ? `计划 ${data.schedule.cardioData.plannedDurationMinutes} 分钟` : '完成后手动记录时长和可选距离'}</p>}
      {data.schedule.type === 'strength' && data.schedule.workoutTemplate?.exercises.map((exercise, index) => <div className="scheduled-exercise-row" key={`${exercise.exerciseId}-${index}`}><strong>{index + 1}. {exercise.name}</strong><span>{exercise.sets.length} 组 · {exercise.sets.map(set => `${set.weight}×${set.reps}`).join(' / ')} · 休息 {exercise.restSeconds}s</span></div>)}
      {data.schedule.type === 'cardio' && data.schedule.cardioData?.note && <p className="schedule-cardio-note">{data.schedule.cardioData.note}</p>}
      <div className="daily-schedule-actions">
        {data.schedule.type === 'strength' && data.schedule.status === 'planned' && isToday && <button className="primary-button" onClick={() => void startTodayWorkout()}>开始训练</button>}
        {data.schedule.type === 'strength' && data.schedule.status === 'in_progress' && data.schedule.workoutSessionId && <button className="primary-button" onClick={() => navigate(`/workout/session/${data.schedule?.workoutSessionId}`)}>继续训练</button>}
        {data.schedule.type === 'cardio' && data.schedule.status === 'planned' && isToday && <button className="primary-button" onClick={() => setSheetView('cardio-log')}>记录有氧完成</button>}
        {data.schedule.status === 'planned' && !isPast && <button className="secondary-button" onClick={() => setSheetView('menu')}>编辑安排</button>}
        {data.schedule.status === 'planned' && <button className="danger-button" onClick={() => void onDeleteSchedule()}>{isPast ? '删除未完成安排' : '删除安排'}</button>}
      </div>
    </article>}

    {data.sessions.map(session => <article className="session-record card" key={session.id}>
      <div className="row-between"><h2 className="section-title">{session.workoutDayName}</h2><span className="tag">{session.status === 'in_progress' ? '进行中' : `${Math.max(0, Math.round(((session.endedAt ?? session.startedAt) - session.startedAt) / 60000))} min`}</span></div>
      <div className="day-metrics"><div><strong>{countCompletedSets(session)}</strong><span>完成组数</span></div><div><strong>{Math.round(calculateVolume(session))}</strong><span>训练容量 kg</span></div></div>
      {session.exercises.map(exercise => <div className="history-exercise" key={exercise.id}>
        <div className="row-between"><strong>{exercise.name}</strong>{exercise.skipped && <span className="muted small">已跳过</span>}</div>
        {exercise.sets.some(set => set.completed) ? <div className="detail-sets">{exercise.sets.filter(set => set.completed).map((set, index) => <span className="detail-set" key={set.id}>{index + 1}. {set.weight}kg × {set.reps}</span>)}</div> : !exercise.skipped && <span className="muted small">没有完成组</span>}
      </div>)}
      <div className="history-actions">
        {session.status === 'completed' && <button className="text-button" onClick={() => navigate(`/workout/report/${session.id}`)}>查看训练报告</button>}
        {session.status === 'completed' && isToday && <button className="secondary-button" onClick={() => setEditingRecord(session)}>修改今日训练记录</button>}
        {session.status === 'completed' && isPast && <button className="secondary-button" onClick={() => setCopySource(session)}>复制到今天</button>}
        <button className="history-delete" onClick={() => void onDeleteSession(session)}>删除记录</button>
      </div>
    </article>)}

    {!data.schedule?.type && !hasWorkoutRecord && <EmptyState title={isToday ? '今天还没有安排' : isPast ? '当天还没有安排' : '这一天还没有安排'}>训练日程会保存在本机。</EmptyState>}
    {canOpenMenu && <button className="primary-button full-button" onClick={() => setSheetView('menu')}>{data.schedule?.type ? '更改当天安排' : `＋ 安排${isToday ? '今天' : '这一天'}`}</button>}
    {(!isPast || !data.schedule?.type || data.schedule.status !== 'planned') && <button className="text-button full-button" onClick={() => setSheetView('note')}>{data.schedule?.note ? '编辑当天备注' : '添加当天备注'}</button>}
    {data.schedule?.note && <section className="card day-note-card"><strong>当天备注</strong><p>{data.schedule.note}</p></section>}
    <section className="section">
      <div className="section-head"><h2 className="section-title">饮食</h2><button className="section-action" onClick={() => navigate(`/nutrition?date=${date}`)}>查看当日饮食 ›</button></div>
      <div className="card nutrition-details">
        <div className="nutrition-detail"><span>总热量</span><strong>{Math.round(mealSummary.calories)} kcal</strong></div>
        {(['protein', 'carbs', 'fat'] as const).map((key, index) => <div className="nutrition-detail" key={key}><span>{['蛋白质', '碳水', '脂肪'][index]}</span><strong>{Number(mealSummary[key].toFixed(1))}g</strong></div>)}
      </div>
      {data.meals.map(meal => meal.items.length > 0 && <div className="card history-meal" key={meal.id}><strong>{meal.title}</strong><div>{meal.items.map(item => <span className="history-meal-item" key={item.id}>{item.foodNameSnapshot} · {item.amount}{item.unit} · {Math.round(calculateMealItem(item).calories)} kcal</span>)}</div></div>)}
    </section>
    <section className="section">
      <SectionTitle title="身体数据" />
      {data.bodyRecord ? <div className="card body-day-record"><span>体重</span><strong>{data.bodyRecord.weight} kg</strong><span>身高 {data.bodyRecord.height} cm</span></div> : <EmptyState title="当天没有身体数据" />}
    </section>

    {editingRecord && <EditWorkoutRecordDialog session={editingRecord} onClose={() => setEditingRecord(undefined)} onSaved={() => { setEditingRecord(undefined); void refresh(); }} />}
    {sheetView && <DailyScheduleSheet date={date} schedule={data.schedule} plans={data.plans} exercises={data.exercises} allowTraining={!isPast && !hasWorkoutRecord} initialView={sheetView} onClose={() => setSheetView(undefined)} onSaved={() => void refresh()} />}
    {copySource && <CopyWorkoutDialog session={copySource} onClose={() => { setCopySource(undefined); void refresh(); }} />}
  </div>;
}
