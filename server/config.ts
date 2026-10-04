export interface ApiConfig { apiKey: string; baseUrl: string; model: string; port: number; timeoutMs: number }

export function readConfig(env: NodeJS.ProcessEnv = process.env): ApiConfig {
  const apiKey = env.DASHSCOPE_API_KEY?.trim() || '';
  const baseUrl = (env.QWEN_BASE_URL?.trim() || '').replace(/\/+$/, '');
  if (!apiKey || !baseUrl) throw new Error('请在本地后端环境配置 DASHSCOPE_API_KEY 和 QWEN_BASE_URL');
  const url = new URL(baseUrl);
  if (url.protocol !== 'https:' || url.username || url.password || url.search || url.hash || !url.pathname.endsWith('/compatible-mode/v1')) throw new Error('QWEN_BASE_URL 需为完整 HTTPS compatible-mode/v1 地址');
  return { apiKey, baseUrl, model: env.QWEN_MODEL?.trim() || 'qwen3-vl-flash', port: 8788, timeoutMs: 25000 };
}
