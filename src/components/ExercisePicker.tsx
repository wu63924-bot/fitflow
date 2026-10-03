import { useState } from 'react';
import { saveExercise } from '../repositories/exerciseRepository';
import { useToast } from './UI';
import type { Exercise, ExerciseCategory } from '../types';

const categories: ExerciseCategory[] = ['胸', '背', '肩', '腿', '三头', '二头', '腹部'];

export function ExercisePicker({ exercises, onAdd }: { exercises: Exercise[]; onAdd: (exercise: Exercise) => void }) {
  const toast = useToast();
  const [category, setCategory] = useState<ExerciseCategory | '全部'>('胸');
  const [search, setSearch] = useState('');
  const [exerciseId, setExerciseId] = useState('');
  const [extraExercises, setExtraExercises] = useState<Exercise[]>([]);
  const [showCustom, setShowCustom] = useState(false);
  const [customName, setCustomName] = useState('');
  const [customCategory, setCustomCategory] = useState<ExerciseCategory>('胸');
  const [busy, setBusy] = useState(false);
  const options = [...exercises, ...extraExercises.filter(item => !exercises.some(existing => existing.id === item.id))];
  const filtered = options.filter(item => (category === '全部' || item.category === category || (category === '腹部' && item.category === '核心')) && item.name.includes(search.trim()));

  function addSelected() {
    const exercise = filtered.find(item => item.id === exerciseId);
    if (!exercise) { toast('请选择动作'); return; }
    onAdd(exercise);
    setExerciseId('');
  }

  async function createCustom() {
    const name = customName.trim();
    if (!name) { toast('请输入动作名称'); return; }
    setBusy(true);
    try {
      const exercise: Exercise = {
        id: `custom-${Date.now()}-${Math.floor(Math.random() * 10000)}`, name,
        muscle: ['三头', '二头', '腹部'].includes(customCategory) ? customCategory : `${customCategory}部`,
        category: customCategory, sets: 3, repRange: '10', restSeconds: 90, isCustom: true
      };
      await saveExercise(exercise);
      setExtraExercises(current => [...current, exercise]);
      onAdd(exercise);
      setCustomName('');
      setShowCustom(false);
      setCategory(customCategory);
      setSearch('');
      setExerciseId('');
      toast('自定义动作已创建并添加');
    } catch (error) { toast(error instanceof Error ? error.message : '自定义动作保存失败'); }
    finally { setBusy(false); }
  }

  return <div>
    <div className="exercise-category-filter" aria-label="动作肌群分类">
      {(['全部', ...categories] as const).map(value => <button type="button" key={value} aria-pressed={category === value} className={category === value ? 'active' : ''} onClick={() => { setCategory(value); setExerciseId(''); }}>{value}</button>)}
    </div>
    <input className="text-input" aria-label="搜索动作" placeholder="搜索动作名称" value={search} onChange={event => { setSearch(event.target.value); setExerciseId(''); }} />
    <p className="muted small">{category} · {filtered.length} 个动作</p>
    <div className="add-exercise-row">
      <select className="text-input" aria-label="选择动作" value={exerciseId} onChange={event => setExerciseId(event.target.value)}>
        <option value="">选择动作库动作</option>
        {filtered.map(item => <option key={item.id} value={item.id}>{item.name}{item.isCustom ? ' · 自定义' : ''}</option>)}
      </select>
      <button className="secondary-button" type="button" onClick={addSelected}>添加动作</button>
    </div>
    <button className="text-button custom-exercise-toggle" type="button" onClick={() => { setShowCustom(value => !value); if (category !== '全部') setCustomCategory(category); }}>{showCustom ? '收起自定义动作' : '＋ 新建自定义动作'}</button>
    {showCustom && <div className="custom-exercise-form">
      <input className="text-input" aria-label="自定义动作名称" placeholder="动作名称" maxLength={60} value={customName} onChange={event => setCustomName(event.target.value)} />
      <select className="text-input" aria-label="自定义动作模块" value={customCategory} onChange={event => setCustomCategory(event.target.value as ExerciseCategory)}>{categories.map(value => <option key={value}>{value}</option>)}</select>
      <button className="secondary-button" type="button" disabled={busy} onClick={() => void createCustom()}>{busy ? '保存中…' : '创建并添加'}</button>
    </div>}
  </div>;
}
