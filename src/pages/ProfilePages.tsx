import { useState } from 'react';
import type { ChangeEvent } from 'react';
import { useNavigate } from 'react-router';
import { mockUser } from '../data/mock';
import { dateKey } from '../utils/format';
import { useAsyncData } from '../hooks/useAsyncData';
import { deleteBodyRecord, listBodyRecords, saveBodyRecord } from '../repositories/bodyRecordRepository';
import { getNutritionTarget, getSettings, saveNutritionTarget, saveSettings } from '../repositories/settingsRepository';
import { backupCounts, clearLocalData, createBackup, parseBackup, restoreBackup } from '../services/backupService';
import { BackHeader, EmptyState, Modal, SectionTitle, useToast } from '../components/UI';
import type { FitFlowBackup, StoredAppSettings, StoredNutritionTarget } from '../types';

export function ProfilePage() {
  const navigate = useNavigate();
  const { data, loading } = useAsyncData(async () => {
    const [records, target, settings] = await Promise.all([listBodyRecords(), getNutritionTarget(), getSettings()]);
    const latest = records[0];
    const height = latest?.height;
    const weight = latest?.weight;
    return { records, target, settings, weight, height, bmi: height && weight ? (weight / Math.pow(height / 100, 2)).toFixed(1) : '—' };
  });
  if (loading || !data) return <div className="page"><div className="loading-state"><span className="spinner" />正在读取个人数据…</div></div>;
  return <div className="page mine-page">
    <div className="profile-card card"><div className="profile-avatar">{data.settings.user.avatarText || mockUser.avatarText}</div><div className="profile-copy"><strong className="profile-name">{data.settings.user.name || mockUser.name}</strong><span className="profile-goal">{data.settings.user.goal || '训练与饮食记录'}</span></div><span className="profile-chevron">›</span></div>
    <section className="section">
      <SectionTitle title="身体数据" action="查看全部　›" onAction={() => navigate('/profile/body')} />
      <button className="body-summary card" onClick={() => navigate('/profile/body')}>
        <span><strong className="summary-number">{data.weight ?? '—'}{data.weight !== undefined && <small className="summary-unit">kg</small>}</strong><small className="summary-label">体重</small></span><span className="summary-separator" />
        <span><strong className="summary-number">{data.height ?? '—'}{data.height !== undefined && <small className="summary-unit">cm</small>}</strong><small className="summary-label">身高</small></span><span className="summary-separator" />
        <span><strong className="summary-number">{data.bmi}</strong><small className="summary-label">BMI</small></span>
      </button>
    </section>
    <section className="section">
      <div className="section-head"><h2 className="section-title">每日营养目标</h2><span className="muted small">{data.target.calories} kcal</span></div>
      <div className="target-row card"><span>蛋白质</span><strong>{data.target.protein}g</strong><span>碳水</span><strong>{data.target.carbs}g</strong><span>脂肪</span><strong>{data.target.fat}g</strong></div>
    </section>
    <section className="section menu-card card">
      <button className="menu-item" onClick={() => navigate('/profile/settings')}><span className="menu-icon green">⚙</span><span>训练设置</span><span className="menu-chevron">›</span></button>
      <button className="menu-item" onClick={() => navigate('/profile/data')}><span className="menu-icon blue">▤</span><span>数据管理</span><span className="menu-chevron">›</span></button>
      <button className="menu-item" onClick={() => window.alert('个人使用版暂未连接意见反馈服务。')}><span className="menu-icon orange">✎</span><span>意见反馈</span><span className="menu-chevron">›</span></button>
      <button className="menu-item" onClick={() => window.alert('FitFlow · 本地训练与饮食记录')}><span className="menu-icon gray">i</span><span>关于 FitFlow</span><span className="menu-chevron">›</span></button>
    </section>
    <div className="version">FitFlow · Web / PWA</div>
  </div>;
}

export function BodyDataPage() {
  const toast = useToast();
  const { data, loading, refresh } = useAsyncData(async () => listBodyRecords());
  const latest = data?.[0];
  const [weight, setWeight] = useState<string>();
  const [height, setHeight] = useState<string>();
  const weightInput = weight ?? String(latest?.weight ?? 70.2);
  const heightInput = height ?? String(latest?.height ?? 175);
  const weightValue = Number(weightInput);
  const heightValue = Number(heightInput);
  const validBodyValues = weightInput.trim() !== '' && heightInput.trim() !== '' && Number.isFinite(weightValue) && Number.isFinite(heightValue) && weightValue > 0 && heightValue > 0;
  const bmi = validBodyValues ? weightValue / Math.pow(heightValue / 100, 2) : undefined;

  async function save() {
    if (!validBodyValues) { toast('请填写大于 0 的体重和身高'); return; }
    await saveBodyRecord({ date: dateKey(new Date()), weight: weightValue, height: heightValue });
    await refresh();
    toast('身体数据已保存');
  }

  async function removeRecord(date: string) {
    if (!window.confirm(`删除 ${date} 的身体数据？此操作无法撤销。`)) return;
    try {
      await deleteBodyRecord(date);
      setWeight(undefined);
      setHeight(undefined);
      await refresh();
      toast('身体数据已删除');
    } catch (error) { toast(error instanceof Error ? error.message : '删除身体数据失败'); }
  }

  return <div className="page">
    <BackHeader title="身体数据" subtitle="记录会保存在本机" />
    <section className="card body-form">
      <label className="field-label">体重（kg）<input className="text-input" type="number" inputMode="decimal" step="0.1" min="1" value={weightInput} onChange={event => setWeight(event.target.value)} /></label>
      <label className="field-label">身高（cm）<input className="text-input" type="number" inputMode="decimal" step="0.1" min="1" value={heightInput} onChange={event => setHeight(event.target.value)} /></label>
      <div className="bmi-card"><span>BMI</span><strong>{bmi?.toFixed(1) ?? '—'}</strong><small>{bmi === undefined ? '填写体重和身高后计算' : bmi < 18.5 ? '偏轻' : bmi < 24 ? '健康范围' : bmi < 28 ? '偏重' : '肥胖'}</small></div>
      <button className="primary-button full-button" onClick={() => void save()}>保存今日数据</button>
    </section>
    <section className="section">
      <SectionTitle title="历史记录" />
      {loading && <div className="muted small">读取中…</div>}
      {data?.length === 0 && <EmptyState title="还没有身体数据记录">保存今日身体数据后，记录会显示在这里。</EmptyState>}
      {data?.map(record => <div className="body-record card" key={record.date}><span>{record.date}</span><strong>{record.weight} kg</strong><span className="muted small">身高 {record.height} cm</span><button className="history-delete" aria-label={`删除${record.date}的身体数据`} onClick={() => void removeRecord(record.date)}>删除</button></div>)}
    </section>
  </div>;
}

export function SettingsPage() {
  const toast = useToast();
  const { data, loading, setData } = useAsyncData(async () => {
    const [settings, target] = await Promise.all([getSettings(), getNutritionTarget()]);
    return { settings, target };
  });
  const [targetDraft, setTargetDraft] = useState<Partial<Record<'calories' | 'protein' | 'carbs' | 'fat', string>>>({});
  const [restDraft, setRestDraft] = useState<string>();
  if (loading || !data) return <div className="page"><div className="loading-state"><span className="spinner" />正在读取设置…</div></div>;
  const currentData = data;
  const currentTarget = {
    calories: targetDraft.calories ?? String(currentData.target.calories),
    protein: targetDraft.protein ?? String(currentData.target.protein),
    carbs: targetDraft.carbs ?? String(currentData.target.carbs),
    fat: targetDraft.fat ?? String(currentData.target.fat)
  };
  const restInput = restDraft ?? String(currentData.settings.trainingSettings.defaultRestSeconds);

  async function updateSettings(change: Partial<StoredAppSettings['trainingSettings']>) {
    const settings: StoredAppSettings = { ...currentData.settings, trainingSettings: { ...currentData.settings.trainingSettings, ...change } };
    await saveSettings(settings);
    setData(current => current ? { ...current, settings } : current);
  }
  async function saveTarget() {
    if (Object.values(currentTarget).some(value => !value.trim() || !Number.isFinite(Number(value)) || Number(value) < 0)) { toast('请完整填写营养目标，数值不能小于 0'); return; }
    const target: StoredNutritionTarget = { id: 'current', calories: Number(currentTarget.calories), protein: Number(currentTarget.protein), carbs: Number(currentTarget.carbs), fat: Number(currentTarget.fat) };
    await saveNutritionTarget(target);
    setData(current => current ? { ...current, target } : current);
    setTargetDraft(current => current === targetDraft ? {} : current);
    toast('营养目标已保存');
  }

  function adjustRestDraft(delta: number) {
    const value = restInput.trim() ? Number(restInput) : currentData.settings.trainingSettings.defaultRestSeconds;
    setRestDraft(String(Math.max(30, Math.min(600, value + delta))));
  }

  async function saveRest() {
    const defaultRestSeconds = Number(restInput);
    if (!restInput.trim() || !Number.isInteger(defaultRestSeconds) || defaultRestSeconds < 30 || defaultRestSeconds > 600) { toast('默认休息时间需为 30–600 秒的整数'); return; }
    await updateSettings({ defaultRestSeconds });
    setRestDraft(current => current === restDraft ? undefined : current);
    toast('默认休息时间已保存');
  }

  return <div className="page">
    <BackHeader title="训练设置" subtitle="调整计时与每日目标" />
    <section className="section">
      <SectionTitle title="训练偏好" />
      <div className="settings-card card">
        <div className="setting-row rest-setting-row"><div><strong>默认休息时间</strong><small>每个动作仍可单独设置</small></div><div className="rest-setting-controls"><div className="setting-stepper"><button aria-label="减少默认休息时间 15 秒" onClick={() => adjustRestDraft(-15)}>−</button><input className="text-input" aria-label="默认休息时间（秒）" type="number" inputMode="numeric" min="30" max="600" step="1" value={restInput} onChange={event => setRestDraft(event.target.value)} /><span className="small muted">秒</span><button aria-label="增加默认休息时间 15 秒" onClick={() => adjustRestDraft(15)}>＋</button></div><button className="text-button" onClick={() => void saveRest()}>保存休息时间</button></div></div>
        <label className="setting-row"><span><strong>完成一组后自动休息</strong><small>休息结束时间会持久化</small></span><input type="checkbox" checked={data.settings.trainingSettings.autoRestTimer} onChange={event => void updateSettings({ autoRestTimer: event.target.checked })} /></label>
        <label className="setting-row"><span><strong>休息结束震动</strong><small>浏览器支持时轻微震动</small></span><input type="checkbox" checked={data.settings.trainingSettings.vibrationEnabled} onChange={event => void updateSettings({ vibrationEnabled: event.target.checked })} /></label>
        <label className="setting-row"><span><strong>休息结束提示音</strong><small>浏览器版本暂不播放声音</small></span><input type="checkbox" checked={data.settings.trainingSettings.soundEnabled} onChange={event => void updateSettings({ soundEnabled: event.target.checked })} /></label>
      </div>
    </section>
    <section className="section">
      <SectionTitle title="每日营养目标" />
      <div className="card target-form">
        {([['calories', '热量', 'kcal'], ['protein', '蛋白质', 'g'], ['carbs', '碳水', 'g'], ['fat', '脂肪', 'g']] as const).map(([key, label, unit]) => <label className="target-input-row" key={key}><span>{label}</span><input className="text-input" type="number" inputMode="decimal" min="0" step="any" value={currentTarget[key]} onChange={event => setTargetDraft(current => ({ ...current, [key]: event.target.value }))} /><span>{unit}</span></label>)}
        <button className="secondary-button full-button" onClick={() => void saveTarget()}>保存每日营养目标</button>
      </div>
    </section>
  </div>;
}

export function DataManagementPage() {
  const toast = useToast();
  const [backup, setBackup] = useState<FitFlowBackup>();
  const [fileName, setFileName] = useState('');
  const [busy, setBusy] = useState(false);
  const [confirmImport, setConfirmImport] = useState(false);

  async function exportData() {
    setBusy(true);
    try {
      const backupFile = await createBackup();
      const name = `FitFlow_Backup_${dateKey(new Date())}.json`;
      const file = new File([JSON.stringify(backupFile, null, 2)], name, { type: 'application/json' });
      let shared = false;
      if (navigator.canShare?.({ files: [file] }) && navigator.share) {
        try {
          await navigator.share({ title: 'FitFlow 数据备份', files: [file] });
          shared = true;
        } catch (error) {
          if (error instanceof DOMException && error.name === 'AbortError') return;
        }
      }
      if (!shared) {
        const url = URL.createObjectURL(file);
        const link = document.createElement('a');
        link.href = url;
        link.download = name;
        link.click();
        window.setTimeout(() => URL.revokeObjectURL(url), 1000);
      }
      toast('备份文件已导出');
    } catch (error) { toast(error instanceof Error ? error.message : '导出失败'); }
    finally { setBusy(false); }
  }

  async function onChooseBackup(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    setFileName(file.name);
    try { setBackup(parseBackup(await file.text())); }
    catch (error) { setBackup(undefined); toast(error instanceof Error ? error.message : '备份文件无效'); }
    event.target.value = '';
  }

  async function importData() {
    if (!backup) return;
    setBusy(true);
    try { await restoreBackup(backup); setBackup(undefined); setFileName(''); setConfirmImport(false); toast('数据已恢复'); }
    catch (error) { toast(error instanceof Error ? error.message : '恢复失败'); }
    finally { setBusy(false); }
  }

  async function clearData() {
    if (!window.confirm('这会删除本机所有训练计划、训练记录、日历安排、饮食、身体数据和设置，并重新创建示例数据。请先导出备份。继续吗？')) return;
    if (!window.confirm('再次确认：清空后无法从本机找回原数据。')) return;
    setBusy(true);
    try { await clearLocalData(); setBackup(undefined); setFileName(''); toast('本机数据已清理'); }
    catch (error) { toast(error instanceof Error ? error.message : '清理失败'); }
    finally { setBusy(false); }
  }

  return <div className="page">
    <BackHeader title="数据管理" subtitle="备份存放在你选择的位置" />
    <section className="card data-management-card">
      <div className="data-icon">⇩</div><h2>导出全部数据</h2><p>导出版本 3 JSON，包含训练、日历、饮食记录及快照、食物资料、收藏、最近记录、身体记录、营养目标和设置。</p>
      <button className="primary-button full-button" disabled={busy} onClick={() => void exportData()}>{busy ? '处理中…' : '导出全部数据'}</button>
    </section>
    <section className="section card data-management-card">
      <div className="data-icon import-icon">⇧</div><h2>导入备份</h2><p>先验证版本与内容，再显示恢复数量；确认后以备份替换当前本地数据。</p>
      <label className="secondary-button file-picker">选择 FitFlow JSON 文件<input type="file" accept="application/json,.json" onChange={event => void onChooseBackup(event)} /></label>
      {backup && <div className="backup-preview"><strong>{fileName || 'FitFlow 备份'}</strong><span>备份版本 {backup.sourceVersion ?? backup.version} · 导出于 {backup.exportedAt || '未知时间'}</span><span>{backupCounts(backup).plans} 个计划 · {backupCounts(backup).sessions} 次训练 · {backupCounts(backup).schedules} 个日历安排</span><span>{backupCounts(backup).meals} 条饮食 · {backupCounts(backup).foods} 种食物 · {backupCounts(backup).favorites} 个常吃</span><span>{backupCounts(backup).bodyRecords} 条身体记录</span><button className="primary-button full-button" disabled={busy} onClick={() => setConfirmImport(true)}>继续恢复数据</button></div>}
    </section>
    {backup && confirmImport && <Modal title="确认恢复备份" onClose={() => setConfirmImport(false)}>
      <p className="muted">将恢复 {backupCounts(backup).plans} 个训练计划、{backupCounts(backup).sessions} 次训练、{backupCounts(backup).schedules} 个日历安排、{backupCounts(backup).meals} 条饮食、{backupCounts(backup).foods} 种食物、{backupCounts(backup).favorites} 个常吃和 {backupCounts(backup).bodyRecords} 条身体记录。恢复后，当前本地数据会被备份内容替换。</p>
      <button className="primary-button full-button" disabled={busy} onClick={() => void importData()}>{busy ? '恢复中…' : '替换本地数据并恢复'}</button>
      <button className="secondary-button full-button" disabled={busy} onClick={() => setConfirmImport(false)}>返回</button>
    </Modal>}
    <section className="section card clear-data-card">
      <h2>清理本机数据</h2><p>清除本机记录并重新初始化训练示例与食物库；不会自动生成饮食记录。请先导出备份。</p><button className="danger-button" disabled={busy} onClick={() => void clearData()}>清理本机数据</button>
    </section>
    <p className="muted small backup-note">备份文件只保存在你的设备或所选目录中；FitFlow 不会上传数据。</p>
  </div>;
}
