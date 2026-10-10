import assert from 'node:assert/strict';
import { pathToFileURL } from 'node:url';
const { chromium, webkit } = await import(process.argv[2] ? pathToFileURL(process.argv[2]).href : 'playwright');
const engine = process.env.WORKOUT_BROWSER === 'webkit' ? webkit : chromium;
const browser = await engine.launch(engine === chromium ? { channel: 'chrome', headless: true } : { headless: true });
const base = process.env.WORKOUT_TEST_URL ?? 'http://127.0.0.1:5173';
let checks = 0;
function check(value, message) { assert(value, message); checks++; }
async function schedule(page, today) {
  return page.evaluate(async today => {
    const { getDailySchedule } = await import('/src/repositories/dailyScheduleRepository.ts');
    return getDailySchedule(today);
  }, today);
}
try {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, timezoneId: 'Asia/Shanghai' });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto(`${base}/home`);
  await page.locator('.hero-card').waitFor();
  const today = await page.evaluate(async () => (await import('/src/utils/format.ts')).dateKey(new Date()));
  await page.goto(`${base}/history/${today}`);
  await page.getByRole('button', { name: '＋ 安排今天', exact: true }).click();
  await page.getByRole('button', { name: /^力量训练/ }).click();
  await page.getByRole('button', { name: '自定义本次', exact: true }).click();
  check(await page.getByRole('textbox', { name: '本次训练名称', exact: true }).count() === 0, 'manual name input removed');
  check(await page.locator('.custom-workout-name').innerText() === '添加动作后自动生成名称', 'empty custom schedule has neutral preview');
  await page.getByRole('button', { name: '保存安排', exact: true }).click();
  await page.getByRole('status').filter({ hasText: '至少添加一个动作' }).waitFor();
  check(!(await schedule(page, today))?.type, 'empty schedule still rejected');
  const choose = page.getByRole('combobox', { name: '选择动作', exact: true });
  const add = page.getByRole('button', { name: '添加动作', exact: true });
  await choose.selectOption({ index: 1 }); await add.click();
  check(await page.locator('.custom-workout-name').innerText() === '胸部训练', 'single body part generates name');
  await choose.selectOption({ index: 2 }); await add.click();
  check(await page.locator('.custom-workout-name').innerText() === '胸部训练', 'duplicate parts deduplicated');
  await page.getByRole('button', { name: '三头', exact: true }).click();
  await choose.selectOption({ index: 1 }); await add.click();
  check(await page.locator('.custom-workout-name').innerText() === '胸部、三头训练', 'multiple parts combined');
  await page.getByRole('button', { name: '腿', exact: true }).click();
  check(await page.locator('.custom-workout-name').innerText() === '胸部、三头训练', 'filter changes alone do not change name');
  await page.locator('.custom-exercise-editor').first().getByRole('button', { name: '移除', exact: true }).click();
  check(await page.locator('.custom-workout-name').innerText() === '胸部、三头训练', 'remaining duplicate keeps part');
  await page.locator('.custom-exercise-editor').first().getByRole('button', { name: '移除', exact: true }).click();
  check(await page.locator('.custom-workout-name').innerText() === '三头训练', 'removing last exercise removes body part');
  await page.getByRole('button', { name: '保存安排', exact: true }).click();
  await page.locator('.modal-backdrop').waitFor({ state: 'hidden' });
  const saved = await schedule(page, today);
  check(saved.workoutTemplate.workoutDayName === '三头训练' && saved.status === 'planned', 'generated name saved without starting workout');
  const originalExercise = JSON.stringify(saved.workoutTemplate.exercises[0]);
  await page.getByRole('button', { name: '编辑安排', exact: true }).click();
  await page.getByRole('button', { name: /^力量训练/ }).click();
  check(await page.locator('.custom-workout-name').innerText() === '三头训练', 'editing schedule restores derived name');
  await page.getByRole('button', { name: '腿', exact: true }).click();
  await choose.selectOption({ index: 1 }); await add.click();
  await page.getByRole('button', { name: '保存安排', exact: true }).click();
  await page.locator('.modal-backdrop').waitFor({ state: 'hidden' });
  const updated = await schedule(page, today);
  check(updated.workoutTemplate.workoutDayName === '三头、腿部训练', 'edited schedule saves updated parts');
  check(JSON.stringify(updated.workoutTemplate.exercises[0]) === originalExercise, 'existing sets weights reps and rest preserved');
  // Plans keep their own names rather than being renamed by the custom naming rule.
  await page.evaluate(async () => {
    const { db } = await import('/src/db/db.ts');
    const exercise = await db.exercises.toCollection().first();
    await db.trainingPlans.put({ id: 'test-name-plan', name: '名称验收计划', createdAt: 1, updatedAt: 1, days: [{ id: 'test-name-day', weekday: '周一', cycleIndex: 1, order: 0, name: '原计划推日', targetMuscles: '胸', isRestDay: false, exercises: [{ id: 'planned-name-test', exerciseId: exercise.id, order: 0, sets: 1, repsMin: 10, repsMax: 10, referenceWeight: 20, restSeconds: 90 }] }] });
  });
  await page.reload();
  await page.getByRole('button', { name: '编辑安排', exact: true }).click();
  await page.getByRole('button', { name: /^力量训练/ }).click();
  await page.getByRole('button', { name: '选择训练计划', exact: true }).click();
  await page.getByRole('combobox', { name: '训练计划', exact: true }).selectOption('test-name-plan');
  await page.getByRole('button', { name: '保存安排', exact: true }).click();
  await page.locator('.modal-backdrop').waitFor({ state: 'hidden' });
  check((await schedule(page, today)).workoutTemplate.workoutDayName === '原计划推日', 'plan mode retains original training day name');
  await page.getByRole('button', { name: '开始训练', exact: true }).click();
  await page.locator('.session-title').waitFor();
  check(await page.locator('.session-title').innerText() === '原计划推日', 'starting workout keeps saved name');
  check(errors.length === 0, `no browser errors: ${errors.join(', ')}`);
  console.log(`Schedule naming checks passed: ${checks} (${process.env.WORKOUT_BROWSER ?? 'chromium'})`);
  await context.close();
} finally { await browser.close(); }
