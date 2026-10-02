import { createContext, useCallback, useContext, useState } from 'react';
import type { FormEvent, ReactNode } from 'react';
import { useNavigate } from 'react-router';

const ToastContext = createContext<(message: string) => void>(() => undefined);

export function ToastProvider({ children }: { children: ReactNode }) {
  const [message, setMessage] = useState('');
  const toast = useCallback((value: string) => {
    setMessage(value);
    window.setTimeout(() => setMessage(current => current === value ? '' : current), 2400);
  }, []);
  return <ToastContext.Provider value={toast}>{children}{message && <div className="toast" role="status">{message}</div>}</ToastContext.Provider>;
}

export function useToast() {
  return useContext(ToastContext);
}

export function PageHeader({ eyebrow, title, subtitle }: { eyebrow?: string; title: string; subtitle?: string }) {
  return <header className="page-header">
    {eyebrow && <div className="eyebrow">{eyebrow}</div>}
    <h1 className="page-title">{title}</h1>
    {subtitle && <p className="page-subtitle">{subtitle}</p>}
  </header>;
}

export function BackHeader({ title, subtitle }: { title: string; subtitle?: string }) {
  const navigate = useNavigate();
  return <div className="back-header">
    <button className="back-button" onClick={() => navigate(-1)} aria-label="返回">‹</button>
    <div><h1 className="page-title">{title}</h1>{subtitle && <p className="page-subtitle">{subtitle}</p>}</div>
  </div>;
}

export function SectionTitle({ title, action, onAction }: { title: string; action?: string; onAction?: () => void }) {
  return <div className="section-head"><h2 className="section-title">{title}</h2>{action && <button className="section-action" onClick={onAction}>{action}</button>}</div>;
}

export function ProgressRow({ label, value, target, unit }: { label: string; value: number; target: number; unit: string }) {
  const percent = target > 0 ? Math.min(100, Math.round(value / target * 100)) : 0;
  const displayValue = unit === 'g' ? Number(value.toFixed(1)) : Math.round(value);
  return <div className="nutri-item">
    <div className="row-between nutri-head"><span>{label}</span><span><strong className="nutri-value">{displayValue}</strong><span className="nutri-target"> / {target}{unit}</span></span></div>
    <div className="progress-track"><div className="progress-fill" style={{ width: `${percent}%` }} /></div>
  </div>;
}

export function EmptyState({ title, children }: { title: string; children?: ReactNode }) {
  return <div className="card empty-state"><strong className="empty-title">{title}</strong>{children && <span>{children}</span>}</div>;
}

export function Modal({ title, onClose, children, onSubmit, submitLabel = '保存' }: {
  title: string; onClose: () => void; children: ReactNode; onSubmit?: (event: FormEvent<HTMLFormElement>) => void; submitLabel?: string;
}) {
  const content = <>
    <div className="modal-head"><h2>{title}</h2><button className="icon-button" type="button" onClick={onClose} aria-label="关闭">×</button></div>
    {children}
  </>;
  return <div className="modal-backdrop" onMouseDown={event => { if (event.target === event.currentTarget) onClose(); }}>
    {onSubmit
      ? <form className="modal-sheet" onSubmit={onSubmit}>{content}<button className="primary-button modal-submit">{submitLabel}</button></form>
      : <section className="modal-sheet">{content}</section>}
  </div>;
}

export function LoadingState() {
  return <div className="loading-state"><span className="spinner" />正在读取本地数据…</div>;
}

export function ErrorState({ message }: { message: string }) {
  return <div className="card error-state">{message}</div>;
}

export function todayLabel(date = new Date()) {
  return new Intl.DateTimeFormat('zh-CN', { month: 'long', day: 'numeric', weekday: 'long' }).format(date);
}
