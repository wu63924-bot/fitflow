# FitFlow Phase 6B-1：本地真实 AI 接口准备与验收

日期：2026-10-03。实现及模拟验收完成；用户选择先完成实现和模拟测试。未配置真实 Key、北京工作空间 endpoint 或真实餐食照片，因此没有实际调用 Qwen，真实识别效果待验收。本轮没有部署、提交或推送。

## 1. 新增文件

- `server/config.ts`：后端环境读取与 URL 验证。
- `server/index.ts`：本地启动入口。
- `server/app.ts`：原生 HTTP 路由、multipart、CORS、统一响应与安全日志。
- `server/image.ts`：文件大小、MIME、文件签名验证。
- `server/errors.ts`：错误代码、状态与公开提示。
- `server/prompt.ts`：唯一识别 Prompt。
- `server/schema.ts`：结构验证与响应清理。
- `server/qwenVisionClient.ts`：上游请求、超时与有限重试。
- `tsconfig.server.json`：独立严格后端类型检查。
- `.env.example`：空后端凭据和公开前端配置。
- `scripts/test-food-recognition-api.mjs`：45 项接口/Provider 测试。
- `docs/phase6b1-acceptance.md`：本报告。

## 2. 修改文件

- `src/services/foodRecognitionService.ts`：保留 Mock；增加 Remote、AbortSignal、友好错误、名称匹配和开发/生产切换。
- `src/pages/FoodPhotoPage.tsx`：取消请求、未匹配项、名称编辑及本地营养来源校验；保留原页面与六种状态。
- `src/pages/NutritionPages.tsx`：识别入口使用中性说明。
- `scripts/test-food-recognition.mjs`：适配 Vite 环境读取，保留 Phase 6A 回归断言。
- `package.json`、`package-lock.json`：新增脚本及开发依赖 `@types/node`，无新增运行时框架。
- `.gitignore`：保留环境文件忽略并允许 `.env.example`。
- `README.md`：使用步骤和阶段边界。

工作区原有 Phase 6A 未提交修改仍保留，包括 main、mealRepository、nutrition、styles 等；本轮未进一步修改它们，也未修改数据库 schema、训练、日历、趋势、部署 workflow 或 Vite 配置。

## 3–5. 本地 API 技术、路由与端口

Node 原生 `http` + TypeScript + 原生 fetch/FormData，不引入 Express、SDK、ORM 或数据库。

- 仅监听 `127.0.0.1:8788`。
- `POST /api/food-recognition`。
- multipart：单个 `image`，可选最多 500 字符的 `hint`。
- 接收体限制为 1 MiB + 16 KiB multipart 开销，图片本身最大 1 MiB。
- 非 POST 返回 405，未知路由返回 404。
- 不需要用户标识或登录。

## 6–9. Qwen 请求与配置

`POST ${QWEN_BASE_URL}/chat/completions`，JSON，后端 Bearer 鉴权；不使用复杂 SDK。关闭 thinking、非流式返回，限制生成 tokens。

默认 model 仅由后端 config 设置为 `qwen3-vl-flash`，可由 `QWEN_MODEL` 替换。

`QWEN_BASE_URL` 必须由用户填写实际北京工作空间完整 HTTPS OpenAI-compatible 地址，路径以 `/compatible-mode/v1` 结束，不猜 WorkspaceId。URL 不允许凭据、query、fragment。

Key 只由后端进程环境读取；可在被 Git 忽略的本地 `.env` 中配置。前端仅读取两个公开的 `VITE_FOOD_RECOGNITION_*` 变量。没有创建真实 `.env` 或保存真实 Key。

## 10–11. 图片传输与隐私

继续使用 Phase 6A 压缩：JPEG/PNG/WebP、最长边最多 1600 px、压缩结果最多 1 MiB；源图超过 20 MiB/60 MP 拒绝。

后端校验非空、大小、MIME 与对应 JPEG/PNG/WebP 文件签名，不依赖文件名。Blob 在内存中转 Base64 data URL，作为 `image_url` 输入，后跟 text Prompt。

不落盘、不存数据库、不上传 OSS、不产生公开图片地址、不记录图片或 Base64。一次调用完成后局部图片和请求引用退出作用域，由运行时回收。前端在重选、取消、保存、卸载时继续释放 Object URL。Remote 模式页面明确说明图片会发给 AI；不承诺上游平台的保留策略。

## 12. Prompt

位置 `server/prompt.ts`。只识别主要可见食物，返回简洁中文名、估算可食用克数、置信度提示。不确定则降低 confidence，不强猜隐藏配料，不假装准确称重，不提供营养或健康/减脂/训练建议。没有食物返回空数组，最多 20 项。

## 13–14. 原始响应解析与 Schema

`choices[0].message.content` → trim → 仅移除最外围 JSON Markdown fence → JSON.parse → 逐项严格检查 → 新建 `{foods}` 响应。

- foods 数组最多 20 项；空数组合法，前端提示重新拍摄或手动添加。
- name 字符串，trim 后 1～60 字符。
- estimatedGrams 有限 number，`0 < grams <= 3000`。
- confidence 有限 number，`0 <= confidence <= 1`。
- 非法项导致整份结果失败，测试覆盖该统一策略。
- 只复制三个允许字段，模型营养值或其他字段丢弃。
- 不拼接修复 JSON、不自修复循环、不返回原始响应。

采用手写小型类型守卫，未增加 Zod 或 any，也未关闭类型检查。

## 15–16. Timeout 与 Retry

AbortController 的 25 秒总预算覆盖两次尝试、上游响应读取。到时中断并返回 AI_TIMEOUT。

最多重试一次，仅临时网络异常或 5xx。400/401/403/413/429、输入错误、JSON/Schema 错误和超时不重试。客户端关闭连接会中止上游；不进行无限等待或无限重试。

## 17. 错误映射

| 情况 | code | API HTTP |
| --- | --- | --- |
| 缺失、空图片、伪造签名或非法 multipart | INVALID_IMAGE | 400 |
| 图片超过 1 MiB | IMAGE_TOO_LARGE | 413 |
| MIME 不支持 | UNSUPPORTED_IMAGE | 415 |
| 超时 | AI_TIMEOUT | 504 |
| 上游 401/403 | AI_AUTH_ERROR | 502 |
| 上游 429 | AI_RATE_LIMIT | 503 |
| 其他上游 4xx、JSON/Schema 非法 | AI_BAD_RESPONSE | 502 |
| 网络失败/上游 5xx | AI_UNAVAILABLE | 503 |
| 非预期内部错误 | INTERNAL_ERROR | 500 |

响应只包含 `{error:{code,message}}`。前端按 code 映射中文提示，不展示上游错误、stack、鉴权头或内部 endpoint。

## 18–19. CORS 与日志

本阶段只允许 HTTP loopback（localhost、127.0.0.1、::1）的 4173～5199 端口，涵盖 Vite 默认 dev/preview 及验收端口。OPTIONS 返回 204；不允许外部/局域网 Origin，不开放 credentials。无 Origin 的本地工具可请求。

成功和识别业务错误仅记录时间、耗时、HTTP 状态、错误 code、AI 耗时和食物数量。启动错误使用固定提示。不会打印配置值、Authorization、图片、Prompt 或完整上游 response。所有识别响应 `Cache-Control: no-store`。

## 20–21. Remote 与切换

`FoodRecognitionProvider.recognizeFood(image: Blob, signal?: AbortSignal)`。Remote 通过原生 FormData 发向公开 API URL，不手动设置 boundary。Provider 负责错误与本地名称匹配；页面不直接调用 Qwen。

开发服务器仅当 `VITE_FOOD_RECOGNITION_PROVIDER=remote` 时选择 Remote，默认 Mock。缺少后端配置不影响整个前端启动；识别时友好提示。

**本阶段两个 production build 强制使用 Mock**，即使本地 dev 环境设置了 remote，也不会将本地 API URL 或 Remote 请求入口打包进静态产物。未来 Phase 6B-2 需要显式调整此限制并配置公网 API；本轮未做。

取消、离开页面及重选会中断未完成识别；请求编号同时防止旧结果覆盖新图片。保存继续用现有锁和稳定 item ID 防止重复。

## 22–23. Food 匹配与营养

保持现有本地 Food 选择和替换流程；新增精确名称匹配、去空格及少量明确别名（白米饭/白饭→米饭、水煮鸡蛋/煮鸡蛋→鸡蛋）。不对复杂菜肴做宽泛猜测。

未匹配结果继续保留名称、克数、置信度，显示提示并可编辑名称/删除/添加遗漏食物；先选择本地营养来源才能保存。未匹配项暂不计入汇总。

营养继续来自本地 Food，每 100g × 克数 /100；调用 `createMealItemInGrams`、`calculateMealItem`、`sumItems`。只覆盖用户确认后的名称快照，不修改计算口径。通过现有 `addMealItems` 事务写入 mealRepository/IndexedDB；无新数据库，无 schema 升级。

## 24–26. 配置与真实使用步骤

推荐 Node 22.18+ 或 Node 24。实际本轮使用 Node 24.19.0。在项目目录打开 PowerShell：

```powershell
Copy-Item .env.example .env
```

在本地编辑 `.env`，不要把 Key 发到聊天或提交 Git：

```dotenv
DASHSCOPE_API_KEY=
QWEN_BASE_URL=
QWEN_MODEL=qwen3-vl-flash
VITE_FOOD_RECOGNITION_API_URL=http://localhost:8788
VITE_FOOD_RECOGNITION_PROVIDER=remote
```

填写前两项真实本地配置后，终端 A：

```powershell
npm run dev:api
```

终端 B：

```powershell
npm run dev
```

使用终端显示的前端 URL（一般 localhost:5173），饮食 → AI 拍照识别 → 真实餐食照片 → 识别 → 确认本地营养匹配 → 米饭 180g 改为 220g → 午餐 → 保存 → 刷新检查。真实结果会随照片变化，不保证恰好识别示例食物。

回退：关闭 API，将前端 provider 设回 mock，重启前端。`dev:api` 读取 `.env`，也支持启动终端已设置的环境变量；更改配置后重启。API 仅电脑本地接入，未开放手机局域网后端。

## 27–31. 验证结果

| 检查 | 结果 |
| --- | --- |
| npm run typecheck | PASS |
| npm run typecheck:api | PASS |
| npm run test:recognition：Phase 6A 回归 | PASS |
| 新增后端/HTTP/Provider 断言 | 45 PASS |
| npm run build | PASS，base `/` |
| npm run build:github | PASS，base `/fitflow/` |
| Remote 本地 HTTP 浏览器闭环（模拟 Qwen） | PASS |
| API 关闭后的 GitHub 静态 Mock 识别与保存 | PASS |
| 两种 production 的 HTML、manifest、图标、SW 路径 | PASS |
| GitHub 404.html 与 .nojekyll | PASS |
| 开发环境 remote 时 production 仍 Mock | PASS，产物无本地 API URL/请求入口 |
| GitHub SW 注册、scope 与 App Shell 缓存 | PASS |
| 停止静态服务器后根路径及 /fitflow/ 刷新启动 | PASS |
| 已保存饮食的离线刷新与持久化 | PASS |
| 真实 Qwen + 真实餐食识别 | 未执行，待用户配置 |

测试覆盖合法/空/fence/非 JSON/缺 foods/非法名称、重量、置信度、项目数、额外字段清除，401/403/429/500、超时、网络异常、重试次数、图片大小/MIME/签名/空文件、HTTP multipart/CORS/no-store、Remote/Mock 预先与进行中取消、未知食物保留、友好错误、营养与快照/备份回归。超时测试缩短时间以验证同一机制。

浏览器真实运行了前端压缩 → Remote → 本地 API → 模拟上游响应 → Schema → 编辑 → mealRepository → IndexedDB：180g 白米饭改为 220g；未知蔬菜保留，直接保存被阻止，手动匹配西兰花，名称改为“午餐西兰花”。保存后 549 kcal / P51.5g / C67.5g / F6.1g，刷新仍有三项记录。测试图片为生成的非真实餐食 fixture。

关闭 API 后 GitHub production Mock 返回 200g 米饭、150g 鸡胸肉、100g 西兰花，保存 543 kcal 并离线刷新成功。Service Worker 缓存仅 App Shell 和静态资源，不缓存 API。

训练/日历/趋势及完整备份恢复 UI 本轮没有再次逐项操作；这些源码与 schema 未改，备份解析/快照回归通过。物理手机相机及安装模式未重新验收。

## 32. Secret 扫描

检查 src、server、public、dist、scripts、README 及环境样例。DASHSCOPE_API_KEY/Authorization/Bearer 仅出现在后端配置、固定启动提示、后端请求构造和测试配置引用；无真实凭据。src/public/dist 没有这些鉴权字段，也没有 VITE_*API_KEY 或常见真实 Key 形态。后续若填写 `.env`，它将被 Git 忽略，不应输出或分享其内容。

## 33. 已知问题与边界

- 真实 workspace 连通性、模型权限、账单和识别质量未验收，因为用户尚未配置。
- 基础名称别名覆盖有限；未匹配菜肴需要用户选本地营养来源。
- 图片签名验证不等于完整解码；无法处理的图片由上游错误机制安全返回。
- 目前 backend 为 loopback、无生产鉴权/限流，不能直接当作公网服务部署。
- production 强制 Mock，真实 AI 目前只能在本地 dev 使用。
- 本地测试 Node 24；没有另装 Node 22 重跑。
- 现有主 bundle 约 523 KB，仍有超过 500 KB 的构建提示，构建通过；未为本任务修改无关拆包设计。
- 本轮临时模拟 API、Vite 和静态预览服务器已停止，没有留下模拟服务冒充真实 API。

## 34. Phase 6B-2 未来工作（未实施）

选择并部署公网后端，配置后端 Secret 与 HTTPS；明确允许的生产 CORS，加入适当鉴权/滥用保护/限流和成本限制；调整生产 provider 与公网 API URL，完成真实照片、移动端与生产隐私流程验收。继续保持 API 不被 Service Worker 缓存，保持本地营养快照与 IndexedDB 数据层。本轮没有选择或连接部署平台。

参考：[Model Studio Chat Completions](https://www.alibabacloud.com/help/en/model-studio/qwen-api-via-openai-chat-completions)、[Qwen VL 图像输入与 thinking 参数](https://help.aliyun.com/en/model-studio/vision)。
