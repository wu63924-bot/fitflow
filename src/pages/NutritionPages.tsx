import { useEffect, useMemo, useState } from 'react';
import type { FormEvent } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router';
import { BackHeader, EmptyState, ErrorState, SectionTitle, useToast } from '../components/UI';
import { useAsyncData } from '../hooks/useAsyncData';
import { getFoodPickerData, createCustomFood, markFoodRecent, saveFood, toggleFavoriteFood } from '../repositories/foodRepository';
import { addFoodToMeal, clearMeal, copyMeal, listMealsForDate, mealOrder, mealTitles, moveFoodToMeal, removeFoodFromMeal, restoreFoodToMeal, updateFoodAmount } from '../repositories/mealRepository';
import { getNutritionTarget } from '../repositories/settingsRepository';
import { calculateMealItem, createMealItem, progressPercent, sumItems, sumNutrition } from '../utils/nutrition';
import { dateKey } from '../utils/format';
import type { Food, FoodCategory, FoodUnit, MealItem, MealType } from '../types';

const categories: FoodCategory[] = ['主食', '肉类', '蛋奶', '蔬菜', '水果', '豆制品', '饮品', '零食', '其他'];
type FoodTab = 'all' | 'recent' | 'favorites' | 'mine';

function mealType(value: string | undefined): MealType {
  return value && value in mealTitles ? value as MealType : 'snack';
}

function validDate(value: string): boolean {
  const parsed = new Date(`${value}T12:00:00`);
  return /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(parsed.getTime()) && dateKey(parsed) === value;
}

function dateLabel(value: string): string {
  return new Intl.DateTimeFormat('zh-CN', { month: 'long', day: 'numeric', weekday: 'long' }).format(new Date(`${value}T12:00:00`));
}

function moveDate(value: string, days: number): string {
  const date = new Date(`${value}T12:00:00`);
  date.setDate(date.getDate() + days);
  return dateKey(date);
}

function formatMacro(value: number): string {
  return Number.isInteger(value) ? String(value) : value.toFixed(1);
}

export function DietPage() {
  const navigate = useNavigate();
  const toast = useToast();
  const [searchParams, setSearchParams] = useSearchParams();
  const today = dateKey(new Date());
  const date = searchParams.get('date') || today;
  const valid = validDate(date);
  const future = date > today;
  const { data, loading, error, refresh } = useAsyncData(async () => {
    const [meals, target] = await Promise.all([listMealsForDate(date), getNutritionTarget()]);
    return { meals, target, nutrition: sumNutrition(meals) };
  }, [date]);
  const [undo, setUndo] = useState<{ date: string; type: MealType; item: MealItem; index: number }>();
  useEffect(() => {
    setUndo(undefined);
  }, [date]);
  useEffect(() => {
    if (!undo) return;
    const timeout = window.setTimeout(() => setUndo(undefined), 5000);
    return () => window.clearTimeout(timeout);
  }, [undo]);

  if (!valid) return <div className="page"><BackHeader title="日期无效" /><EmptyState title="无法读取这一天的饮食记录" /></div>;
  if (loading || !data) return <div className="page"><div className="loading-state"><span className="spinner" />正在读取饮食记录…</div></div>;
  if (error) return <div className="page"><ErrorState message={error} /></div>;

  async function remove(type: MealType, itemId: string) {
    try {
      const removed = await removeFoodFromMeal(date, type, itemId);
      if (!removed) return;
      setUndo({ date, type, ...removed });
      await refresh();
    } catch (reason) { toast(reason instanceof Error ? reason.message : '删除失败'); }
  }

  async function undoRemove() {
    if (!undo) return;
    try { await restoreFoodToMeal(undo.date, undo.type, undo.item, undo.index); setUndo(undefined); await refresh(); }
    catch (reason) { toast(reason instanceof Error ? reason.message : '撤销失败'); }
  }

  async function copy(sourceDate: string, sourceType: MealType, targetType: MealType) {
    try {
      const count = await copyMeal(sourceDate, sourceType, date, targetType);
      if (!count) { toast('没有可复制的食物'); return; }
      await refresh();
      toast(`已复制 ${count} 种食物`);
    } catch (reason) { toast(reason instanceof Error ? reason.message : '复制失败'); }
  }

  async function removeMeal(type: MealType) {
    if (!window.confirm(`清空${mealTitles[type]}全部食物记录？此操作无法撤销。`)) return;
    try { await clearMeal(date, type); await refresh(); toast(`${mealTitles[type]}已清空`); }
    catch (reason) { toast(reason instanceof Error ? reason.message : '清空失败'); }
  }

  function openFood(type: MealType) { navigate(`/nutrition/add/${type}?date=${date}`); }
  const dateTitle = date === today ? '今日饮食' : `${date.slice(5).replace('-', '月')}日饮食`;

  return <div className="page nutrition-page diet-page">
    <header className="diet-header">
      <h1 className="page-title">{dateTitle}</h1>
      <div className="diet-date">
        <button className="text-button" aria-label="前一天" onClick={() => setSearchParams({ date: moveDate(date, -1) })}>‹</button>
        <button className="date-today-button" aria-label="返回今天" onClick={() => setSearchParams({ date: today })}>{dateLabel(date)}</button>
        <button className="text-button" aria-label="后一天" onClick={() => setSearchParams({ date: moveDate(date, 1) })}>›</button>
      </div>
    </header>
    <section className="card nutrition-overview" aria-label="每日营养">
      <span className="muted small">摄入 / 每日目标</span><div><strong className="value">{Math.round(data.nutrition.calories)}</strong><span className="unit"> / {data.target.calories} kcal</span></div>
      <div className="progress-track calorie-track"><div className="progress-fill" style={{ width: `${progressPercent(data.nutrition.calories, data.target.calories)}%` }} /></div>
      <div className="diet-macros">{([['protein', '蛋白质'], ['carbs', '碳水'], ['fat', '脂肪']] as const).map(([key, label]) => <div key={key}><span>{label}</span><strong>{formatMacro(data.nutrition[key])}<small> / {data.target[key]}g</small></strong></div>)}</div>
    </section>
    <div className="diet-add-actions">
      <button className="primary-button" disabled={future} onClick={() => openFood('snack')}>手动添加</button>
      <button className="secondary-button" disabled={future} onClick={() => navigate(`/nutrition/photo/snack?date=${date}`)}>AI 拍照识别</button>
    </div>
    {future && <div className="card nutrition-readonly-note">未来日期仅供查看，不能记录已吃食物。</div>}
    <section className="section">
      <SectionTitle title="用餐记录" />
      <div className="diet-meal-list">
      {data.meals.map((meal, index) => {
        const totals = sumItems(meal.items);
        const previousType = index > 0 ? mealOrder[index - 1] : undefined;
        return <article className="meal-card" key={meal.id}>
          <div className="diet-meal-head"><div className="diet-meal-name"><strong className="meal-title">{mealTitles[meal.type]}</strong>{!meal.items.length && <small>暂无记录</small>}</div><span className="meal-calories">{Math.round(totals.calories)} kcal</span><button className="text-button" disabled={future} aria-label={`添加${mealTitles[meal.type]}食物`} onClick={() => openFood(meal.type)}>＋ 添加</button>
            {!future && <details className="diet-meal-more">
            <summary aria-label={`${mealTitles[meal.type]}更多操作`}>更多</summary>
            <div className="meal-buttons">
              <button className="meal-action meal-copy" onClick={() => void copy(moveDate(date, -1), meal.type, meal.type)}>复制昨天{mealTitles[meal.type]}</button>
              {previousType && <button className="meal-action meal-copy" disabled={!data.meals[index - 1]?.items.length} onClick={() => void copy(date, previousType, meal.type)}>复制上一餐</button>}
              {!!meal.items.length && <button className="meal-action meal-clear" onClick={() => void removeMeal(meal.type)}>清空本餐</button>}
            </div>
          </details>}
          </div>
          {meal.items.length ? <div className="meal-foods">{meal.items.map(item => <FoodItemRow key={item.id} item={item} date={date} type={meal.type} onRemove={() => void remove(meal.type, item.id)} onChanged={() => void refresh()} toast={toast} disabled={future} />)}</div> : null}


        </article>;
      })}
      </div>
    </section>
    {undo && <div className="undo-bar" role="status"><span>已删除食物</span><button onClick={() => void undoRemove()}>撤销</button></div>}
  </div>;
}

function FoodItemRow({ item, date, type, onRemove, onChanged, toast, disabled }: {
  item: MealItem; date: string; type: MealType; onRemove: () => void; onChanged: () => void; toast: (message: string) => void; disabled: boolean;
}) {
  const [editing, setEditing] = useState(false);
  const [amount, setAmount] = useState(String(item.amount));
  const [busy, setBusy] = useState(false);
  const nutrition = calculateMealItem(item);

  async function saveAmount() {
    if (busy) return;
    setBusy(true);
    try { await updateFoodAmount(date, type, item.id, Number(amount)); setEditing(false); onChanged(); }
    catch (reason) { toast(reason instanceof Error ? reason.message : '份量无效'); }
    finally { setBusy(false); }
  }

  async function moveTo(next: MealType) {
    if (next === type || busy) return;
    setBusy(true);
    try { await moveFoodToMeal(date, type, next, item.id); onChanged(); toast(`已移到${mealTitles[next]}`); }
    catch (reason) { toast(reason instanceof Error ? reason.message : '更换餐次失败'); }
    finally { setBusy(false); }
  }

  return <div className="meal-food-row meal-food-item">
    <div className="meal-food-copy"><strong>{item.foodNameSnapshot}</strong><small>{item.amount}{item.unit}{item.nutritionSource === 'ai' ? ' · AI估算' : ''}{item.unit === '个' && item.nutritionSnapshot.gramsPerUnit ? `（约 ${item.nutritionSnapshot.gramsPerUnit}g/个）` : ''}</small></div>
    <span className="muted small">{Math.round(nutrition.calories)} kcal</span>
    <button className="text-button" aria-label={`编辑${item.foodNameSnapshot}`} aria-expanded={editing} disabled={disabled || busy} onClick={() => { setAmount(String(item.amount)); setEditing(value => !value); }}>{editing ? '收起' : '编辑'}</button>
    {editing && <div className="diet-item-editor">
      <div className="meal-amount-editor"><label>份量（{item.unit}）<input className="text-input" type="number" min="0.1" max="10000" step="any" inputMode="decimal" value={amount} onChange={event => setAmount(event.target.value)} /></label><button className="secondary-button" disabled={busy} onClick={() => void saveAmount()}>保存</button></div>
      <div className="diet-item-tools"><label>餐次<select className="text-input" aria-label={`更换${item.foodNameSnapshot}餐次`} disabled={busy} value={type} onChange={event => void moveTo(event.target.value as MealType)}>{mealOrder.map(mealTypeValue => <option key={mealTypeValue} value={mealTypeValue}>{mealTitles[mealTypeValue]}</option>)}</select></label><button className="text-button danger-text" aria-label={`删除${item.foodNameSnapshot}`} disabled={busy} onClick={onRemove}>删除食物</button></div>
    </div>}
  </div>;
}

export function AddMealPage() {
  const { type: rawType } = useParams();
  const type = mealType(rawType);
  const navigate = useNavigate();
  const toast = useToast();
  const today = dateKey(new Date());
  const [searchParams] = useSearchParams();
  const date = searchParams.get('date') || today;
  const dateIsValid = validDate(date);
  const future = date > today;
  const { data, loading, error, refresh } = useAsyncData(getFoodPickerData);
  const [query, setQuery] = useState('');
  const [tab, setTab] = useState<FoodTab>('all');
  const [category, setCategory] = useState<FoodCategory | '全部'>('全部');
  const [selectedId, setSelectedId] = useState('');
  const [amount, setAmount] = useState('');
  const [editor, setEditor] = useState<Food | null | undefined>();
  const [busy, setBusy] = useState(false);
  const selectedFood = data?.foods.find(food => food.id === selectedId);
  const preview = useMemo(() => {
    const numeric = Number(amount);
    if (!selectedFood || !Number.isFinite(numeric) || numeric <= 0 || numeric > 10000) return undefined;
    return calculateMealItem(createMealItem(selectedFood, numeric));
  }, [selectedFood, amount]);
  const visibleFoods = useMemo(() => {
    if (!data) return [];
    let foods = data.foods;
    if (tab === 'recent') foods = data.recents.map(id => foods.find(food => food.id === id)).filter((food): food is Food => !!food);
    if (tab === 'favorites') foods = data.favorites.map(id => foods.find(food => food.id === id)).filter((food): food is Food => !!food);
    if (tab === 'mine') foods = foods.filter(food => food.isCustom);
    return foods.filter(food => (!query.trim() || food.name.includes(query.trim())) && (category === '全部' || food.category === category));
  }, [data, tab, query, category]);

  if (!dateIsValid) return <div className="page"><BackHeader title="日期无效" /><EmptyState title="请返回饮食页重新选择日期" /></div>;
  if (loading || !data) return <div className="page"><BackHeader title={`添加${mealTitles[type]}`} /><div className="loading-state"><span className="spinner" />正在读取食物库…</div></div>;
  if (error) return <div className="page"><BackHeader title={`添加${mealTitles[type]}`} /><ErrorState message={error} /></div>;

  async function onAdd() {
    if (busy) return;
    if (future) { toast('未来日期不能记录已吃食物'); return; }
    if (!selectedFood) { toast('请先选择食物'); return; }
    const numericAmount = Number(amount);
    if (!Number.isFinite(numericAmount) || numericAmount <= 0 || numericAmount > 10000) { toast('请输入大于 0 且不超过 10000 的份量'); return; }
    setBusy(true);
    try {
      await addFoodToMeal(date, type, selectedFood, numericAmount);
      await markFoodRecent(selectedFood.id);
      toast(`已添加到${mealTitles[type]}`);
      navigate(`/nutrition?date=${date}`);
    } catch (reason) { toast(reason instanceof Error ? reason.message : '添加食物失败'); }
    finally { setBusy(false); }
  }

  async function toggleFavorite(food: Food) {
    try { const added = await toggleFavoriteFood(food.id); await refresh(); toast(added ? '已加入常吃' : '已取消常吃'); }
    catch (reason) { toast(reason instanceof Error ? reason.message : '收藏失败'); }
  }

  return <div className="page nutrition-page food-picker-page">
    <BackHeader title={`添加${mealTitles[type]}`} subtitle={dateLabel(date)} />
    <div className="row-between nutrition-picker-heading"><span className="muted small">从食物库选择</span><button className="text-button" disabled={future} onClick={() => navigate(`/nutrition/photo/${type}?date=${date}`)}>改用 AI 拍照</button></div>
    {future && <div className="card nutrition-readonly-note">未来日期可以浏览食物，但不能保存饮食记录。</div>}
    <div className="nutrition-search-row"><label className="field-label">搜索食物<input className="text-input" value={query} onChange={event => setQuery(event.target.value)} placeholder="输入食物名称" /></label>
    <label className="food-category-select">分类<select className="text-input" value={category} onChange={event => setCategory(event.target.value as FoodCategory | '全部')}><option value="全部">全部分类</option>{categories.map(value => <option key={value}>{value}</option>)}</select></label>
    </div>
    <div className="food-tabs" role="tablist" aria-label="食物列表">{([['all', '全部'], ['recent', '最近'], ['favorites', '常吃'], ['mine', '自定义']] as const).map(([value, label]) => <button key={value} role="tab" aria-selected={tab === value} className={tab === value ? 'food-tab active' : 'food-tab'} onClick={() => setTab(value)}>{label}</button>)}</div>

    <section className="section">
      <SectionTitle title={tab === 'recent' ? '最近吃过' : tab === 'favorites' ? '常吃' : tab === 'mine' ? '我的食物' : '本地食物库'} action="＋ 自定义食物" onAction={() => setEditor(null)} />
      <div className="nutrition-food-list">
      {visibleFoods.map(food => <div className="nutrition-food-entry" key={food.id}><div className={`food-option${selectedId === food.id ? ' food-option-selected' : ''}`}>
        <button className="food-pick" onClick={() => { setSelectedId(food.id); setAmount(String(food.servingBase)); }}>
          <strong>{food.name}</strong><small>{food.calories} kcal / 100{food.nutritionUnit}</small>
        </button>
        <div className="food-option-actions"><button aria-label={`${data.favorites.includes(food.id) ? '取消收藏' : '收藏'}${food.name}`} onClick={() => void toggleFavorite(food)}>{data.favorites.includes(food.id) ? '★' : '☆'}</button><button onClick={() => setEditor(food)}>编辑</button></div>
      </div>
    {selectedFood?.id === food.id && <section className="card selected-food-card">
      <div className="row-between"><strong>{selectedFood.name}</strong><span className="muted small">每 100{selectedFood.nutritionUnit} · {selectedFood.calories} kcal</span></div>
      <label className="field-label">食用份量（{selectedFood.servingUnit}）<input className="text-input" type="number" inputMode="decimal" step="any" min="0.1" max="10000" value={amount} onChange={event => setAmount(event.target.value)} /></label>
      {selectedFood.servingUnit === '个' && <p className="muted small">约 {selectedFood.gramsPerUnit}g / 个，实际重量会有差异。</p>}
      {preview && <div className="food-preview-nutrients"><span>{Math.round(preview.calories)} kcal</span><span>蛋白质 {formatMacro(preview.protein)}g</span><span>碳水 {formatMacro(preview.carbs)}g</span><span>脂肪 {formatMacro(preview.fat)}g</span></div>}
      <button className="primary-button full-button" disabled={busy || future} onClick={() => void onAdd()}>{busy ? '保存中…' : `添加到${mealTitles[type]}`}</button>
    </section>}
      </div>)}
      </div>
      {!visibleFoods.length && <EmptyState title={tab === 'favorites' ? '还没有常吃食物' : tab === 'recent' ? '还没有最近记录' : '没有找到食物'}>可以搜索本地食物，或创建自定义食物。</EmptyState>}
    </section>

    {editor !== undefined && <FoodEditor initial={editor} onCancel={() => setEditor(undefined)} onSaved={async food => { await refresh(); if (selectedId === food.id) setSelectedId(food.id); setEditor(undefined); toast(editor ? '食物资料已更新' : '自定义食物已保存'); }} />}
  </div>;
}

function FoodEditor({ initial, onCancel, onSaved }: { initial: Food | null; onCancel: () => void; onSaved: (food: Food) => void }) {
  const toast = useToast();
  const [name, setName] = useState(initial?.name ?? '');
  const [category, setCategory] = useState<FoodCategory>(initial?.category ?? '其他');
  const [unit, setUnit] = useState<FoodUnit>(initial?.servingUnit ?? 'g');
  const [servingBase, setServingBase] = useState(String(initial?.servingBase ?? 100));
  const [gramsPerUnit, setGramsPerUnit] = useState(String(initial?.gramsPerUnit ?? 50));
  const [nutrients, setNutrients] = useState({ calories: String(initial?.calories ?? ''), protein: String(initial?.protein ?? ''), carbs: String(initial?.carbs ?? ''), fat: String(initial?.fat ?? '') });
  const [busy, setBusy] = useState(false);
  const nutritionUnit = initial?.nutritionUnit ?? (unit === '个' ? 'g' : unit);
  const unitOptions: FoodUnit[] = initial ? (nutritionUnit === 'g' ? ['g', '个'] : ['ml']) : ['g', 'ml', '个'];

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    setBusy(true);
    try {
      const foodData = {
        name, category, servingBase: Number(servingBase), servingUnit: unit, nutritionUnit, nutritionPer: 100 as const,
        calories: Number(nutrients.calories), protein: Number(nutrients.protein), carbs: Number(nutrients.carbs), fat: Number(nutrients.fat),
        ...(unit === '个' ? { gramsPerUnit: Number(gramsPerUnit) } : { gramsPerUnit: undefined })
      };
      const food = initial ? { ...initial, ...foodData } : await createCustomFood(foodData);
      if (initial) await saveFood(food);
      onSaved(food);
    } catch (reason) { toast(reason instanceof Error ? reason.message : '食物资料无效'); }
    finally { setBusy(false); }
  }

  return <div className="modal-backdrop">
    <form className="modal-sheet food-editor" onSubmit={event => void submit(event)}>
      <div className="modal-head"><h2>{initial ? '编辑食物资料' : '自定义食物'}</h2><button className="icon-button" type="button" onClick={onCancel} aria-label="关闭">×</button></div>
      <label className="field-label">食物名称<input className="text-input" maxLength={60} value={name} onChange={event => setName(event.target.value)} required /></label>
      <label className="field-label">分类<select className="text-input" value={category} onChange={event => setCategory(event.target.value as FoodCategory)}>{categories.map(value => <option key={value}>{value}</option>)}</select></label>
      <div className="food-editor-pair"><label className="field-label">常用份量<input className="text-input" type="number" min="0.1" max="10000" step="any" value={servingBase} onChange={event => setServingBase(event.target.value)} /></label><label className="field-label">单位<select className="text-input" value={unit} onChange={event => { const next = event.target.value as FoodUnit; setUnit(next); setServingBase(next === '个' ? '1' : '100'); }}>{unitOptions.map(value => <option key={value}>{value}</option>)}</select></label></div>
      {unit === '个' && <label className="field-label">每个约重（g）<input className="text-input" type="number" min="0.1" max="10000" step="any" value={gramsPerUnit} onChange={event => setGramsPerUnit(event.target.value)} /></label>}
      <div className="muted small food-editor-note">营养值按每 100{nutritionUnit} 估算，可参考包装标签修改。</div>
      <div className="food-editor-grid">{([['calories', '热量 kcal'], ['protein', '蛋白质 g'], ['carbs', '碳水 g'], ['fat', '脂肪 g']] as const).map(([key, label]) => <label className="field-label" key={key}>{label}<input className="text-input" type="number" min="0" max="10000" step="any" value={nutrients[key]} onChange={event => setNutrients(value => ({ ...value, [key]: event.target.value }))} required /></label>)}</div>
      <button className="primary-button full-button" disabled={busy}>{busy ? '保存中…' : '保存食物'}</button>
    </form>
  </div>;
}
