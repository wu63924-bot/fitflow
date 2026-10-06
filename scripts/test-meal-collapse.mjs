import assert from 'node:assert/strict';
import { pathToFileURL } from 'node:url';

const { chromium, webkit } = await import(process.argv[2] ? pathToFileURL(process.argv[2]).href : 'playwright');
const engine = process.env.WORKOUT_BROWSER === 'webkit' ? webkit : chromium;
const browser = await engine.launch(engine === chromium ? { channel: 'chrome', headless: true } : { headless: true });
const base = process.env.WORKOUT_TEST_URL ?? 'http://127.0.0.1:5173';
let checks = 0;
function check(value, message) { assert(value, message); checks++; }
async function stored(page) {
  return page.evaluate(async () => {
    const db = await new Promise(resolve => { const request = indexedDB.open('FitFlowDB'); request.onsuccess = () => resolve(request.result); });
    try { return await new Promise(resolve => { const request = db.transaction('meals').objectStore('meals').getAll(); request.onsuccess = () => resolve(request.result); }); }
    finally { db.close(); }
  });
}
try {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto(`${base}/nutrition?date=2026-10-01`);
  await page.locator('.diet-meal-list').waitFor();
  await page.evaluate(async () => {
    const db = await new Promise(resolve => { const request = indexedDB.open('FitFlowDB'); request.onsuccess = () => resolve(request.result); });
    await new Promise(resolve => {
      const tx = db.transaction('meals', 'readwrite');
      for (const type of ['breakfast', 'lunch', 'dinner', 'snack']) tx.objectStore('meals').put({ id: `2026-10-01-${type}`, date: '2026-10-01', type, title: type, createdAt: 1, updatedAt: 1,
        items: [{ id: `test-${type}`, foodId: 'test-food', foodNameSnapshot: `测试食物-${type}`, amount: 100, unit: 'g', nutritionSnapshot: { calories: 100, protein: 10, carbs: 12, fat: 2, referenceAmount: 100, referenceUnit: 'g' } }] });
      tx.oncomplete = resolve;
    }); db.close();
  });
  await page.reload();
  await page.locator('.diet-meal-list').waitFor();
  const before = JSON.stringify(await stored(page));
  for (const title of ['早餐', '午餐', '晚餐', '加餐']) {
    const button = page.getByRole('button', { name: `展开${title}记录`, exact: true });
    check(await button.getAttribute('aria-expanded') === 'false', `${title} collapsed by default`);
    check((await button.boundingBox()).height >= 44, `${title} toggle touch target`);
  }
  check(await page.getByRole('button', { name: /^编辑测试食物/ }).count() === 0, 'collapsed food controls inaccessible');
  check(await page.locator('.nutrition-overview .value').innerText() === '400', 'totals remain visible');
  await page.getByRole('button', { name: '展开早餐记录', exact: true }).click();
  await page.getByRole('button', { name: '展开午餐记录', exact: true }).click();
  check(await page.getByRole('button', { name: '收起早餐记录', exact: true }).count() === 1 && await page.getByRole('button', { name: '收起午餐记录', exact: true }).count() === 1, 'meals expand independently');
  await page.getByRole('button', { name: '编辑测试食物-breakfast', exact: true }).click();
  const amount = page.getByRole('spinbutton', { name: '份量（g）', exact: true });
  await amount.fill('200');
  await page.getByRole('button', { name: '收起早餐记录', exact: true }).click();
  check(await page.getByRole('button', { name: '收起午餐记录', exact: true }).count() === 1, 'collapsing breakfast does not collapse lunch');
  await page.getByRole('button', { name: '展开早餐记录', exact: true }).click();
  check(await amount.inputValue() === '200', 'collapse preserves unsaved amount draft');
  check(JSON.stringify(await stored(page)) === before, 'collapse does not alter records or snapshots');
  await page.getByRole('button', { name: '保存', exact: true }).click();
  await page.waitForFunction(() => document.querySelector('.nutrition-overview .value')?.textContent === '500');
  const meals = await stored(page);
  const breakfast = meals.find(meal => meal.type === 'breakfast');
  check(breakfast.items[0].amount === 200 && breakfast.items[0].nutritionSnapshot.calories === 100, 'existing save and immutable snapshot intact');
  for (const title of ['晚餐', '加餐']) {
    await page.getByRole('button', { name: `展开${title}记录`, exact: true }).click();
    check(await page.getByRole('button', { name: `收起${title}记录`, exact: true }).count() === 1, `${title} expands`);
  }
  await page.setViewportSize({ width: 320, height: 700 });
  check(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), '320px meal header has no overflow');
  await page.getByRole('button', { name: '前一天', exact: true }).click();
  await page.waitForURL('**date=2026-09-30');
  await page.getByRole('button', { name: '展开早餐记录', exact: true }).waitFor();
  check(await page.getByRole('button', { name: /^展开.*记录$/ }).count() === 4, 'changing date resets all meals collapsed');
  await page.getByRole('button', { name: '展开早餐记录', exact: true }).click();
  check(await page.locator('#meal-details-breakfast').getByText('暂无食物记录', { exact: true }).isVisible(), 'empty meal expands cleanly');
  await page.reload();
  await page.getByRole('button', { name: '展开早餐记录', exact: true }).waitFor();
  check(await page.getByRole('button', { name: /^展开.*记录$/ }).count() === 4, 'reload defaults collapsed');
  check(errors.length === 0, `no browser errors: ${errors.join(', ')}`);
  console.log(`Meal collapse checks passed: ${checks} (${process.env.WORKOUT_BROWSER ?? 'chromium'})`);
  await context.close();
} finally { await browser.close(); }
