import { liveQuery } from 'dexie';
import { useEffect, useState } from 'react';
import { Link } from 'react-router';
import { getInProgressSession, mutateWorkoutSession } from '../repositories/workoutRepository';
import { getSettings } from '../repositories/settingsRepository';
import { notificationPermission, notifyRestFinished, requestRestNotification } from '../services/restNotification';
import { remainingSeconds } from '../utils/timer';
import { formatClock, formatDuration } from '../utils/format';
import { useToast } from './UI';
import type { WorkoutSession } from '../types';

export function ActiveWorkout({ inSession }: { inSession: boolean }) {
  const [session, setSession] = useState<WorkoutSession>();
  const [now, setNow] = useState(Date.now());
  const toast = useToast();
  useEffect(() => {
    const subscription = liveQuery(getInProgressSession).subscribe({ next: setSession, error: () => setSession(undefined) });
    const tick = () => setNow(Date.now());
    const interval = window.setInterval(tick, 1000);
    document.addEventListener('visibilitychange', tick);
    window.addEventListener('pageshow', tick);
    return () => { subscription.unsubscribe(); window.clearInterval(interval); document.removeEventListener('visibilitychange', tick); window.removeEventListener('pageshow', tick); };
  }, []);
  useEffect(() => {
    const timer = session?.restTimer;
    if (!session || !timer || timer.expiredNotified || remainingSeconds(timer, now) > 0) return;
    let claimed = false;
    void mutateWorkoutSession(session.id, current => {
      if (current.status !== 'in_progress' || !current.restTimer || current.restTimer.restEndsAt !== timer.restEndsAt || current.restTimer.expiredNotified || remainingSeconds(current.restTimer, Date.now()) > 0) return;
      current.restTimer.expiredNotified = true;
      claimed = true;
    }).then(async () => {
      if (!claimed) return;
      if (document.visibilityState === 'visible') {
        toast('休息结束，可以开始下一组了');
        const settings = await getSettings();
        if (settings.trainingSettings.vibrationEnabled && typeof navigator.vibrate === 'function') navigator.vibrate(100);
      } else await notifyRestFinished(`rest-${session.id}-${timer.restEndsAt}`);
    }).catch(() => { /* A storage failure must not stop the timestamp timer. */ });
  }, [session, now, toast]);
  if (!session) return null;
  const remaining = session.restTimer ? remainingSeconds(session.restTimer, now) : 0;
  return <>
    {!inSession && <aside className="mini-workout card" aria-label="进行中的训练">
      <div><span className="eyebrow">训练中 · {formatDuration((now - session.startedAt) / 1000)}</span><strong>{session.workoutDayName}</strong>{session.restTimer && <span className="small">{remaining ? `休息 ${formatClock(remaining)}` : '休息结束'}</span>}</div>
      <Link className="primary-button" to={`/workout/session/${session.id}`}>返回训练</Link>
    </aside>}
  </>;
}

export function RestNotificationOffer() {
  const [permission, setPermission] = useState(notificationPermission);
  const [dismissed, setDismissed] = useState(() => {
    try { return localStorage.getItem('fitflow.restNotificationDismissed') === '1'; } catch { return false; }
  });
  function dismiss() {
    setDismissed(true);
    try { localStorage.setItem('fitflow.restNotificationDismissed', '1'); } catch { /* Optional UI preference. */ }
  }
  if (permission !== 'default' || dismissed) return null;
  return <aside className="rest-notification-offer card" aria-label="休息通知">
      <span className="small">开启休息结束通知？后台提醒受浏览器限制。</span>
      <button className="secondary-button" onClick={() => { dismiss(); void requestRestNotification().then(setPermission); }}>开启通知</button>
      <button className="ghost-button" onClick={() => dismiss()}>暂不开启</button>
    </aside>;
}
