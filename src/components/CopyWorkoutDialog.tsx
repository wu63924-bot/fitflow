import { useState } from 'react';
import { useNavigate } from 'react-router';
import { Modal, useToast } from './UI';
import { dateKey } from '../utils/format';
import { getDailySchedule } from '../repositories/dailyScheduleRepository';
import { copyWorkoutToDate, DailyScheduleConflictError, startScheduledStrengthWorkout } from '../services/scheduleService';
import type { WorkoutSession } from '../types';

export function CopyWorkoutDialog({ session, onClose }: { session: WorkoutSession; onClose: () => void }) {
  const navigate = useNavigate();
  const toast = useToast();
  const [copied, setCopied] = useState(false);
  const [busy, setBusy] = useState(false);
  const sourceDate = dateKey(new Date(session.endedAt ?? session.startedAt));
  const setCount = session.exercises.reduce((total, exercise) => total + exercise.sets.length, 0);

  async function copyToToday() {
    setBusy(true);
    try {
      const today = dateKey(new Date());
      if (sourceDate >= today) throw new Error('请选择过去已完成的训练记录');
      try { await copyWorkoutToDate(session.id, today); }
      catch (error) {
        if (!(error instanceof DailyScheduleConflictError) || error.kind !== 'existing') throw error;
        const current = await getDailySchedule(today);
        const name = current?.type === 'strength' ? current.workoutTemplate?.workoutDayName : current?.type === 'cardio' ? '有氧训练' : current?.type === 'rest' ? '休息日' : '其他安排';
        if (!window.confirm(`今天已经有训练安排：${name ?? '力量训练'}。\n替换今天的安排？`)) return;
        await copyWorkoutToDate(session.id, today, true);
      }
      setCopied(true);
    } catch (error) { toast(error instanceof Error ? error.message : '复制训练失败'); }
    finally { setBusy(false); }
  }

  async function startWorkout() {
    setBusy(true);
    try {
      const workout = await startScheduledStrengthWorkout(dateKey(new Date()));
      navigate(`/workout/session/${workout.id}`);
    } catch (error) { toast(error instanceof Error ? error.message : '无法开始训练'); }
    finally { setBusy(false); }
  }

  return <Modal title={copied ? '已复制到今天' : '复制训练到今天'} onClose={() => { if (!busy) onClose(); }}>
    {copied ? <>
      <p className="muted">训练动作与参数已保存为今天的待训练安排。开始后才创建新记录，所有组均未完成。</p>
      <button className="primary-button full-button" disabled={busy} onClick={() => void startWorkout()}>{busy ? '处理中…' : '开始今天的训练'}</button>
      <button className="secondary-button full-button" disabled={busy} onClick={onClose}>稍后训练</button>
    </> : <>
      <p><strong>{sourceDate} · {session.workoutDayName}</strong></p>
      <p className="muted">复制 {session.exercises.length} 个动作、{setCount} 组及其重量、次数和休息时间到 {dateKey(new Date())}。来源记录会保留。</p>
      <button className="primary-button full-button" disabled={busy} onClick={() => void copyToToday()}>{busy ? '复制中…' : '确认复制到今天'}</button>
      <button className="secondary-button full-button" disabled={busy} onClick={onClose}>取消</button>
    </>}
  </Modal>;
}
