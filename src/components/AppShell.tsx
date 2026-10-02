import { NavLink, useLocation } from 'react-router';
import type { ReactNode } from 'react';

const tabs = [
  { to: '/home', label: '首页', icon: '⌂' },
  { to: '/workout', label: '训练', icon: '↗' },
  { to: '/nutrition', label: '饮食', icon: '＋' },
  { to: '/history', label: '日历', icon: '▦' },
  { to: '/profile', label: '我的', icon: '◉' }
];

export function AppShell({ children }: { children: ReactNode }) {
  const location = useLocation();
  const hideTabs = location.pathname.startsWith('/workout/session/');
  return (
    <div className="app-shell">
      <main className={hideTabs ? 'app-main session-main' : 'app-main'}>{children}</main>
      {!hideTabs && <nav className="tab-bar" aria-label="主导航">
        {tabs.map(tab => <NavLink key={tab.to} to={tab.to} className={({ isActive }) => `tab-item${isActive ? ' active' : ''}`}>
          <span className="tab-icon" aria-hidden="true">{tab.icon}</span><span>{tab.label}</span>
        </NavLink>)}
      </nav>}
    </div>
  );
}
