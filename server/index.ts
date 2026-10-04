import { readConfig } from './config.ts';
import { createApiServer } from './app.ts';
try {
  const config = readConfig();
  const server = createApiServer(config);
  server.on('error', () => { console.error('本地 API 启动失败，请检查端口 8788 是否占用'); process.exitCode = 1; });
  server.listen(config.port, '127.0.0.1', () => console.info('FitFlow 本地识别 API 已启动，端口 8788'));
} catch { console.error('本地 API 配置无效：请检查后端 DASHSCOPE_API_KEY 和 HTTPS QWEN_BASE_URL'); process.exitCode = 1; }
