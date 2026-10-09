import { useState } from 'react';
import { Modal, useToast } from './UI';
import { updateTodayWorkoutRecord } from '../services/workoutRecordService';
import type { WorkoutSession } from '../types';

type SetDraft = { weight: string; reps: string; completed: boolean };

export function EditWorkoutRecordDialog({ session, onClose, onSaved }: { session: WorkoutSession; onClose: () => void; onSaved: () => void }) {
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  const [inputs, setInputs] = useState<Record<string, SetDraft>>(() => Object.fromEntries(session.exercises.flatMap(exercise => exercise.sets.map(set => [set.id, { weight: String(set.weight), reps: String(set.reps), completed: set.completed }]))));
  function update(id: string, change: Partial<SetDraft>) { setInputs(current => ({ ...current, [id]: { ...current[id], ...change } })); }
  async function save() {
    if (busy) return;
    try {
      const edits = session.exercises.flatMap(exercise => exercise.sets.map((set, index) => {
        const input = inputs[set.id];
        const weight = Number(input.weight);
        const reps = Number(input.reps);
        if (!input.weight.trim() || !Number.isFinite(weight) || weight < 0 || !input.reps.trim() || !Number.isInteger(reps) || reps < 1) throw new Error(`${exercise.name}第 ${index + 1} 组：重量需不小于 0，次数需为正整数`);
        return { id: set.id, weight, reps, completed: input.completed };
      }));
      setBusy(true);
      await updateTodayWorkoutRecord(session.id, edits);
      toast('今日训练记录已更新');
      onSaved();
    } catch (error) { toast(error instanceof Error ? error.message : '保存失败'); }
    finally { setBusy(false); }
  }
  return <Modal title="修改今日训练记录" onClose={() => { if (!busy) onClose(); }}>
    <div className="workout-record-editor" aria-label="训练记录编辑">
      <strong>{session.workoutDayName}</strong><p className="muted small">修改重量、次数和完成状态，训练时间保持不变。</p>
      {session.exercises.map(exercise => <section className="record-editor-exercise" key={exercise.id}><h3>{exercise.name}</h3>
        <div className="record-editor-head"><span>组</span><span>重量 kg</span><span>次数</span><span>完成</span></div>
        {exercise.sets.map((set, index) => <div className="record-editor-row" key={set.id}><span>{index + 1}</span>
          <input className="text-input" type="text" inputMode="decimal" aria-label={`${exercise.name}第 ${index + 1} 组重量`} disabled={busy} value={inputs[set.id].weight} onFocus={event => event.currentTarget.select()} onChange={event => update(set.id, { weight: event.target.value })} />
          <input className="text-input" type="number" inputMode="numeric" min="1" step="1" aria-label={`${exercise.name}第 ${index + 1} 组次数`} disabled={busy} value={inputs[set.id].reps} onChange={event => update(set.id, { reps: event.target.value })} />
          <input type="checkbox" aria-label={`${exercise.name}第 ${index + 1} 组完成`} disabled={busy} checked={inputs[set.id].completed} onChange={event => update(set.id, { completed: event.target.checked })} />
        </div>)}
      </section>)}
      <div className="record-editor-actions"><button className="secondary-button" disabled={busy} onClick={onClose}>取消</button><button className="primary-button" disabled={busy} onClick={() => void save()}>{busy ? '保存中…' : '保存修改'}</button></div>
    </div>
  </Modal>;
}
