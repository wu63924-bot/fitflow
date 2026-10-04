import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { stripTypeScriptTypes } from 'node:module';
import { parseAssistant, validateFoods } from '../server/schema.ts';
import { validateImage } from '../server/image.ts';
import { recognizeWithQwen } from '../server/qwenVisionClient.ts';
import { createApiServer, isAllowedOrigin } from '../server/app.ts';
import { readConfig } from '../server/config.ts';

let checks = 0;
const test = async (name, action) => { await action(); checks++; console.log(`PASS ${name}`); };
const valid = { foods: [{ name: ' 白米饭 ', estimatedGrams: 180, calories: 234, protein: 4.9, carbs: 50.4, fat: 0.5, confidence: 0.92 }] };
const envelope = text => ({ choices: [{ message: { content: text } }] });
const result = () => new Response(JSON.stringify(envelope(JSON.stringify(valid))));
// Credentials are deliberately empty: upstream fetch is injected, never reaches a vendor.
const config = { apiKey: '', baseUrl: 'https://example.invalid/compatible-mode/v1', model: 'test-model', host: '0.0.0.0', port: 8788, timeoutMs: 50 };
const image = new File([Buffer.from([255, 216, 255, 224, 0, 0, 0, 0, 0, 0, 0, 0])], 'fixture', { type: 'image/jpeg' });
const rejectsCode = (action, code) => assert.rejects(action, error => error.code === code);
await test('JSON nutrition totals preserved and extra fields discarded', () => {
  assert.deepEqual(parseAssistant(envelope(JSON.stringify(valid))), { foods: [{ name: '白米饭', estimatedGrams: 180, calories: 234, protein: 4.9, carbs: 50.4, fat: 0.5, confidence: 0.92 }] });
  assert.equal(validateFoods({ foods: [{ ...valid.foods[0], calories: 999 }] }).foods[0].calories, 999);
  assert(!('privateField' in validateFoods({ foods: [{ ...valid.foods[0], privateField: 'discard' }] }).foods[0]));
});
await test('empty result and outer JSON fence', () => {
  assert.deepEqual(parseAssistant(envelope('```json\n{"foods":[]}\n```')), { foods: [] });
});
for (const value of ['not JSON', '{}', '{"foods":null}']) await test(`invalid JSON ${value}`, () => assert.throws(() => parseAssistant(envelope(value)), { code: 'AI_BAD_RESPONSE' }));
for (const row of [{ ...valid.foods[0], name: '' }, { ...valid.foods[0], name: 'x'.repeat(61) }, ...[0, -1, 3001, '180', NaN, Infinity].map(estimatedGrams => ({ ...valid.foods[0], estimatedGrams })), ...[-0.1, 1.1, '0.9'].map(confidence => ({ ...valid.foods[0], confidence }))]) {
  await test('invalid item rejects entire response', () => assert.throws(() => validateFoods({ foods: [valid.foods[0], row] }), { code: 'AI_BAD_RESPONSE' }));
}
for (const key of ['calories','protein','carbs','fat']) {
  const missing = { ...valid.foods[0] }; delete missing[key];
  for (const row of [missing, ...[-1, 10001, NaN, Infinity, '12', null].map(value => ({ ...valid.foods[0], [key]: value }))]) await test(`invalid/missing nutrition ${key}`, () => assert.throws(() => validateFoods({ foods: [row] }), { code: 'AI_BAD_RESPONSE' }));
}
await test('twenty-item limit', () => assert.throws(() => validateFoods({ foods: Array(21).fill(valid.foods[0]) }), { code: 'AI_BAD_RESPONSE' }));
await test('HOST/PORT defaults and FC port; timeout stays 25 seconds', () => {
  const env = { DASHSCOPE_API_KEY: 'unused-test-value', QWEN_BASE_URL: 'https://example.invalid/compatible-mode/v1' };
  assert.equal(readConfig(env).host, '0.0.0.0');
  assert.equal(readConfig(env).port, 8788);
  assert.equal(readConfig(env).timeoutMs, 25000);
  assert.equal(readConfig({ ...env, PORT: '9000' }).port, 9000);
  assert.equal(readConfig({ ...env, HOST: '127.0.0.1' }).host, '127.0.0.1');
});
await test('configuration is required and HTTPS validated', () => {
  assert.throws(() => readConfig({}));
  assert.throws(() => readConfig({ DASHSCOPE_API_KEY: 'unused-test-value', QWEN_BASE_URL: 'http://example.invalid/compatible-mode/v1' }));
});
for (const [status, code, count] of [[400, 'AI_BAD_RESPONSE', 1], [401, 'AI_AUTH_ERROR', 1], [403, 'AI_AUTH_ERROR', 1], [413, 'AI_BAD_RESPONSE', 1], [429, 'AI_RATE_LIMIT', 1], [500, 'AI_UNAVAILABLE', 2]]) {
  await test(`Qwen ${status} mapping/retry`, async () => {
    let calls = 0;
    await rejectsCode(() => recognizeWithQwen(image, '', config, undefined, async () => { calls++; return new Response('vendor-private-error', { status }); }), code);
    assert.equal(calls, count);
  });
}
await test('5xx retries once then succeeds; request image/text ordering', async () => {
  let calls = 0;
  const recognized = await recognizeWithQwen(image, '午餐', config, undefined, async (url, options) => {
    assert.equal(url, `${config.baseUrl}/chat/completions`);
    const payload = JSON.parse(options.body);
    assert.equal(payload.messages[0].content[0].type, 'image_url');
    assert(payload.messages[0].content[0].image_url.url.startsWith('data:image/jpeg;base64,'));
    assert.equal(payload.messages[0].content[1].type, 'text');
    return ++calls === 1 ? new Response('', { status: 500 }) : result();
  });
  assert.equal(calls, 2); assert.equal(recognized.foods.length, 1);
});
await test('temporary network failure retries once', async () => {
  let calls = 0;
  await rejectsCode(() => recognizeWithQwen(image, '', config, undefined, async () => { calls++; throw new TypeError('private network detail'); }), 'AI_UNAVAILABLE');
  assert.equal(calls, 2);
});
await test('bad upstream JSON does not retry', async () => {
  let calls = 0;
  await rejectsCode(() => recognizeWithQwen(image, '', config, undefined, async () => { calls++; return new Response('bad'); }), 'AI_BAD_RESPONSE');
  assert.equal(calls, 1);
});
await test('25-second mechanism: shortened timeout aborts without retry', async () => {
  let calls = 0;
  await rejectsCode(() => recognizeWithQwen(image, '', config, undefined, async (_url, options) => { calls++; return new Promise((_resolve, reject) => options.signal.addEventListener('abort', () => reject(new DOMException('abort', 'AbortError')), { once: true })); }), 'AI_TIMEOUT');
  assert.equal(calls, 1);
});
for (const [file, code] of [[null, 'INVALID_IMAGE'], [new File([], 'empty', { type: 'image/jpeg' }), 'INVALID_IMAGE'], [new File(['a'], 'x', { type: 'text/plain' }), 'UNSUPPORTED_IMAGE'], [new File(['a'], 'spoof.jpg', { type: 'image/jpeg' }), 'INVALID_IMAGE'], [new File([new Uint8Array(1024 * 1024 + 1)], 'big', { type: 'image/jpeg' }), 'IMAGE_TOO_LARGE']]) await test(`image validation ${code}`, () => rejectsCode(() => validateImage(file), code));
await test('JPEG PNG WebP signatures accepted', async () => {
  assert.equal(await validateImage(image), image);
  for (const [type, bytes] of [['image/png', [137,80,78,71,13,10,26,10]], ['image/webp', Buffer.from('RIFFxxxxWEBP')]]) await validateImage(new File([Buffer.from(bytes)], 'x', { type }));
});
await test('exact production/development CORS allowlist', () => {
  for (const origin of ['https://wu63924-bot.github.io', 'http://localhost:5173', 'http://127.0.0.1:5173']) assert(isAllowedOrigin(origin));
  for (const origin of ['https://example.com', 'http://localhost.evil:5173', 'null', 'http://192.168.1.1:5173', 'http://localhost:4173', 'https://wu63924-bot.github.io/evil']) assert(!isAllowedOrigin(origin));
});

const logs = [];
const server = createApiServer(config, async () => result(), entry => logs.push(entry));
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const base = `http://127.0.0.1:${server.address().port}`;
try {
  await test('health returns only public service status', async () => {
    const response = await fetch(`${base}/health`);
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), { ok: true, service: 'fitflow-ai' });
  });
  await test('all allowed origins pass OPTIONS and multipart POST', async () => {
    for (const origin of ['https://wu63924-bot.github.io', 'http://localhost:5173', 'http://127.0.0.1:5173']) {
      const preflight = await fetch(`${base}/api/food-recognition`, { method: 'OPTIONS', headers: { Origin: origin, 'Access-Control-Request-Method': 'POST', 'Access-Control-Request-Headers': 'Content-Type' } });
      assert.equal(preflight.status, 204);
      assert.equal(preflight.headers.get('access-control-allow-origin'), origin);
      assert(preflight.headers.get('access-control-allow-methods').includes('POST'));
      assert.equal(preflight.headers.get('access-control-allow-headers'), 'Content-Type');
      const form = new FormData(); form.append('image', image);
      const response = await fetch(`${base}/api/food-recognition`, { method: 'POST', headers: { Origin: origin }, body: form });
      assert.equal(response.status, 200);
      assert.equal(response.headers.get('access-control-allow-origin'), origin);
      assert.equal((await response.json()).foods.length, 1);
    }
  });
  await test('actual HTTP multipart and sanitized response/logs', async () => {
    const form = new FormData(); form.append('image', image); form.append('hint', '午餐');
    const response = await fetch(`${base}/api/food-recognition`, { method: 'POST', headers: { Origin: 'http://localhost:5173' }, body: form });
    assert.equal(response.status, 200); assert.equal(response.headers.get('access-control-allow-origin'), 'http://localhost:5173');
    assert.equal(response.headers.get('cache-control'), 'no-store');
    assert.deepEqual(await response.json(), { foods: [{ name: '白米饭', estimatedGrams: 180, calories: 234, protein: 4.9, carbs: 50.4, fat: 0.5, confidence: 0.92 }] });
    assert.deepEqual(Object.keys(logs[0]), ['time','durationMs','status','code','aiDurationMs','foodCount']);
  });
  await test('HTTP preflight and forbidden origin', async () => {
    assert.equal((await fetch(`${base}/api/food-recognition`, { method: 'OPTIONS', headers: { Origin: 'http://localhost:5173' } })).status, 204);
    assert.equal((await fetch(`${base}/api/food-recognition`, { method: 'POST', headers: { Origin: 'https://example.com' } })).status, 403);
  });
  for (const [file, status, code] of [[new File([], 'x', { type: 'image/jpeg' }), 400, 'INVALID_IMAGE'], [new File(['x'], 'x', { type: 'text/plain' }), 415, 'UNSUPPORTED_IMAGE'], [new File([new Uint8Array(1024 * 1024 + 1)], 'x', { type: 'image/jpeg' }), 413, 'IMAGE_TOO_LARGE']]) {
    await test(`HTTP ${status} ${code}`, async () => { const form = new FormData(); form.append('image', file); const response = await fetch(`${base}/api/food-recognition`, { method: 'POST', body: form }); assert.equal(response.status, status); assert.equal((await response.json()).error.code, code); });
  }
  const moduleUrl = source => `data:text/javascript;base64,${Buffer.from(stripTypeScriptTypes(source)).toString('base64')}`;
  const source = readFileSync(new URL('../src/services/foodRecognitionService.ts', import.meta.url), 'utf8').replaceAll('import.meta.env', '({ DEV: true, VITE_FOOD_RECOGNITION_PROVIDER: "mock" })');
  const { RemoteFoodRecognitionProvider, MockFoodRecognitionProvider, createAiMealItem } = await import(moduleUrl(source));
  await test('Remote provider real local HTTP; direct nutrition snapshot without catalog', async () => {
    const result = await new RemoteFoodRecognitionProvider(base).recognizeFood(image);
    assert.equal(result.foods[0].name, '白米饭'); assert.equal(result.foods[0].calories, 234);
    assert.equal(createAiMealItem(result.foods[0]).nutritionSnapshot.referenceAmount, 180);
    const originalFetch = globalThis.fetch;
    try {
      globalThis.fetch = async () => new Response(JSON.stringify({ foods: [{ ...valid.foods[0], name: '未知复合菜品' }] }));
      const food = (await new RemoteFoodRecognitionProvider(base).recognizeFood(image)).foods[0];
      assert.equal(food.name, '未知复合菜品'); assert.equal(createAiMealItem(food).nutritionSnapshot.calories, 234);
      for (const key of ['calories','protein','carbs','fat']) {
        const missing = { ...valid.foods[0] }; delete missing[key];
        for (const row of [missing, { ...valid.foods[0], [key]: -1 }, { ...valid.foods[0], [key]: '12' }]) {
          globalThis.fetch = async () => new Response(JSON.stringify({ foods: [row] }));
          await assert.rejects(() => new RemoteFoodRecognitionProvider(base).recognizeFood(image), /识别结果异常/);
        }
      }
    } finally { globalThis.fetch = originalFetch; }
  });
  await test('Remote friendly errors never show vendor details', async () => {
    const originalFetch = globalThis.fetch;
    try {
      for (const code of ['AI_TIMEOUT','AI_AUTH_ERROR','AI_RATE_LIMIT','AI_BAD_RESPONSE','AI_UNAVAILABLE']) {
        globalThis.fetch = async () => new Response(JSON.stringify({ error: { code, message: 'private-vendor-detail' } }), { status: 502 });
        await assert.rejects(() => new RemoteFoodRecognitionProvider(base).recognizeFood(image), error => !error.message.includes('private-vendor-detail'));
      }
    } finally { globalThis.fetch = originalFetch; }
  });
  await test('frontend Remote abort and Mock abort', async () => {
    const controller = new AbortController(); controller.abort();
    await assert.rejects(() => new RemoteFoodRecognitionProvider(base).recognizeFood(image, controller.signal), { name: 'AbortError' });
    await assert.rejects(() => new MockFoodRecognitionProvider().recognizeFood(image, controller.signal), { name: 'AbortError' });
  });
  await test('in-flight Remote and Mock cancellation', async () => {
    const originalFetch = globalThis.fetch;
    try {
      globalThis.fetch = async (_url, options) => new Promise((_resolve, reject) => options.signal.addEventListener('abort', () => reject(new DOMException('cancel', 'AbortError')), { once: true }));
      const remoteAbort = new AbortController();
      const remoteTask = new RemoteFoodRecognitionProvider(base).recognizeFood(image, remoteAbort.signal);
      remoteAbort.abort();
      await assert.rejects(() => remoteTask, { name: 'AbortError' });
      const mockAbort = new AbortController();
      const mockTask = new MockFoodRecognitionProvider().recognizeFood(image, mockAbort.signal);
      mockAbort.abort();
      await assert.rejects(() => mockTask, { name: 'AbortError' });
    } finally { globalThis.fetch = originalFetch; }
  });
  await test('production respects remote and mock provider settings', async () => {
    const service = readFileSync(new URL('../src/services/foodRecognitionService.ts', import.meta.url), 'utf8');
    for (const mode of ['remote', 'mock']) {
      const source = service.replaceAll('import.meta.env', JSON.stringify({ DEV: false, PROD: true, VITE_FOOD_RECOGNITION_PROVIDER: mode }));
      const url = 'data:text/javascript;base64,' + Buffer.from(stripTypeScriptTypes(source)).toString('base64');
      const result = await import(url);
      assert.equal(result.recognitionMode, mode);
    }
  });
} finally { await new Promise(resolve => server.close(resolve)); }
console.log(`${checks} Phase 6B-1 checks PASS; all vendor calls simulated, no actual Qwen call.`);
