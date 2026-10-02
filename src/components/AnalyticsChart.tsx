import { useState } from 'react';
import type { ChartPoint } from '../services/analytics';

export function AnalyticsChart({ title, points, unit, bars = false, secondary, target }: {
  title: string; points: ChartPoint[]; unit: string; bars?: boolean; secondary?: string; target?: number;
}) {
  const [selected, setSelected] = useState<number>();
  const values = points.flatMap(point => [point.value, ...(point.secondary === undefined ? [] : [point.secondary])]);
  if (target !== undefined && Number.isFinite(target) && target > 0) values.push(target);
  const low = bars ? 0 : Math.min(...values); const high = Math.max(...values, bars ? 1 : low + 1);
  const padding = bars ? 0 : (high - low) * 0.15;
  const minimum = Math.max(0, low - padding); const maximum = high + padding;
  const y = (value: number) => 150 - (value - minimum) / (maximum - minimum) * 126;
  const x = (date: string) => points.length < 2 ? 180 : 48 + (new Date(`${date}T12:00:00`).getTime() - new Date(`${points[0].date}T12:00:00`).getTime()) / (new Date(`${points.at(-1)!.date}T12:00:00`).getTime() - new Date(`${points[0].date}T12:00:00`).getTime() || 1) * 264;
  const path = (useSecondary = false) => points.map((point, index) => `${index ? 'L' : 'M'}${x(point.date)},${y(useSecondary ? point.secondary ?? point.value : point.value)}`).join(' ');
  const active = selected === undefined ? undefined : points[selected];
  return <div className="analytics-chart">
    <span className="muted small">{unit}{secondary ? ` · 浅线为原始记录，绿线为${secondary}` : ''}</span>
    <svg viewBox="0 0 340 190" role="group" aria-label={title}>
      {[minimum, (minimum + maximum) / 2, maximum].map(value => <g key={value}><line x1="48" x2="312" y1={y(value)} y2={y(value)} className="analytics-gridline" /><text x="42" y={y(value) + 4} textAnchor="end">{Number(value.toFixed(1))}</text></g>)}
      {target !== undefined && target > 0 && <line x1="48" x2="312" y1={y(target)} y2={y(target)} className="analytics-target" />}
      {!bars && <path d={path()} className={secondary ? 'analytics-raw-line' : 'analytics-line'} />}
      {secondary && <path d={path(true)} className="analytics-line" />}
      {points.map((point, index) => <g key={point.date + index} role="button" tabIndex={0} aria-label={`${point.date}：${Number(point.value.toFixed(1))}${unit}`} onClick={() => setSelected(index)} onKeyDown={event => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); setSelected(index); } }}>
        {bars ? <rect x={x(point.date) - Math.min(8, 100 / points.length)} y={y(point.value)} width={Math.min(16, 200 / points.length)} height={150 - y(point.value)} rx="2" className="analytics-bar" /> : <circle cx={x(point.date)} cy={y(point.value)} r="3" className="analytics-dot" />}
        <rect x={x(point.date) - 10} y="20" width="20" height="134" fill="transparent" />
      </g>)}
      {points.length > 0 && <><text x="48" y="178">{points[0].date.slice(5)}</text><text x="312" y="178" textAnchor="end">{points.at(-1)!.date.slice(5)}</text></>}
    </svg>
    <select className="analytics-date-select" aria-label={`${title}日期`} value={selected ?? ''} onChange={event => setSelected(event.target.value === '' ? undefined : Number(event.target.value))}>
      <option value="">选择日期查看数值</option>{points.map((point, index) => <option key={point.date + index} value={index}>{point.date} · {Number(point.value.toFixed(1))} {unit}</option>)}
    </select>
    <div className="analytics-chart-readout" aria-live="polite">{active ? `${active.date} · ${Number(active.value.toFixed(1))} ${unit}${active.secondary === undefined ? '' : ` · ${secondary} ${Number(active.secondary.toFixed(1))} ${unit}`}` : '点选图表或选择日期查看数值'}{target !== undefined && target > 0 && <small>虚线：当前目标 {target} {unit}</small>}</div>
  </div>;
}
