import { mutateWorkoutSession } from '../repositories/workoutRepository';
import { dateKey } from '../utils/format';

export interface WorkoutRecordSetEdit {
  id: string;
  weight: number;
  reps: number;
  completed: boolean;
}

export async function updateTodayWorkoutRecord(sessionId: string, edits: WorkoutRecordSetEdit[]): Promise<void> {
  for (const edit of edits) {
    if (!Number.isFinite(edit.weight) || edit.weight < 0 || !Number.isInteger(edit.reps) || edit.reps < 1 || typeof edit.completed !== 'boolean') throw new Error('请填写有效的重量和次数');
  }
  const values = new Map(edits.map(edit => [edit.id, edit]));
  const updated = await mutateWorkoutSession(sessionId, session => {
    if (session.status !== 'completed' || dateKey(new Date(session.endedAt ?? session.startedAt)) !== dateKey(new Date())) throw new Error('只能修改今日已完成的训练记录');
    for (const exercise of session.exercises) for (const set of exercise.sets) {
      const edit = values.get(set.id);
      if (!edit) throw new Error('训练记录已变化，请重新打开');
      set.weight = edit.weight;
      set.reps = edit.reps;
      set.completed = edit.completed;
      set.completedAt = edit.completed ? set.completedAt ?? session.endedAt : undefined;
    }
  });
  if (!updated) throw new Error('训练记录不存在');
}
