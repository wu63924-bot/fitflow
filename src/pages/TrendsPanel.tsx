import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router';
import { AnalyticsChart } from '../components/AnalyticsChart';
import { EmptyState, ErrorState, LoadingState, SectionTitle } from '../components/UI';
import { analyticsPeriods, type Analytics } from '../services/analytics';
import { loadAnalytics } from '../services/analyticsService';

const number = (value: number | undefined, unit = '') => value === undefined ? '暂无足够数据' : `${Number(value.toFixed(1))}${unit}`;
const duration = (value: number | undefined) => value === undefined ? '暂无足够数据' : `${Math.floor(Math.round(value) / 60)}h ${Math.round(value) % 60}min`;
function Metric({ label, value }: { label: string; value: string }) { return <div className="card analytics-metric"><span className="muted small">{label}</span><strong>{value}</strong></div>; }

export function TrendsPanel() {
  const navigate = useNavigate();
  const [days, setDays] = useState(30);
  const [exerciseId, setExerciseId] = useState('');
  const [{ data, loading, error }, setResult] = useState<{ data?: Analytics; loading: boolean; error?: string }>({ loading: true });
  useEffect(() => {
    let current = true;
    setResult({ loading: true });
    void loadAnalytics(days).then(data => { if (current) setResult({ data, loading: false }); }, reason => {
      if (current) setResult({ loading: false, error: reason instanceof Error ? reason.message : '读取统计失败' });
    });
    return () => { current = false; };
  }, [days]);
  const performance = data?.performances.find(item => item.id === exerciseId) ?? data?.performances[0];
  return <div className="analytics-panel">
    <div className="period-switcher" role="group" aria-label="统计时间范围">{analyticsPeriods.map(period => <button key={period.days} aria-pressed={days === period.days} className={`period${days === period.days ? ' period-selected' : ''}`} onClick={() => setDays(period.days)}>{period.label}</button>)}</div>
    {loading ? <LoadingState /> : error ? <ErrorState message={error} /> : data && <>
      <p className="muted small">{data.start} 至 {data.end} · 仅使用本机记录</p>
      <SectionTitle title="概览" />
      <div className="analytics-metrics">
        <Metric label="完成训练" value={data.count ? `${data.count} 次` : '暂无训练数据'} />
        <Metric label="总训练时长" value={data.count ? duration(data.totalMinutes) : '暂无足够数据'} />
        <Metric label="平均每周训练" value={data.count ? number(data.weeklyFrequency, ' 次') : '暂无足够数据'} />
        <Metric label="记录日平均热量" value={number(data.average?.calories, ' kcal')} />
        <Metric label="范围内最近体重" value={number(data.lastWeight?.value, ' kg')} />
        <Metric label="范围内体重变化" value={data.weightChange === undefined ? '暂无足够数据' : `${data.weightChange > 0 ? '+' : ''}${number(data.weightChange, ' kg')}`} />
      </div>
      <SectionTitle title="身体" />
      {data.weightPoints.length ? <section className="card analytics-section"><h3>体重与 7 日移动平均</h3><p className="muted small">{data.firstWeight?.date} · {number(data.firstWeight?.value, ' kg')} → {data.lastWeight?.date} · {number(data.lastWeight?.value, ' kg')}</p><AnalyticsChart key={`weight-${days}`} title="体重趋势" points={data.weightPoints} unit="kg" secondary="7日平均" /><p className="muted small">仅在实际称重日绘点；平均使用当天及前 6 个自然日内的已有记录，缺失日期不补值。</p></section> : <EmptyState title="所选范围还没有体重记录"><button className="text-button" onClick={() => navigate('/profile/body')}>记录体重</button></EmptyState>}
      <SectionTitle title="训练" />
      {data.count ? <>
        <div className="analytics-metrics"><Metric label="力量 / 有氧" value={`${data.strengthCount} / ${data.cardioCount} 次`} /><Metric label="平均每次时长" value={duration(data.averageMinutes)} /><Metric label="最长一次" value={duration(data.longestMinutes)} /><Metric label="力量总容量" value={number(data.volume, ' kg·次')} /></div>
        <section className="card analytics-section"><h3>训练频率 · 按{data.frequencyUnit}</h3><AnalyticsChart key={`frequency-${days}`} title="训练频率" points={data.frequency} unit="次" bars /></section>
        {data.strengthCount > 0 && <>
          <section className="card analytics-section"><h3>每周训练容量</h3><AnalyticsChart key={`volume-${days}`} title="每周训练容量" points={data.weeklyVolume} unit="kg·次" bars /><p className="muted small">周一为每周起点；边界周仅计所选范围内记录。容量只含未跳过动作中的有效完成力量组。</p></section>
          <section className="card analytics-section"><h3>肌群涉及频率</h3><div className="analytics-muscles">{data.muscles.map(item => <div key={item.name}><span>{item.name}</span><strong>{item.count} 次</strong></div>)}</div><p className="muted small">按完成训练去重计次，仅表示训练涉及频率，不等于刺激量或恢复质量。</p></section>
        </>}
        {data.cardioCount > 0 && <section className="card analytics-section"><h3>有氧 · {data.cardioCount} 次</h3><p>总时长 {duration(data.cardioMinutes)} · 单次平均 {duration(data.cardioAverage)}</p>{data.activityTypes.map(item => <p key={item.activity}>{item.activity} · {item.count} 次 · {duration(item.minutes)}{item.distance === undefined ? ' · 未记录距离' : ` · ${number(item.distance, ' km')}（${item.distanceDays} 次有距离记录）`}</p>)}<p className="muted small">距离按运动类型分别汇总。</p></section>}
      </> : <EmptyState title="所选范围还没有训练数据" />}
      <SectionTitle title="动作表现" />
      {performance ? <section className="card analytics-section"><label className="analytics-select">选择动作<select aria-label="选择动作" value={performance.id} onChange={event => setExerciseId(event.target.value)}>{data.performances.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label><AnalyticsChart key={`${performance.id}-${days}`} title="最佳完成重量" points={performance.history.map(item => ({ date: item.date, value: item.weight }))} unit="kg" /><div className="analytics-table-wrap"><table className="analytics-table"><caption>每次训练的最佳完成组（优先重量，同重量取最高次数）</caption><thead><tr><th>日期</th><th>最佳组</th><th>容量 kg·次</th></tr></thead><tbody>{performance.history.slice().reverse().map(item => <tr key={item.sessionId}><td>{item.date.slice(5)}</td><td>{item.weight}kg × {item.reps}</td><td>{Math.round(item.volume)}</td></tr>)}</tbody></table></div></section> : <EmptyState title="还没有有效的动作完成记录" />}
      <SectionTitle title="营养" />
      {data.average ? <>
        <p className="muted small">{data.recordDays} 个记录日 / {days} 个自然日 · 未记录的日期不视为摄入 0</p>
        <div className="analytics-metrics"><Metric label="记录日平均热量" value={number(data.average.calories, ' kcal/日')} /><Metric label="记录日平均蛋白质" value={number(data.average.protein, ' g/日')} /><Metric label="记录日平均碳水" value={number(data.average.carbs, ' g/日')} /><Metric label="记录日平均脂肪" value={number(data.average.fat, ' g/日')} /></div>
        <section className="card analytics-section"><h3>每日热量</h3><AnalyticsChart key={`calories-${days}`} title="每日热量" points={data.nutritionDays.map(day => ({ date: day.date, value: day.calories }))} unit="kcal" target={data.target.calories} /></section>
        <section className="card analytics-section"><h3>每日蛋白质</h3><AnalyticsChart key={`protein-${days}`} title="每日蛋白质" points={data.nutritionDays.map(day => ({ date: day.date, value: day.protein }))} unit="g" target={data.target.protein} /><p>{data.proteinGoalDays === undefined ? '尚未设置有效蛋白质目标' : `达到当前蛋白质目标：${data.proteinGoalDays} / ${data.recordDays} 天`}</p><p className="muted small">未保存每日目标快照，参考线与达标统计按当前目标计算；修改目标不会改变历史实际摄入。图表只显示有记录的日期。</p></section>
      </> : <EmptyState title="所选范围还没有足够的饮食记录"><button className="text-button" onClick={() => navigate('/nutrition')}>记录饮食</button></EmptyState>}
    </>}
  </div>;
}
