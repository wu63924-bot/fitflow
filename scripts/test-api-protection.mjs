import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { stripTypeScriptTypes } from 'node:module';
import { createApiServer } from '../server/app.ts';
import { RateLimiter, clientKey } from '../server/rateLimiter.ts';
import { readConfig } from '../server/config.ts';

let checks = 0;
const test = async (name, action) => { await action(); checks++; console.log(`PASS ${name}`); };
const config = { apiKey: '', baseUrl: 'https://example.invalid/compatible-mode/v1', model: 'test', timeoutMs: 1000, host: '127.0.0.1', port: 0 };
const image = new File([Buffer.from([255, 216, 255, 224])], 'x.jpg', { type: 'image/jpeg' });
const result = () => new Response(JSON.stringify({ choices: [{ message: { content: '{"foods":[]}' } }] }));
async function withServer(options, upstream, action) {
  const logs = [];
  const server = createApiServer({ ...config, ...options }, upstream, entry => logs.push(entry));
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  const post = (ip = '203.0.113.1', signal) => {
    const form = new FormData(); form.append('image', image);
    return fetch(`${base}/api/food-recognition`, { method: 'POST', headers: { 'x-forwarded-for': ip }, body: form, signal });
  };
  try { await action({ base, post, logs }); }
  finally { server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); }
}
await test('server environment defaults, overrides and invalid values', () => {
  const env = { DASHSCOPE_API_KEY: 'test', QWEN_BASE_URL: config.baseUrl };
  assert.deepEqual([readConfig(env).rateLimitMax, readConfig(env).rateLimitWindowMs, readConfig(env).maxConcurrent], [6, 60000, 2]);
  const custom = readConfig({ ...env, AI_RATE_LIMIT_MAX: '9', AI_RATE_LIMIT_WINDOW_MS: '100', AI_MAX_CONCURRENT: '1' });
  assert.deepEqual([custom.rateLimitMax, custom.rateLimitWindowMs, custom.maxConcurrent], [9, 100, 1]);
  for (const value of ['0', '-1', '1.5', '', 'NaN', 'Infinity']) assert.equal(readConfig({ ...env, AI_RATE_LIMIT_MAX: value }).rateLimitMax, 6);
});
await test('first valid forwarded IP; IPv6; shared fallback', () => {
  assert.equal(clientKey('bad, 203.0.113.1, 203.0.113.2'), '203.0.113.1');
  assert.equal(clientKey(['invalid', '2001:db8::1']), '2001:db8::1');
  assert.equal(clientKey(undefined), clientKey('invalid'));
});
await test('six per 60 seconds; seventh denied; independent clients; exact window reset', () => {
  const limiter = new RateLimiter(6, 60000);
  for (let i = 0; i < 6; i++) assert(limiter.allow('one', 0));
  assert(!limiter.allow('one', 59999)); assert(limiter.allow('two', 59999));
  assert(limiter.allow('one', 60000));
});
await test('expired Map entries cleaned on requests without interval', () => {
  const limiter = new RateLimiter(6, 60000);
  for (let i = 0; i < 100; i++) limiter.allow(String(i), 0);
  limiter.allow('new', 60000);
  assert.equal(limiter.clients.size, 1);
});
await withServer({}, async () => result(), async ({ base, post, logs }) => {
  await test('first six POST requests succeed; seventh 429 exact structure', async () => {
    for (let i = 0; i < 6; i++) assert.equal((await post()).status, 200);
    const response = await post(); assert.equal(response.status, 429);
    assert.deepEqual(await response.json(), { error: 'RATE_LIMITED', message: '请求过于频繁，请稍后再试' });
  });
  await test('health and OPTIONS unrestricted after rate exhaustion', async () => {
    for (let i = 0; i < 8; i++) {
      assert.equal((await fetch(`${base}/health`)).status, 200);
      const response = await fetch(`${base}/api/food-recognition`, { method: 'OPTIONS', headers: { Origin: 'https://wu63924-bot.github.io' } });
      assert.equal(response.status, 204); assert.equal(response.headers.get('access-control-allow-origin'), 'https://wu63924-bot.github.io');
    }
  });
  await test('different client succeeds and logs contain no IP or image', async () => {
    assert.equal((await post('203.0.113.2')).status, 200);
    assert(logs.some(entry => entry.rate_limited === true));
    for (const entry of logs.filter(entry => entry.rate_limited)) assert.deepEqual(entry, { rate_limited: true });
    assert(!JSON.stringify(logs).includes('203.0.113.')); assert(!JSON.stringify(logs).includes('base64'));
  });
});
await test('rate rejection never calls Qwen; 429 preserves CORS', async () => {
  let calls = 0;
  await withServer({ rateLimitMax: 1 }, async () => { calls++; return result(); }, async ({ base, post }) => {
    await post();
    const response = await fetch(`${base}/api/food-recognition`, { method: 'POST', headers: { 'x-forwarded-for': '203.0.113.1', Origin: 'http://localhost:5173' } });
    assert.equal(response.status, 429); assert.equal(calls, 1);
    assert.equal(response.headers.get('access-control-allow-origin'), 'http://localhost:5173');
  });
});
await test('HTTP window expiration restores access', async () => {
  await withServer({ rateLimitMax: 1, rateLimitWindowMs: 20 }, async () => result(), async ({ post }) => {
    assert.equal((await post()).status, 200);
    await new Promise(resolve => setTimeout(resolve, 25));
    assert.equal((await post()).status, 200);
  });
});
await test('missing IP uses shared fallback without failing', async () => {
  await withServer({ rateLimitMax: 1 }, async () => result(), async ({ post }) => {
    assert.equal((await post('')).status, 200); assert.equal((await post('invalid')).status, 429);
  });
});
await test('two active Qwen requests allowed; third BUSY; success releases slots', async () => {
  const pending = []; let started;
  const ready = new Promise(resolve => { started = resolve; });
  await withServer({}, async () => new Promise(resolve => { pending.push(resolve); if (pending.length === 2) started(); }), async ({ post }) => {
    const first = post(); const second = post(); await ready;
    const busy = await post(); assert.equal(busy.status, 429);
    assert.deepEqual(await busy.json(), { error: 'BUSY', message: '识别服务繁忙，请稍后再试' });
    assert.equal(pending.length, 2);
    pending[0](result()); pending[1](result());
    assert.equal((await first).status, 200); assert.equal((await second).status, 200);
    const third = post();
    // Wait for actual admission, not a timing assumption.
    while (pending.length < 3) await new Promise(resolve => setTimeout(resolve, 1));
    pending[2](result()); assert.equal((await third).status, 200);
  });
});
for (const mode of ['failure', 'timeout', 'abort']) await test(`${mode} releases concurrent slot`, async () => {
  let calls = 0; let entered;
  const ready = new Promise(resolve => { entered = resolve; });
  await withServer({ maxConcurrent: 1, timeoutMs: 30 }, async (_url, options) => {
    calls++;
    if (calls > 1) return result();
    if (mode === 'failure') return new Response('', { status: 401 });
    entered();
    return new Promise((_resolve, reject) => options.signal.addEventListener('abort', () => reject(new DOMException('abort', 'AbortError')), { once: true }));
  }, async ({ post, logs }) => {
    const controller = new AbortController();
    const first = post('203.0.113.1', controller.signal);
    if (mode === 'abort') {
      const rejected = assert.rejects(first, { name: 'AbortError' });
      await ready; controller.abort(); await rejected;
      const deadline = Date.now() + 1000;
      while (!logs.length && Date.now() < deadline) await new Promise(resolve => setTimeout(resolve, 1));
      assert.equal(logs.length, 1);
    } else assert.equal((await first).status, mode === 'timeout' ? 504 : 502);
    assert.equal((await post()).status, 200); assert.equal(calls, 2);
  });
});
await test('wrong Content-Type and oversized actual chunked body never call Qwen', async () => {
  let calls = 0;
  await withServer({}, async () => { calls++; return result(); }, async ({ base }) => {
    assert.equal((await fetch(`${base}/api/food-recognition`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' })).status, 400);
    async function* body() { yield new Uint8Array(1024 * 1024 + 16385); }
    assert.equal((await fetch(`${base}/api/food-recognition`, { method: 'POST', headers: { 'Content-Type': 'multipart/form-data; boundary=x' }, body: body(), duplex: 'half' })).status, 413);
    assert.equal(calls, 0);
  });
});
await test('frontend 429 friendly messages; nested compatibility; invalid JSON fallback', async () => {
  const source = readFileSync(new URL('../src/services/foodRecognitionService.ts', import.meta.url), 'utf8').replaceAll('import.meta.env', '({})');
  const { RemoteFoodRecognitionProvider } = await import(`data:text/javascript;base64,${Buffer.from(stripTypeScriptTypes(source)).toString('base64')}`);
  const original = globalThis.fetch;
  try {
    for (const [code, message] of [['RATE_LIMITED', '操作太频繁，请稍后再试'], ['BUSY', 'AI识别服务繁忙，请稍后再试']]) {
      for (const error of [code, { code }]) {
        globalThis.fetch = async () => new Response(JSON.stringify({ error, message: 'private-detail' }), { status: 429 });
        await assert.rejects(() => new RemoteFoodRecognitionProvider('http://local').recognizeFood(image), { message });
      }
    }
    globalThis.fetch = async () => new Response('private-detail', { status: 429 });
    await assert.rejects(() => new RemoteFoodRecognitionProvider('http://local').recognizeFood(image), { message: '操作太频繁，请稍后再试' });
  } finally { globalThis.fetch = original; }
});
console.log(`${checks} Phase 6B-3 protection checks PASS; no actual Qwen call.`);
