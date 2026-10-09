import assert from 'node:assert/strict';
import { pathToFileURL } from 'node:url';
const { chromium, webkit } = await import(process.argv[2] ? pathToFileURL(process.argv[2]).href : 'playwright');
const engine = process.env.WORKOUT_BROWSER === 'webkit' ? webkit : chromium;
const browser = await engine.launch(engine === chromium ? { channel: 'chrome', headless: true } : { headless: true });
const base = process.env.WORKOUT_TEST_URL ?? 'http://127.0.0.1:5173';
let checks = 0;
function check(value, message) { assert(value, message); checks++; }
async function record(page, id = 'record-today') {
  return page.evaluate(async id => {
    const db = await new Promise(resolve => { const request = indexedDB.open('FitFlowDB'); request.onsuccess = () => resolve(request.result); });
    try { return await new Promise(resolve => { const request = db.transaction('workoutSessions').objectStore('workoutSessions').get(id); request.onsuccess = () => resolve(request.result); }); } finally { db.close(); }
  }, id);
}
try {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, timezoneId: 'Asia/Shanghai' });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto(`${base}/home`);
  await page.locator('.hero-card').waitFor();
  check(await page.getByRole('button', { name: '修改今日训练记录', exact: true }).count() === 0, 'no editor without completed workout');
  const today = await page.evaluate(async () => (await import('/src/utils/format.ts')).dateKey(new Date()));
  const original = await page.evaluate(async today => {
    const endedAt = Date.now() - 1000;
    const session = { id: 'record-today', status: 'completed', startedAt: endedAt - 1800000, endedAt, workoutDayName: '今日记录验收', currentExerciseIndex: 0, exercises: [
      { id: 'exercise-a', exerciseId: 'a', name: '卧推', muscle: '胸', category: '力量', restSeconds: 90, skipped: false, sets: [{ id: 'set-a1', weight: 20, reps: 10, completed: true, completedAt: endedAt - 10000 }, { id: 'set-a2', weight: 30, reps: 12, completed: false }] },
      { id: 'exercise-b', exerciseId: 'b', name: '划船', muscle: '背', category: '力量', restSeconds: 60, skipped: false, sets: [{ id: 'set-b1', weight: 10, reps: 8, completed: true, completedAt: endedAt - 5000 }] }
    ] };
    const db = await new Promise(resolve => { const request = indexedDB.open('FitFlowDB'); request.onsuccess = () => resolve(request.result); });
    await new Promise(resolve => {
      const tx = db.transaction(['workoutSessions', 'dailySchedules'], 'readwrite');
      tx.objectStore('workoutSessions').put(session);
      tx.objectStore('workoutSessions').put({ ...session, id: 'record-past', startedAt: session.startedAt - 86400000, endedAt: endedAt - 86400000 });
      tx.objectStore('dailySchedules').put({ id: today, date: today, type: 'strength', status: 'completed', workoutSessionId: session.id, updatedAt: endedAt, note: '保留备注', workoutTemplate: { workoutDayName: session.workoutDayName, exercises: [] } });
      tx.oncomplete = resolve;
    }); db.close(); return session;
  }, today);
  await page.reload();
  await page.getByRole('button', { name: '修改今日训练记录', exact: true }).click();
  const modal = page.locator('.modal-backdrop');
  const weight = modal.getByRole('textbox', { name: '卧推第 1 组重量', exact: true });
  const reps = modal.getByRole('spinbutton', { name: '卧推第 1 组次数', exact: true });
  const save = modal.getByRole('button', { name: '保存修改', exact: true });
  if (process.env.WORKOUT_RECORD_SCREENSHOT) await page.screenshot({ path: process.env.WORKOUT_RECORD_SCREENSHOT });
  await weight.fill('25');
  await modal.getByRole('button', { name: '取消', exact: true }).click();
  check(JSON.stringify(await record(page)) === JSON.stringify(original), 'cancel leaves stored record unchanged');
  await page.getByRole('button', { name: '修改今日训练记录', exact: true }).click();
  await weight.fill(''); await save.click();
  await page.getByRole('status').filter({ hasText: '重量需不小于 0' }).waitFor();
  check(JSON.stringify(await record(page)) === JSON.stringify(original), 'empty weight rejected');
  await weight.fill('-1'); await save.click();
  check(JSON.stringify(await record(page)) === JSON.stringify(original), 'negative weight rejected');
  await weight.fill('25'); await reps.fill('0'); await save.click();
  check(JSON.stringify(await record(page)) === JSON.stringify(original), 'zero reps rejected');
  await reps.fill('8');
  await modal.getByRole('checkbox', { name: '卧推第 1 组完成', exact: true }).uncheck();
  await modal.getByRole('checkbox', { name: '卧推第 2 组完成', exact: true }).check();
  check(await weight.evaluate(el => parseFloat(getComputedStyle(el).fontSize)) >= 16, 'weight font at least 16px');
  await page.setViewportSize({ width: 320, height: 700 });
  check(await modal.evaluate(el => el.scrollWidth <= el.clientWidth), 'narrow editor does not overflow');
  await save.click();
  await modal.waitFor({ state: 'hidden' });
  const edited = await record(page);
  check(edited.status === 'completed' && !edited.restTimer && edited.startedAt === original.startedAt && edited.endedAt === original.endedAt, 'edit does not reopen or change timing');
  check(edited.exercises[0].sets[0].weight === 25 && edited.exercises[0].sets[0].reps === 8 && !edited.exercises[0].sets[0].completed && !edited.exercises[0].sets[0].completedAt, 'weight reps and incomplete status saved');
  check(edited.exercises[0].sets[1].completed && edited.exercises[0].sets[1].completedAt === original.endedAt, 'new completion uses original workout end time');
  check(JSON.stringify(edited.exercises[1]) === JSON.stringify(original.exercises[1]), 'other exercise unchanged');
  check((await record(page, 'record-past')).endedAt === original.endedAt - 86400000, 'past record unchanged');
  await page.waitForFunction(() => document.querySelector('.home-volume')?.textContent.includes('440'));
  check(true, 'home volume refreshes');
  await page.goto(`${base}/history/${today}`);
  await page.getByRole('button', { name: '修改今日训练记录', exact: true }).waitFor();
  check((await page.locator('.day-metrics').innerText()).includes('440'), 'day metrics refresh');
  await page.getByRole('button', { name: '修改今日训练记录', exact: true }).click();
  check(await weight.inputValue() === '25', 'day editor restores saved values');
  await modal.getByRole('button', { name: '取消', exact: true }).click();
  await page.getByRole('button', { name: '查看训练报告', exact: true }).click();
  await page.getByRole('heading', { name: '训练完成', exact: true }).waitFor();
  check((await page.locator('.report-stats').innerText()).includes('440'), 'report recalculates volume');
  const blocked = await page.evaluate(async () => {
    const { updateTodayWorkoutRecord } = await import('/src/services/workoutRecordService.ts');
    try { await updateTodayWorkoutRecord('record-past', [{ id: 'set-a1', weight: 1, reps: 1, completed: true }]); return false; } catch { return true; }
  });
  check(blocked, 'service rejects past workouts');
  const stale = await page.evaluate(async () => {
    const { updateTodayWorkoutRecord } = await import('/src/services/workoutRecordService.ts');
    try { await updateTodayWorkoutRecord('record-today', [{ id: 'set-a1', weight: 99, reps: 1, completed: true }]); return false; } catch { return true; }
  });
  check(stale && JSON.stringify(await record(page)) === JSON.stringify(edited), 'stale partial edits roll back atomically');

  const missing = await page.evaluate(async () => {
    const { updateTodayWorkoutRecord } = await import('/src/services/workoutRecordService.ts');
    try { await updateTodayWorkoutRecord('missing', []); return false; } catch { return true; }
  });
  check(missing, 'service rejects missing workout');
  await page.evaluate(async () => {
    const { db } = await import('/src/db/db.ts');
    const session = await db.workoutSessions.get('record-today');
    await db.workoutSessions.put({ ...session, id: 'record-active', status: 'in_progress', endedAt: undefined });
  });
  const activeBefore = await record(page, 'record-active');
  const activeBlocked = await page.evaluate(async () => {
    const { updateTodayWorkoutRecord } = await import('/src/services/workoutRecordService.ts');
    try { await updateTodayWorkoutRecord('record-active', []); return false; } catch { return true; }
  });
  check(activeBlocked && JSON.stringify(await record(page, 'record-active')) === JSON.stringify(activeBefore), 'active workout rejected without mutation');
  await page.goto(`${base}/history/${today}`);
  await page.getByRole('button', { name: '修改今日训练记录', exact: true }).waitFor();
  check(await page.getByRole('button', { name: '修改今日训练记录', exact: true }).count() === 1, 'no edit entry for active workout');
  check(errors.length === 0, `no browser errors: ${errors.join(', ')}`);
  console.log(`Workout record checks passed: ${checks} (${process.env.WORKOUT_BROWSER ?? 'chromium'})`);
  await context.close();
} finally { await browser.close(); }
