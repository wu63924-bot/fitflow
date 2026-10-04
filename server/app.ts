import { createServer } from 'node:http';
import type { IncomingMessage } from 'node:http';
import type { ApiConfig } from './config.ts';
import { ApiError } from './errors.ts';
import { maxImageBytes, validateImage } from './image.ts';
import { recognizeWithQwen } from './qwenVisionClient.ts';

export function isLocalOrigin(origin: string) {
  try { const url = new URL(origin); return url.protocol === 'http:' && ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname) && Number(url.port) >= 4173 && Number(url.port) <= 5199 && url.origin === origin; } catch { return false; }
}
async function readForm(req: IncomingMessage) {
  const type = req.headers['content-type'] || '';
  if (!type.startsWith('multipart/form-data;')) throw new ApiError('INVALID_IMAGE');
  const limit = maxImageBytes + 16384;
  if (Number(req.headers['content-length']) > limit) { req.resume(); throw new ApiError('IMAGE_TOO_LARGE'); }
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of req) {
    const bytes: Buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    size += bytes.length;
    if (size > limit) { req.resume(); throw new ApiError('IMAGE_TOO_LARGE'); }
    chunks.push(bytes);
  }
  try { return await new Response(Buffer.concat(chunks), { headers: { 'Content-Type': type } }).formData(); }
  catch { throw new ApiError('INVALID_IMAGE'); }
}
export function createApiServer(config: ApiConfig, request: typeof fetch = fetch, log: (entry: object) => void = entry => console.info(JSON.stringify(entry))) {
  const server = createServer(async (req, res) => {
    const started = Date.now();
    const controller = new AbortController();
    res.on('close', () => { if (!res.writableEnded) controller.abort(); });
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('Vary', 'Origin');
    const origin = req.headers.origin;
    if (origin && !isLocalOrigin(origin)) { res.writeHead(403).end(); return; }
    if (origin) res.setHeader('Access-Control-Allow-Origin', origin);
    if (req.method === 'OPTIONS') { res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS'); res.setHeader('Access-Control-Allow-Headers', 'Content-Type'); res.writeHead(204).end(); return; }
    if (req.url !== '/api/food-recognition') { res.writeHead(404).end(); return; }
    if (req.method !== 'POST') { res.setHeader('Allow', 'POST'); res.writeHead(405).end(); return; }
    let status = 200;
    let code = 'OK';
    let foodCount = 0;
    let aiDurationMs = 0;
    try {
      const form = await readForm(req);
      if (form.getAll('image').length !== 1) throw new ApiError('INVALID_IMAGE');
      const image = await validateImage(form.get('image'));
      const hint = form.get('hint');
      if (hint !== null && (typeof hint !== 'string' || hint.length > 500)) throw new ApiError('INVALID_IMAGE');
      const aiStart = Date.now();
      let result;
      try { result = await recognizeWithQwen(image, typeof hint === 'string' ? hint.trim() : '', config, controller.signal, request); }
      finally { aiDurationMs = Date.now() - aiStart; }
      foodCount = result.foods.length;
      res.setHeader('Content-Type', 'application/json; charset=utf-8');
      res.end(JSON.stringify(result));
    } catch (reason) {
      const error = reason instanceof ApiError ? reason : new ApiError('INTERNAL_ERROR');
      status = error.status; code = error.code;
      if (!res.destroyed) { res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' }); res.end(JSON.stringify({ error: { code, message: error.message } })); }
    } finally { log({ time: new Date().toISOString(), durationMs: Date.now() - started, status, code, aiDurationMs, foodCount }); }
  });
  server.requestTimeout = 10000;
  server.headersTimeout = 10000;
  return server;
}
