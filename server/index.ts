import { readConfig } from './config.ts';
import { createApiServer } from './app.ts';
try {
  const config = readConfig();
  const server = createApiServer(config);
  server.on('error', () => { console.error('FitFlow API 启动失败，请检查监听地址和端口'); process.exitCode = 1; });
  server.listen(config.port, config.host, () => console.info(`FitFlow 识别 API 已启动，监听 ${config.host}:${config.port}`));
} catch { console.error('API 配置无效：请检查后端 DASHSCOPE_API_KEY、HTTPS QWEN_BASE_URL 和 PORT'); process.exitCode = 1; }
