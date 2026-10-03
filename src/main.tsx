import { StrictMode, useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter, Navigate, Route, Routes } from 'react-router';
import { AppShell } from './components/AppShell';
import { ErrorState, LoadingState, ToastProvider } from './components/UI';
import { initializeDatabase } from './db/seed';
import { HomePage } from './pages/HomePage';
import { WorkoutPage } from './pages/WorkoutPage';
import { PlanEditorPage } from './pages/PlanEditorPage';
import { DietPage, AddMealPage, FoodPhotoPage } from './pages/NutritionPages';
import { HistoryPage, DayDetailPage } from './pages/HistoryPages';
import { ProfilePage, BodyDataPage, SettingsPage, DataManagementPage } from './pages/ProfilePages';
import { SessionPage, WorkoutReportPage } from './pages/WorkoutSessionPages';
import './styles.css';

function App() {
  const [ready, setReady] = useState(false);
  const [error, setError] = useState('');
  useEffect(() => {
    void initializeDatabase().then(() => setReady(true)).catch(reason => setError(reason instanceof Error ? reason.message : '本地数据库初始化失败'));
  }, []);
  if (error) return <div className="app-shell boot-error"><ErrorState message={`FitFlow 无法打开本地数据库：${error}`} /></div>;
  if (!ready) return <div className="app-shell"><LoadingState /></div>;
  return <BrowserRouter basename={import.meta.env.BASE_URL}>
    <AppShell>
      <Routes>
        <Route path="/" element={<Navigate to="/home" replace />} />
        <Route path="/home" element={<HomePage />} />
        <Route path="/workout" element={<WorkoutPage />} />
        <Route path="/workout/plans/:planId" element={<PlanEditorPage />} />
        <Route path="/workout/session/:sessionId" element={<SessionPage />} />
        <Route path="/workout/report/:sessionId" element={<WorkoutReportPage />} />
        <Route path="/nutrition" element={<DietPage />} />
        <Route path="/nutrition/add/:type" element={<AddMealPage />} />
        <Route path="/nutrition/photo/:type" element={<FoodPhotoPage />} />
        <Route path="/history" element={<HistoryPage />} />
        <Route path="/history/:date" element={<DayDetailPage />} />
        <Route path="/profile" element={<ProfilePage />} />
        <Route path="/profile/body" element={<BodyDataPage />} />
        <Route path="/profile/settings" element={<SettingsPage />} />
        <Route path="/profile/data" element={<DataManagementPage />} />
        <Route path="*" element={<Navigate to="/home" replace />} />
      </Routes>
    </AppShell>
  </BrowserRouter>;
}

createRoot(document.getElementById('root')!).render(
  <StrictMode><ToastProvider><App /></ToastProvider></StrictMode>
);
