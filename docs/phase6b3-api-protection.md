# Phase 6B-3：AI 接口轻量保护

## 实现与配置

仅 POST /api/food-recognition 使用保护。独立 server/rateLimiter.ts 实现固定窗口的单 FC 实例内存限流，默认每客户端 60000 毫秒允许 6 次，第 7 次返回 HTTP 429。无效图片、繁忙请求也计入次数，防止反复提交消耗处理资源。GET /health、OPTIONS 和其他路由不占限流次数。

服务器环境变量 AI_RATE_LIMIT_MAX=6、AI_RATE_LIMIT_WINDOW_MS=60000、AI_MAX_CONCURRENT=2 可调整配置；缺失或非正安全整数使用默认值。这些配置只加入 .env.example，不加入 .env.github。前端没有新增秘密或固定 Token。

客户端标识取 x-forwarded-for 中第一个经 node:net isIP 校验有效的 IPv4/IPv6 值。无有效值使用 unknown-client，因此缺失 IP 不报错，但这些请求共用额度。完整 IP 仅保留于进程 Map，不写日志。保护拒绝只记录 rate_limited: true；其他请求沿用原有脱敏日志字段，不记录图片、Key 或请求正文。

每个 API 进程最多同时运行 2 次识别。图片与 hint 校验通过后检查并发名额，已满立即返回 BUSY，不排队、不调用 Qwen。名额覆盖原有请求和重试过程，try/finally 在成功、失败、超时或客户端断开导致的 abort 后释放。25 秒 Qwen timeout 和既有重试策略不变。

Map 不使用 setInterval。每个窗口周期的首个请求触发扫描，删除窗口已过期的记录；单客户端过期时重建窗口。无新请求时不清理，也不新增记录。清理防止过期客户端跨窗口长期累积；窗口内大量不同 IP 仍可能增加内存占用。

## 响应与前端

限流：HTTP 429，`{"error":"RATE_LIMITED","message":"请求过于频繁，请稍后再试"}`。

繁忙：HTTP 429，`{"error":"BUSY","message":"识别服务繁忙，请稍后再试"}`。

RemoteFoodRecognitionProvider 显示“操作太频繁，请稍后再试”或“AI识别服务繁忙，请稍后再试”。兼容原有嵌套 error.code；未知或非 JSON 的 HTTP 429 使用频繁操作提示。不显示服务端返回的原始 message 或错误正文。

保持精确 CORS 白名单、multipart/form-data、1MB 图片上限、JPEG/PNG/WebP MIME 与文件签名校验。请求体总大小允许 1MB 图片加 16KB multipart 开销。Content-Length 超限早拒绝，缺失长度时仍按实际读取累计限制。图片只在内存处理，Key 只由服务器读取，health 不披露环境信息。Qwen Prompt、营养逻辑、FoodPhotoPage 和历史 Meal 数据不变。

## 安全边界

这是“单 FC 实例内存限流”，不是全球严格限流，也不是绝对防刷。FC 多实例各有自己的额度和并发计数，实例重启后状态清空，固定窗口边界可能连续通过两组请求。不同 IP 不共享额度，IPv6 不同文本表示也可能形成不同标识；共用公网 IP 的客户端则共用额度。

本实现前提是部署入口提供可信 x-forwarded-for。应用不自行验证代理身份；如果入口允许调用方伪造或保留该头，攻击者可更换 IP 绕过限流。CORS 也不能阻止非浏览器直接调用。本阶段未验证生产入口对转发头的处理。

平台级费用保护需要手动配置阿里云 FC 最大实例数。个人自用建议先设为 1，控制实例扩张；最大实例数限制不等于每天 Qwen 费用硬上限，持续请求和既有重试仍可产生费用。官方参考：[配置最大实例数](https://help.aliyun.com/en/functioncompute/overview-of-configuring-the-maximum-number-of-on-demand-instances)。本阶段不修改控制台、不声称已部署。

## 验证与手动更新

新增 16 组自动保护检查，覆盖窗口规则、独立客户端、IP fallback、过期 Map 清理、真实本地 HTTP 429、health/OPTIONS 豁免、拒绝不调用 Qwen、并发成功/失败/timeout/abort 释放、实际 chunked 体积限制和前端错误文案。原有 76 项 API 检查及 Mock、营养快照、备份回归继续运行。上游均模拟，未调用真实 Qwen。

上述测试及六项回归命令全部通过：npm run typecheck、npm run typecheck:api、npm run test:recognition、npm run build:api、npm run build、npm run build:github。编译后的 api-dist 通过本地 HTTP 冒烟检查，前六次成功，第七次返回 RATE_LIMITED。前端构建保留既有超过 500KB 包体积提示。

重新上传 api-dist 全部内容，放在代码包根目录：app.js、config.js、errors.js、image.js、index.js、prompt.js、qwenVisionClient.js、rateLimiter.js、schema.js、package.json。不上传 .env、前端 dist、源码或 node_modules。保持现有启动命令 npm run start:api、监听端口 9000、HOST=0.0.0.0、PORT=9000 和服务器 Key/Qwen 配置。

在 FC 设置上述三个 AI 环境变量，手动确认最大实例数。更新后先检查 /health、三来源 OPTIONS，再用正常照片检查识别；短时间第 7 次应返回约定 429。云端部署、FC 转发头可信性和 iPhone 真机回归需上传后验收。
