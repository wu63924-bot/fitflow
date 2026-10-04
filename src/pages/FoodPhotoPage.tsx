import { useEffect, useMemo, useRef, useState } from 'react';
import type { ChangeEvent } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router';
import { BackHeader, EmptyState, useToast } from '../components/UI';
import { addMealItems, mealOrder, mealTitles } from '../repositories/mealRepository';
import { createAiMealItem, recognizeFood, recognitionNotice } from '../services/foodRecognitionService';
import type { RecognizedFood } from '../services/foodRecognitionService';
import { compressFoodImage } from '../utils/foodImage';
import type { ProcessedFoodImage } from '../utils/foodImage';
import { sumItems } from '../utils/nutrition';
import { dateKey } from '../utils/format';
import type { MealType } from '../types';

type RecognitionState = 'idle' | 'selecting' | 'preview' | 'analyzing' | 'success' | 'error';
const macro = (value: number) => Number(value.toFixed(1));
const displayValue = (value: number) => Number.isFinite(value) ? macro(value) : '—';

export function FoodPhotoPage() {
  const navigate = useNavigate();
  const toast = useToast();
  const { type } = useParams();
  const [searchParams] = useSearchParams();
  const today = dateKey(new Date());
  const date = searchParams.get('date') || today;
  const validDate = /^\d{4}-\d{2}-\d{2}$/.test(date) && dateKey(new Date(`${date}T12:00:00`)) === date;
  const [meal, setMeal] = useState<MealType>(mealOrder.includes(type as MealType) ? type as MealType : 'snack');
  const [state, setState] = useState<RecognitionState>('idle');
  const [image, setImage] = useState<(ProcessedFoodImage & { url: string })>();
  const [results, setResults] = useState<RecognizedFood[]>([]);
  const [editingId, setEditingId] = useState('');
  const [hasResult, setHasResult] = useState(false);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const lock = useRef(false);
  const request = useRef(0);
  const recognitionAbort = useRef<AbortController | undefined>(undefined);
  const selectionState = useRef<RecognitionState>('idle');
  const cameraInput = useRef<HTMLInputElement>(null);
  const albumInput = useRef<HTMLInputElement>(null);
  useEffect(() => {
    const inputs = [cameraInput.current, albumInput.current];
    const cancel = () => setState(selectionState.current);
    inputs.forEach(input => input?.addEventListener('cancel', cancel));
    return () => inputs.forEach(input => input?.removeEventListener('cancel', cancel));
  }, [date]);
  useEffect(() => () => { request.current++; recognitionAbort.current?.abort(); }, []);
  useEffect(() => () => { if (image) URL.revokeObjectURL(image.url); }, [image]);
  const items = useMemo(() => results.flatMap(food => {
    try { return [createAiMealItem(food)]; } catch { return []; }
  }), [results]);
  const total = useMemo(() => sumItems(items), [items]);
  const busy = state === 'selecting' || state === 'analyzing' || saving;

  function reset() {
    recognitionAbort.current?.abort();
    request.current++;
    lock.current = false;
    setImage(undefined); setResults([]); setEditingId(''); setHasResult(false); setError(''); setState('idle');
  }

  function selecting() {
    if (lock.current) return;
    recognitionAbort.current?.abort();
    selectionState.current = state;
    setState('selecting'); setError('');
  }

  async function choose(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) { setState(selectionState.current); return; }
    if (lock.current) return;
    lock.current = true;
    const ticket = ++request.current;
    setState('selecting'); setError('');
    try {
      const processed = await compressFoodImage(file);
      if (ticket !== request.current) return;
      setImage({ ...processed, url: URL.createObjectURL(processed.blob) });
      setResults([]); setEditingId(''); setHasResult(false); setState('preview');
    } catch (reason) {
      if (ticket === request.current) { setError(reason instanceof Error ? reason.message : '图片处理失败，请重新选择'); setState('error'); }
    } finally { if (ticket === request.current) lock.current = false; }
  }

  async function analyze() {
    if (!image || lock.current) return;
    lock.current = true;
    const ticket = ++request.current;
    recognitionAbort.current?.abort();
    const controller = new AbortController();
    recognitionAbort.current = controller;
    setState('analyzing'); setError(''); setHasResult(false);
    try {
      const result = await recognizeFood(image.blob, undefined, controller.signal);
      if (ticket !== request.current) return;
      setResults(result.foods);
      setHasResult(true); setState('success');
    } catch (reason) {
      if (ticket === request.current) { setError(reason instanceof Error ? reason.message : '识别失败，请重试或手动添加'); setState('error'); }
    } finally { if (ticket === request.current) lock.current = false; }
  }

  function change(id: string, key: keyof RecognizedFood, value: string) {
    setError('');
    setResults(rows => rows.map(row => row.id === id ? { ...row, [key]: key === 'name' ? value : value.trim() === '' ? NaN : Number(value) } : row));
  }

  async function save() {
    if (lock.current) return;
    if (!results.length) { setError('请至少保留一种食物'); return; }
    let confirmed;
    try { confirmed = results.map(createAiMealItem); }
    catch (reason) { setError(reason instanceof Error ? reason.message : '请确认名称、重量和营养值'); return; }
    lock.current = true; setSaving(true); setError('');
    const ticket = ++request.current;
    let saved = false;
    try {
      await addMealItems(date, meal, confirmed);
      saved = true;
      if (ticket !== request.current) return;
      setImage(undefined);
      toast(`已记录到${mealTitles[meal]}`);
      navigate(`/nutrition?date=${date}`, { replace: true });
    } catch (reason) {
      setError(reason instanceof Error ? `保存失败：${reason.message}，请重试` : '保存失败，请重试'); setState('error');
    } finally { if (!saved && ticket === request.current) { lock.current = false; setSaving(false); } }
  }

  if (!validDate || date > today) return <div className="page"><BackHeader title="AI 拍照识别" /><EmptyState title="请选择今天或过去的日期记录饮食" /></div>;

  return <div className="page nutrition-page recognition-page" data-recognition-state={state}>
    <BackHeader title="AI 拍照识别" subtitle="AI估算 · 请确认名称、重量与营养" />
    <p className="nutrition-photo-notice">{recognitionNotice}</p>
    <fieldset className="recognition-controls" disabled={state === 'analyzing' || saving}>
      <div className="recognition-inputs">
        <label className="upload-zone"><strong>拍照</strong><span className="muted small">使用摄像头</span><input ref={cameraInput} aria-label="拍照选择食物图片" type="file" accept="image/*" capture="environment" onClick={selecting} onChange={event => void choose(event)} /></label>
        <label className="upload-zone"><strong>选择图片</strong><span className="muted small">相册或本地文件</span><input ref={albumInput} aria-label="从相册选择食物图片" type="file" accept="image/*" onClick={selecting} onChange={event => void choose(event)} /></label>
      </div>
    </fieldset>
    {state === 'selecting' && <div className="loading-state" role="status"><span className="spinner" />选择或处理图片中，可取消后重选</div>}
    {image && <section className="photo-preview card"><img src={image.url} alt="所选食物照片" /></section>}
    {state === 'analyzing' && <div className="loading-state" role="status"><span className="spinner" />正在识别食物…</div>}
    {!!error && <div className="card error-state" role="alert">{error}</div>}
    {image && !hasResult && <button className="primary-button full-button" disabled={busy} onClick={() => void analyze()}>{state === 'analyzing' ? '正在识别食物…' : '开始识别'}</button>}
    {hasResult && <>
      <section className="card recognition-summary" aria-label="本餐营养"><h2>本餐营养 · AI估算</h2><strong>{Math.round(total.calories)} kcal</strong><p>蛋白质 {macro(total.protein)}g · 碳水 {macro(total.carbs)}g · 脂肪 {macro(total.fat)}g</p><small className="muted">无效项目暂不计入汇总，保存时校验。</small></section>
      <fieldset className="recognition-controls" disabled={busy}>
        <label className="field-label">餐次<select className="text-input" value={meal} onChange={event => setMeal(event.target.value as MealType)}>{mealOrder.map(value => <option key={value} value={value}>{mealTitles[value]}</option>)}</select></label>
        {results.map((row, index) => <article className="card recognition-food" key={row.id}>
          <div className="recognition-food-row">
            <div className="recognition-food-line" tabIndex={0} aria-label={`识别食物${index + 1}摘要`}>
              <strong title={row.name}>{row.name || '未命名'}</strong><span>{displayValue(row.estimatedGrams)}g</span><span>{displayValue(row.calories)} kcal</span>
              <span aria-label={`蛋白质 ${displayValue(row.protein)}g，碳水 ${displayValue(row.carbs)}g，脂肪 ${displayValue(row.fat)}g`}>蛋{displayValue(row.protein)}g · 碳{displayValue(row.carbs)}g · 脂{displayValue(row.fat)}g</span>
            </div>
            <span className="recognition-source" title={`识别置信度提示 ${Math.round(row.confidence * 100)}%（非准确概率）`}>AI估算{row.confidence < 0.7 ? ' · 待确认' : ''}</span>
            <button className="text-button" aria-label={`编辑识别食物${index + 1}`} aria-expanded={editingId === row.id} aria-controls={`recognition-edit-${row.id}`} onClick={() => setEditingId(editingId === row.id ? '' : row.id)}>{editingId === row.id ? '收起' : '编辑'}</button>
            <button className="text-button danger-text" aria-label={`删除识别食物${index + 1}`} onClick={() => setResults(rows => rows.filter(value => value.id !== row.id))}>删除</button>
          </div>
          {editingId === row.id && <div id={`recognition-edit-${row.id}`} className="recognition-food-edit">
          <p className="muted small">AI估算 · 识别置信度提示 {Math.round(row.confidence * 100)}%（非准确概率）</p>
          {row.confidence < 0.7 && <p className="recognition-warning">识别结果不确定，请确认</p>}
          <label className="field-label">名称<input className="text-input" aria-label={`识别食物${index + 1}名称`} value={row.name} maxLength={60} onChange={event => change(row.id, 'name', event.target.value)} /></label>
          <p className="muted small">以下营养为这份食物的总量。重量和营养可分别修改，修改重量不会自动调整营养。</p>
          {([['estimatedGrams', '重量（克）'], ['calories', '热量（kcal）'], ['protein', '蛋白质（g）'], ['carbs', '碳水（g）'], ['fat', '脂肪（g）']] as const).map(([key, label]) => <label className="field-label" key={key}>{label}<input className="text-input" aria-label={`识别食物${index + 1}${label}`} type="number" inputMode="decimal" step="any" min={key === 'estimatedGrams' ? '0.1' : '0'} max="10000" value={Number.isFinite(row[key]) ? row[key] : ''} onChange={event => change(row.id, key, event.target.value)} /></label>)}
          </div>}
        </article>)}
        {!results.length && <EmptyState title="还没有食物">请重新识别或使用手动添加。</EmptyState>}

      </fieldset>
      <button className="primary-button full-button" disabled={busy || !results.length} onClick={() => void save()}>{saving ? '保存中…' : '确认并记录'}</button>
    </>}
    {image && <button className="text-button full-button" disabled={saving} onClick={reset}>清除照片与结果</button>}
    <button className="text-button full-button" disabled={saving || state === 'analyzing'} onClick={() => navigate(`/nutrition/add/${meal}?date=${date}`)}>改为手动添加</button>
  </div>;
}
