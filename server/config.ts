export interface ApiConfig { apiKey: string; baseUrl: string; model: string; host: string; port: number; timeoutMs: number; rateLimitMax?: number; rateLimitWindowMs?: number; maxConcurrent?: number }

function positiveInteger(value: string | undefined, fallback: number) {
  const number = Number(value);
  return Number.isSafeInteger(number) && number > 0 ? number : fallback;
}

export function readConfig(env: NodeJS.ProcessEnv = process.env): ApiConfig {
  const apiKey = env.DASHSCOPE_API_KEY?.trim() || '';
  const baseUrl = (env.QWEN_BASE_URL?.trim() || '').replace(/\/+$/, '');
  if (!apiKey || !baseUrl) throw new Error('请在本地后端环境配置 DASHSCOPE_API_KEY 和 QWEN_BASE_URL');
  const url = new URL(baseUrl);
  if (url.protocol !== 'https:' || url.username || url.password || url.search || url.hash || !url.pathname.endsWith('/compatible-mode/v1')) throw new Error('QWEN_BASE_URL 需为完整 HTTPS compatible-mode/v1 地址');
  return { apiKey, baseUrl, model: env.QWEN_MODEL?.trim() || 'qwen3-vl-flash', host: env.HOST ?? '0.0.0.0', port: Number(env.PORT ?? 8788), timeoutMs: 25000,
    rateLimitMax: positiveInteger(env.AI_RATE_LIMIT_MAX, 6), rateLimitWindowMs: positiveInteger(env.AI_RATE_LIMIT_WINDOW_MS, 60000), maxConcurrent: positiveInteger(env.AI_MAX_CONCURRENT, 2) };
}
