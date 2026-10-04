# Phase 6B-2A：本地与 FC Web Function 启动

本阶段只准备代码与本地验证，不部署云端。Qwen 请求逻辑和前端业务保持现有实现，生产前端仍使用已有 Mock 配置。

## 本地

在 web 目录配置被 Git 忽略的 .env：DASHSCOPE_API_KEY、QWEN_BASE_URL、可选 QWEN_MODEL；HOST 默认 0.0.0.0，PORT 默认 8788。

- 开发：npm run dev:api
- 生产编译：npm run build:api
- 运行编译后的 JavaScript：npm run start:api
- 健康检查：http://localhost:8788/health，响应只有 { "ok": true, "service": "fitflow-ai" }

## FC 3.0 Web Function 代码包

将 api-dist 的内容放在代码包根目录，包含全部编译后的 .js 和生成的 package.json；不要上传 .env、前端、源代码或开发依赖。此 API 只使用 Node 内置模块，运行依赖为零，因此无需 node_modules、tsx 或 ts-node。

运行环境使用 Node 22.18+（建议 Node 24）；启动命令 npm run start:api，监听端口 9000。服务器环境变量设置 HOST=0.0.0.0、PORT=9000、DASHSCOPE_API_KEY、QWEN_BASE_URL 和可选 QWEN_MODEL。监听端口必须与 FC 配置一致。根项目的 start:api 可读取本地 .env；代码包启动只读取 FC 注入的环境变量。

正式 CORS 来源 https://wu63924-bot.github.io；本地来源 http://localhost:5173 和 http://127.0.0.1:5173。允许 OPTIONS 预检与 POST /api/food-recognition；其他来源返回 403，无通配符。

保持 1MB 图片限制、JPEG/PNG/WebP MIME 与文件签名校验、25 秒 AI timeout。图片仅在内存处理，Key 仅从服务器环境变量读取。健康检查不披露环境、账号或 Qwen 配置信息。

官方参考：https://www.alibabacloud.com/help/en/functioncompute/creating-a-web-function

## 本轮验收（2026-10-04）

npm run typecheck、typecheck:api、build:api、build、build:github 全部通过。npm run test:recognition 的 76 项接口检查通过；有效图片 POST 使用注入的模拟 Qwen 响应，不调用真实供应商。

实际 npm run start:api 在 0.0.0.0:8788 启动，http://localhost:8788/health 返回 200 和约定 JSON；生产代码目录内的 npm run start:api 在 PORT=9000 下同样通过。两端口均通过三个来源 OPTIONS 与 POST 无效图片校验、禁止来源 403 检查。npm run dev:api 启动与健康检查通过。

Node 24.19.0 本地验证；未验证阿里云实际运行，未部署。前端构建有已有的超过 500kB 包体积提示。测试进程已停止；.env 保持 Git 忽略，未修改、未提交。
