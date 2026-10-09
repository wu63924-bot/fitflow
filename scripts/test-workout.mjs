import assert from 'node:assert/strict';
import { pathToFileURL } from 'node:url';
import { readFileSync } from 'node:fs';
import { stripTypeScriptTypes } from 'node:module';

// Use installed Playwright, or supply its index.mjs path as the first argument.
const { chromium, webkit } = await import(process.argv[2] ? pathToFileURL(process.argv[2]).href : 'playwright');
const engine = process.env.WORKOUT_BROWSER === 'webkit' ? webkit : chromium;
const browser = await engine.launch(engine === chromium ? { channel: 'chrome', headless: true } : { headless: true });
const base = process.env.WORKOUT_TEST_URL ?? 'http://127.0.0.1:5173';
let assertions = 0;
function check(value, message) { assert(value, message); assertions++; }

async function stored(page) {
  return page.evaluate(async () => {
    const db = await new Promise((resolve, reject) => { const request = indexedDB.open('FitFlowDB'); request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error); });
    try { return await new Promise((resolve, reject) => { const request = db.transaction('workoutSessions').objectStore('workoutSessions').get('test-session'); request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error); }); }
    finally { db.close(); }
  });
}

try {
  for (const permission of ['unsupported', 'denied', 'default']) {
    const context = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
    const page = await context.newPage();
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.addInitScript(mode => {
      window.permissionRequests = 0;
      Object.defineProperty(window, 'Notification', { configurable: true, value: mode === 'unsupported' ? undefined : class {
        static permission = mode;
        static async requestPermission() { window.permissionRequests++; this.permission = 'denied'; return 'denied'; }
      } });
    }, permission);
    await page.goto(`${base}/home`);
    await page.locator('.tab-bar').waitFor();
    const session = { id: 'test-session', status: 'in_progress', startedAt: Date.now() - 65000, workoutDayName: '体验测试训练', currentExerciseIndex: 0,
      exercises: ['动作 A', '动作 B'].map((name, index) => ({ id: `exercise-${index}`, exerciseId: `definition-${index}`, name, muscle: '胸', category: '力量', restSeconds: 30, skipped: false,
        sets: [0, 1].map(i => ({ id: `set-${index}-${i}`, weight: index ? 40 : 0, reps: 10, completed: false })) })) };
    await page.evaluate(async session => {
      const db = await new Promise(resolve => { const request = indexedDB.open('FitFlowDB'); request.onsuccess = () => resolve(request.result); });
      await new Promise((resolve, reject) => { const tx = db.transaction('workoutSessions', 'readwrite'); tx.objectStore('workoutSessions').put(session); tx.oncomplete = resolve; tx.onerror = () => reject(tx.error); }); db.close();
    }, session);
    await page.goto(`${base}/workout/session/test-session`);
    const weight = page.getByRole('textbox', { name: '重量（公斤）' }).first();
    await weight.waitFor();
    check(await page.evaluate(() => window.permissionRequests) === 0, 'no permission on entering training');
    await weight.tap();
    await page.waitForFunction(() => { const el = document.querySelector('.set-input'); return !el.dataset.selectOnClick && el.selectionStart === 0 && el.selectionEnd === el.value.length; });
    await page.keyboard.type('20');
    check(await weight.inputValue() === '20', 'selected zero replaced with 20');
    await weight.fill('40'); await weight.blur(); await weight.tap();
    await page.waitForFunction(() => { const el = document.querySelector('.set-input'); return !el.dataset.selectOnClick && el.selectionStart === 0 && el.selectionEnd === el.value.length; });
    await page.keyboard.type('50');
    check(await weight.inputValue() === '50', 'selected existing weight replaced');
    await weight.fill(''); await weight.blur();
    check(await weight.inputValue() === '0', 'blank blur normalizes to zero');
    await page.getByRole('button', { name: '增加 2 公斤', exact: true }).first().click();
    check(await weight.inputValue() === '2', 'weight increases by two');
    await page.getByRole('button', { name: '减少 2 公斤', exact: true }).first().click();
    await page.getByRole('button', { name: '减少 2 公斤', exact: true }).first().click();
    check(await weight.inputValue() === '0', 'weight decreases by two and clamps to zero');
    await weight.fill('20.1'); await page.getByRole('button', { name: '增加 2 公斤', exact: true }).first().click();
    check(await weight.inputValue() === '22.1', 'fractional weight remains stable');
    const reps = page.getByRole('spinbutton', { name: '次数', exact: true }).first();
    await reps.focus();
    await page.getByRole('button', { name: '增加 1 次', exact: true }).first().click();
    check(await reps.inputValue() === '11', 'reps step remains one');
    await page.getByRole('button', { name: '减少 1 次', exact: true }).first().click();
    check(await reps.inputValue() === '10', 'reps decrease unchanged');
    const firstExercise = page.locator('.simple-exercise').nth(0);
    const secondExercise = page.locator('.simple-exercise').nth(1);
    const collapseBox = await firstExercise.getByRole('button', { name: '收起动作' }).boundingBox();
    const addBox = await firstExercise.getByRole('button', { name: '添加一组', exact: true }).boundingBox();
    check(addBox.x >= collapseBox.x + collapseBox.width && Math.abs(addBox.y - collapseBox.y) < 2, 'add set is right of collapse control');
    const doneBox = await firstExercise.getByRole('button', { name: '标记完成组' }).first().boundingBox();
    const deleteBox = await firstExercise.getByRole('button', { name: '删除第 1 组', exact: true }).boundingBox();
    check(deleteBox.x >= doneBox.x + doneBox.width && Math.abs(deleteBox.y - doneBox.y) < 2, 'delete is beside set completion');
    check(deleteBox.width >= 44 && deleteBox.height >= 44, 'delete retains accessible touch target');
    await firstExercise.getByRole('button', { name: '收起动作' }).click();
    check(await firstExercise.locator('.exercise-details').getAttribute('inert') !== null, 'collapsed contents not interactive');
    await firstExercise.getByRole('button', { name: '添加一组', exact: true }).click();
    await page.waitForFunction(() => document.querySelector('.simple-exercise .simple-sets tbody').children.length === 3);
    check((await stored(page)).exercises[0].sets.length === 3, 'collapsed exercise supports adding set');
    await secondExercise.getByRole('button', { name: '展开动作' }).click();
    check(await firstExercise.getByRole('button', { name: '展开动作' }).count() === 1, 'expanding second keeps first collapsed');
    await firstExercise.getByRole('button', { name: '展开动作' }).click();
    check(await weight.inputValue() === '22.1', 'collapse preserves draft data');
    await firstExercise.getByRole('button', { name: '删除第 3 组', exact: true }).click();
    await page.waitForFunction(() => document.querySelector('.simple-exercise .simple-sets tbody').children.length === 2);
    check(await secondExercise.getByRole('button', { name: '收起动作' }).count() === 1, 'expanding first keeps second expanded');
    await secondExercise.getByRole('button', { name: '收起动作' }).click();
    check(await firstExercise.getByRole('button', { name: '收起动作' }).count() === 1, 'collapsing second keeps first expanded');
    await page.getByRole('button', { name: '下一动作' }).click();
    await page.waitForFunction(() => document.querySelectorAll('.simple-exercise')[0].querySelector('.exercise-details').hasAttribute('inert'));
    check(await secondExercise.getByRole('button', { name: '收起动作' }).count() === 1, 'next action opens target exercise');
    await page.getByRole('button', { name: '上一动作' }).click();
    await weight.waitFor();
    check(await weight.evaluate(el => parseFloat(getComputedStyle(el).fontSize)) >= 16, 'weight font at least 16px');
    check(await reps.evaluate(el => parseFloat(getComputedStyle(el).fontSize)) >= 16, 'reps font at least 16px');
    check(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), 'mobile layout has no horizontal overflow');
    check(await page.getByRole('button', { name: '保存组数据', exact: true }).count() === 0, 'secondary actions hidden by default');
    await firstExercise.getByLabel('动作 A更多操作').click();
    await page.getByRole('button', { name: '保存组数据', exact: true }).click();
    check((await stored(page)).exercises[0].sets[0].weight === 22.1, 'more menu saves inputs');
    await firstExercise.getByRole('button', { name: '添加一组', exact: true }).click();
    await page.waitForFunction(() => document.querySelector('.simple-exercise .simple-sets tbody').children.length === 3);
    check((await stored(page)).exercises[0].sets.length === 3, 'header adds set');
    await page.getByRole('button', { name: '删除第 3 组', exact: true }).click();
    await page.waitForFunction(() => document.querySelector('.simple-exercise .simple-sets tbody').children.length === 2);
    check((await stored(page)).exercises[0].sets.length === 2, 'row action deletes set');
    await firstExercise.getByLabel('动作 A更多操作').click();
    await firstExercise.getByRole('button', { name: '完成下一组', exact: true }).click();
    await page.locator('.rest-tile').waitFor();
    const tile = await page.locator('.rest-tile').boundingBox();
    check(tile.width === 104 && tile.height === 104, 'rest timer is a 104px square');
    check(await page.locator('.rest-controls').count() === 0, 'rest controls hidden by default');
    const footer = await page.locator('.session-footer').boundingBox();
    check(tile.y + tile.height <= footer.y, 'rest tile clears action navigation');
    const restDeadline = (await stored(page)).restTimer.restEndsAt;
    await page.getByRole('button', { name: '休息设置', exact: true }).click();
    await page.getByRole('button', { name: '收起休息设置', exact: true }).click();
    check(await page.locator('.rest-controls').count() === 0, 'rest settings close cleanly');
    check((await stored(page)).restTimer.restEndsAt === restDeadline, 'rest controls preserve deadline');
    await page.locator('.session-rest-default summary').click();
    const defaultRest = page.getByRole('spinbutton', { name: '本次训练休息（秒）', exact: true });
    await defaultRest.fill('-1');
    await page.getByRole('button', { name: '应用本次训练', exact: true }).click();
    await page.getByRole('status').filter({ hasText: '休息时间需为 0–600 秒的整数' }).waitFor();
    check((await stored(page)).exercises.every(exercise => exercise.restSeconds === 30), 'invalid rest duration does not change session');
    await defaultRest.fill('0');
    await page.getByRole('button', { name: '应用本次训练', exact: true }).click();
    await page.waitForFunction(() => document.querySelector('.session-rest-default summary').textContent.includes('0秒'));
    check((await stored(page)).exercises.every(exercise => exercise.restSeconds === 0), 'zero rest duration is accepted');
    await defaultRest.fill('120');
    await page.getByRole('button', { name: '应用本次训练', exact: true }).click();
    await page.waitForFunction(() => document.querySelector('.session-rest-default summary').textContent.includes('120秒'));
    const restUpdated = await stored(page);
    check(restUpdated.exercises.every(exercise => exercise.restSeconds === 120), 'session rest updates every exercise');
    check(restUpdated.restTimer.restEndsAt === restDeadline, 'default rest does not reset active countdown');
    await page.locator('.session-rest-default summary').click();

    if (process.env.WORKOUT_SCREENSHOT && permission === 'denied') {
      if (await page.getByRole('button', { name: '关闭数字调整' }).count()) await page.getByRole('button', { name: '关闭数字调整' }).click();
      await page.locator('.toast').waitFor({ state: 'hidden' });
      await page.evaluate(() => window.scrollTo(0, 0));
      await page.screenshot({ path: process.env.WORKOUT_SCREENSHOT });
    }
    if (permission === 'default') {
      await page.getByRole('button', { name: '开启通知', exact: true }).click();
      check(await page.evaluate(() => window.permissionRequests) === 1, 'permission only from explicit click');
    }
    page.once('dialog', dialog => dialog.dismiss());
    await firstExercise.getByRole('button', { name: '删除第 1 组', exact: true }).click();
    check((await stored(page)).exercises[0].sets[0].completed && (await stored(page)).exercises[0].sets.length === 2, 'completed-set deletion still requires confirmation');
    const before = await stored(page);
    await page.getByRole('button', { name: '返回主页' }).click();
    await page.locator('.mini-workout').waitFor();
    const after = await stored(page);
    check(after.status === 'in_progress' && after.startedAt === before.startedAt, 'minimize keeps active start time');
    check(JSON.stringify(after.restTimer) === JSON.stringify(before.restTimer), 'minimize preserves rest deadline');
    check(after.exercises[0].sets[0].weight === 22.1 && after.exercises[0].sets[0].completed, 'minimize preserves saved sets');
    const clock = await page.locator('.mini-workout .eyebrow').innerText();
    await page.waitForFunction(previous => document.querySelector('.mini-workout .eyebrow')?.textContent !== previous, clock);
    check(true, 'elapsed clock advances on home');
    const card = await page.locator('.mini-workout').boundingBox();
    const tabs = await page.locator('.tab-bar').boundingBox();
    check(card.y + card.height <= tabs.y, 'mini card clears bottom navigation');
    await page.setViewportSize({ width: 600, height: 900 });
    const desktopCard = await page.locator('.mini-workout').boundingBox();
    const desktopTabs = await page.locator('.tab-bar').boundingBox();
    check(desktopCard.y + desktopCard.height <= desktopTabs.y, 'desktop mini card clears navigation');
    await page.setViewportSize({ width: 320, height: 700 });
    check(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), 'narrow mobile mini card does not overflow');
    await page.getByRole('link', { name: '返回训练' }).click();
    await weight.waitFor();
    check(await weight.inputValue() === '22.1', 'return restores session');
    check(await weight.evaluate(el => parseFloat(getComputedStyle(el).fontSize)) >= 16, 'narrow mobile input still 16px');
    check(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), 'narrow mobile training does not overflow');
    check((await stored(page)).restTimer.restEndsAt === before.restTimer.restEndsAt, 'return preserves rest deadline');
    check((await stored(page)).exercises.every(exercise => exercise.restSeconds === 120), 'session default survives minimization');
    await firstExercise.getByRole('button', { name: '完成下一组', exact: true }).click();
    await page.waitForFunction(() => document.querySelector('.complete-next')?.textContent === '本动作已完成');
    const nextRest = (await stored(page)).restTimer;
    check(nextRest.restEndsAt - nextRest.restStartedAt === 120000, 'next rest uses new session default');
    await page.getByRole('button', { name: '＋ 添加动作', exact: true }).click();
    await page.getByRole('combobox', { name: '选择临时动作', exact: true }).selectOption({ index: 1 });
    await page.getByRole('button', { name: '添加', exact: true }).click();
    await page.waitForFunction(() => document.querySelectorAll('.simple-exercise').length === 3);
    check((await stored(page)).exercises.every(exercise => exercise.restSeconds === 120), 'temporary exercise inherits session rest');

    if (permission === 'default') check(await page.getByRole('button', { name: '开启通知', exact: true }).count() === 0, 'denial not requested again');
    await page.getByRole('button', { name: '休息设置', exact: true }).click();
    for (let step = 0; step < 4; step++) await page.getByRole('button', { name: '−30秒', exact: true }).click();
    await page.getByRole('status').filter({ hasText: '休息结束，可以开始下一组了' }).waitFor();
    check((await stored(page)).restTimer.expiredNotified, 'foreground expiration marks notified');
    await page.getByRole('button', { name: '跳过休息', exact: true }).click();
    await page.waitForFunction(() => !document.querySelector('.rest-tile'));
    check((await stored(page)).status === 'in_progress' && !(await stored(page)).restTimer, 'skip rest removes tile without ending workout');
    page.on('dialog', dialog => dialog.accept());
    await page.getByRole('button', { name: '结束训练', exact: true }).first().click();
    await page.getByRole('heading', { name: '训练完成', exact: true }).waitFor();
    check(await page.locator('.mini-workout').count() === 0, 'completed workout removes mini card');
    const finished = await stored(page);
    check(finished.status === 'completed' && finished.endedAt && !finished.restTimer && finished.exercises[0].sets[0].weight === 22.1, 'completion and history data intact');
    check(errors.length === 0, `no browser errors with ${permission}: ${errors.join(', ')}`);
    await context.close();
  }
  // Test capability branches without relying on OS notification delivery.
  const source = readFileSync(new URL('../src/services/restNotification.ts', import.meta.url), 'utf8');
  const notification = await import(`data:text/javascript;base64,${Buffer.from(stripTypeScriptTypes(source)).toString('base64')}`);
  globalThis.window = { isSecureContext: true };
  globalThis.document = { visibilityState: 'hidden' };
  const messages = [];
  Object.defineProperty(globalThis, 'navigator', { configurable: true, value: { serviceWorker: { getRegistration: async () => ({ showNotification: async (...args) => messages.push(args) }) } } });
  globalThis.Notification = class { static permission = 'granted'; constructor(...args) { messages.push(args); } };
  await notification.notifyRestFinished('rest-test');
  check(messages.length === 1 && messages[0][0] === 'FitFlow' && messages[0][1].body === '休息结束，可以开始下一组了', 'background service worker notification title and body');
  document.visibilityState = 'visible'; await notification.notifyRestFinished('front');
  check(messages.length === 1, 'foreground avoids system notification');
  document.visibilityState = 'hidden'; navigator.serviceWorker.getRegistration = async () => undefined;
  await notification.notifyRestFinished('fallback'); check(messages.length === 2, 'desktop Notification fallback');
  Notification.permission = 'denied'; await notification.notifyRestFinished('denied'); check(messages.length === 2, 'denied notification ignored');
  Notification.permission = 'granted'; navigator.serviceWorker.getRegistration = async () => { throw Error('unsupported'); };
  await notification.notifyRestFinished('failure'); check(true, 'notification failures contained');
  delete globalThis.Notification; await notification.notifyRestFinished('unsupported'); check(true, 'unsupported notification contained');
  console.log(`Workout checks passed: ${assertions} (${process.env.WORKOUT_BROWSER ?? 'chromium'})`);
} finally { await browser.close(); }
