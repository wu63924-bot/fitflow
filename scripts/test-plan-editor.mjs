import assert from 'node:assert/strict';
import { pathToFileURL } from 'node:url';

const { chromium, webkit } = await import(process.argv[2] ? pathToFileURL(process.argv[2]).href : 'playwright');
const engine = process.env.WORKOUT_BROWSER === 'webkit' ? webkit : chromium;
const browser = await engine.launch(engine === chromium ? { channel: 'chrome', headless: true } : { headless: true });
const base = process.env.WORKOUT_TEST_URL ?? 'http://127.0.0.1:5173';
let checks = 0;
function check(value, message) { assert(value, message); checks++; }
async function records(page, store) {
  return page.evaluate(async store => {
    const db = await new Promise(resolve => { const request = indexedDB.open('FitFlowDB'); request.onsuccess = () => resolve(request.result); });
    try { return await new Promise(resolve => { const request = db.transaction(store).objectStore(store).getAll(); request.onsuccess = () => resolve(request.result); }); }
    finally { db.close(); }
  }, store);
}

try {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto(`${base}/workout/plans/new`);
  await page.getByRole('heading', { name: '新建训练计划' }).waitFor();
  check(await page.getByRole('button', { name: '周一', exact: true }).getAttribute('aria-pressed') === 'true', 'Monday selected initially');
  check(await page.locator('.plan-week-selector button').count() === 7, 'seven-day cycle retained');
  check(await page.getByRole('textbox', { name: '搜索动作' }).count() === 0, 'library hidden by default');
  check(await page.getByRole('textbox', { name: '目标肌群' }).count() === 0, 'target muscles hidden by default');
  const save = page.getByRole('button', { name: '保存训练计划', exact: true });
  const saveBox = await save.boundingBox();
  const tabBox = await page.locator('.tab-bar').boundingBox();
  check(saveBox.y >= 0 && saveBox.y + saveBox.height <= tabBox.y, 'save visible above bottom navigation');
  await page.getByRole('textbox', { name: '计划名称', exact: true }).fill('简洁计划验收');
  await page.getByRole('textbox', { name: '训练名称', exact: true }).fill('胸部训练');
  await page.locator('.plan-more-settings summary').click();
  await page.getByRole('textbox', { name: '目标肌群', exact: true }).fill('胸、三头');
  await page.locator('.plan-more-settings summary').click();
  await page.getByRole('button', { name: '＋ 添加动作', exact: true }).click();
  const picker = page.locator('.plan-exercise-picker');
  await picker.getByRole('combobox', { name: '选择动作', exact: true }).selectOption({ index: 1 });
  const firstName = await picker.getByRole('combobox', { name: '选择动作', exact: true }).evaluate(el => el.selectedOptions[0].textContent);
  await picker.getByRole('button', { name: '添加动作', exact: true }).click();
  await page.locator('.plan-exercise-summary').first().waitFor();
  check(await page.getByRole('spinbutton', { name: '组数', exact: true }).count() === 0, 'exercise parameters start collapsed');
  await page.locator('.plan-exercise-summary').first().click();
  const sets = page.getByRole('spinbutton', { name: '组数', exact: true });
  await sets.fill('3');
  await page.getByRole('spinbutton', { name: '次数', exact: true }).fill('10');
  await page.getByRole('spinbutton', { name: '参考重量 kg', exact: true }).fill('20');
  await page.getByRole('spinbutton', { name: '休息秒数', exact: true }).fill('90');
  check(await sets.evaluate(el => parseFloat(getComputedStyle(el).fontSize)) >= 16, 'number input font at least 16px');
  await page.locator('.plan-exercise-summary').first().click();
  check((await page.locator('.plan-exercise-summary').first().innerText()).includes('3 组 × 10 次 · 20 kg · 休息 90 秒'), 'summary reflects unsaved values');
  await picker.getByRole('combobox', { name: '选择动作', exact: true }).selectOption({ index: 2 });
  await picker.getByRole('button', { name: '添加动作', exact: true }).click();
  check(await page.locator('.plan-exercise-summary').count() === 2, 'library still adds exercises');
  await page.getByRole('button', { name: '周二', exact: true }).click();
  check(await page.getByRole('button', { name: '休息', exact: true }).getAttribute('aria-pressed') === 'true', 'other days retain default rest');
  await page.getByRole('button', { name: '训练', exact: true }).click();
  await page.getByRole('textbox', { name: '训练名称', exact: true }).fill('背部训练');
  check(await page.getByRole('textbox', { name: '搜索动作' }).count() === 0, 'switching day closes library');
  await page.getByRole('button', { name: '周一', exact: true }).click();
  check(await page.getByRole('textbox', { name: '训练名称', exact: true }).inputValue() === '胸部训练', 'day name survives switching');
  check((await page.locator('.plan-exercise-summary').first().innerText()).includes('3 组 × 10 次'), 'parameters survive switching');
  await page.locator('.plan-exercise-summary').first().click();
  await page.getByRole('button', { name: '下移', exact: true }).click();
  await page.waitForFunction(name => document.querySelectorAll('.plan-exercise-summary')[1].textContent.includes(name), firstName);
  check(true, 'reordering retained');
  await page.locator('.plan-exercise-summary').first().click();
  await page.locator('.plan-exercise-row').first().getByRole('button', { name: '删除动作', exact: true }).click();
  check(await page.locator('.plan-exercise-summary').count() === 1, 'exercise deletion retained');
  await page.getByRole('spinbutton', { name: '组数', exact: true }).fill('');
  await page.locator('.plan-exercise-summary').first().click();
  await page.getByRole('button', { name: '周二', exact: true }).click();
  await save.click();
  await page.getByRole('status').filter({ hasText: '周一：请填写有效的组数' }).waitFor();
  check(await page.getByRole('button', { name: '周一', exact: true }).getAttribute('aria-pressed') === 'true', 'validation selects invalid day');
  await page.getByRole('spinbutton', { name: '组数', exact: true }).fill('3');
  check(true, 'validation reveals hidden invalid parameters');
  await page.locator('.plan-exercise-summary').first().click();
  if (process.env.PLAN_SCREENSHOT) {
    await page.locator('.toast').waitFor({ state: 'hidden' });
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.screenshot({ path: process.env.PLAN_SCREENSHOT });
  }
  await page.setViewportSize({ width: 320, height: 700 });
  check(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), 'narrow mobile does not overflow');
  await save.click();
  await page.waitForURL('**/workout');
  const plan = (await records(page, 'trainingPlans')).find(item => item.name === '简洁计划验收');
  check(Boolean(plan) && plan.days.length === 7, 'new plan saves seven days');
  const monday = plan.days.find(day => day.weekday === '周一');
  const tuesday = plan.days.find(day => day.weekday === '周二');
  check(monday.name === '胸部训练' && monday.targetMuscles === '胸、三头' && tuesday.name === '背部训练' && !tuesday.isRestDay, 'day settings persisted');
  const exercise = monday.exercises[0];
  check(exercise.sets === 3 && exercise.repsMin === 10 && exercise.repsMax === 10 && exercise.referenceWeight === 20 && exercise.restSeconds === 90, 'existing parameter storage retained');
  await page.goto(`${base}/workout/plans/${plan.id}?day=${tuesday.id}`);
  await page.getByRole('heading', { name: '编辑训练计划' }).waitFor();
  check(await page.getByRole('button', { name: '周二', exact: true }).getAttribute('aria-pressed') === 'true', 'requested edit day selected');
  await page.getByRole('button', { name: '休息', exact: true }).click();
  await save.click();
  await page.waitForURL('**/workout');
  check((await records(page, 'trainingPlans')).find(item => item.id === plan.id).days.find(day => day.id === tuesday.id).isRestDay, 'existing plan rest changes save');
  await page.goto(`${base}/workout/plans/${plan.id}?day=missing`);
  await page.getByRole('textbox', { name: '训练名称', exact: true }).waitFor();
  check(await page.getByRole('button', { name: '周一', exact: true }).getAttribute('aria-pressed') === 'true', 'invalid requested day falls back');
  await page.getByRole('button', { name: '＋ 添加动作', exact: true }).click();
  await page.getByRole('button', { name: '＋ 新建自定义动作', exact: true }).click();
  await page.getByRole('textbox', { name: '自定义动作名称', exact: true }).fill('自定义验收动作');
  await page.getByRole('button', { name: '创建并添加', exact: true }).click();
  await page.waitForFunction(() => [...document.querySelectorAll('.plan-exercise-summary')].some(el => el.textContent.includes('自定义验收动作')));
  check(true, 'custom exercise creation retained');
  await save.click();
  await page.waitForURL('**/workout');
  check((await records(page, 'exercises')).some(item => item.name === '自定义验收动作' && item.isCustom), 'custom exercise persists');
  await page.goto(`${base}/workout/plans/${plan.id}`);
  await page.locator('.plan-exercise-summary').first().waitFor();
  await page.setViewportSize({ width: 390, height: 844 });
  // An active workout must not cover the editor's save button.
  await page.evaluate(async () => {
    const db = await new Promise(resolve => { const request = indexedDB.open('FitFlowDB'); request.onsuccess = () => resolve(request.result); });
    await new Promise(resolve => { const tx = db.transaction('workoutSessions', 'readwrite'); tx.objectStore('workoutSessions').put({ id: 'test-plan-active', status: 'in_progress', startedAt: Date.now(), workoutDayName: '进行中训练', currentExerciseIndex: 0, exercises: [] }); tx.oncomplete = resolve; }); db.close();
  });
  await page.reload();
  await page.locator('.mini-workout').waitFor();
  const mini = await page.locator('.mini-workout').boundingBox();
  const activeSave = await save.boundingBox();
  check(activeSave.y + activeSave.height <= mini.y, 'save clears active workout bar');
  await page.setViewportSize({ width: 600, height: 900 });
  const desktopMini = await page.locator('.mini-workout').boundingBox();
  const desktopSave = await save.boundingBox();
  check(desktopSave.y + desktopSave.height <= desktopMini.y, 'desktop save clears active workout bar');
  check(errors.length === 0, `no browser errors: ${errors.join(', ')}`);
  console.log(`Plan editor checks passed: ${checks} (${process.env.WORKOUT_BROWSER ?? 'chromium'})`);
  await context.close();
} finally { await browser.close(); }
