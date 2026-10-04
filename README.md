# FitFlow Web / PWA

FitFlow is a Web/PWA app built with React, TypeScript, Vite, React Router, Dexie, and IndexedDB. It uses local browser storage and does not connect to a backend or AI service.

## Run locally

```sh
npm install
npm run dev
```

For a phone on the same Wi-Fi network, run:

```sh
npm run dev -- --host 0.0.0.0
```

Open `http://<computer-lan-ip>:5173` on the phone. The Vite development server is for layout and interaction checks; service-worker installation needs a secure context. Use an HTTPS preview/deployment to verify installation and offline behavior.

## Build

```sh
npm run typecheck
npm run build
npm run preview
```

`dist/` is static output. Configure the static host to serve `index.html` for application routes. For Cloudflare Workers static assets, retain the existing SPA fallback configuration (for example, `assets.not_found_handling: "single-page-application"`).

## GitHub Pages build

```sh
npm run build:github
npm run preview -- --mode github
```

Open `http://localhost:4173/fitflow/` to preview. The `github` Vite mode uses `/fitflow/`; ordinary development and `npm run build` use `/`. Both commands write to `dist/`, so build for the intended host before using that output. The GitHub Pages target is `https://wu63924-bot.github.io/fitflow/`.

React Router reads `import.meta.env.BASE_URL` as its basename. Internal route paths stay unchanged; generated links include the deployment prefix. Vite applies the same base to HTML, assets, the manifest link, and service-worker registration. The manifest's `start_url`, `scope`, and icons use that base; the worker is registered at `/fitflow/sw.js` with scope `/fitflow/` for GitHub Pages. It precaches the app shell and static resources without runtime API caching.

The GitHub build also copies `index.html` to `404.html` and writes `.nojekyll`. Publish the complete contents of `dist/` at the repository site's root, including these files. GitHub Pages uses `404.html` for direct visits to client-side paths such as `/fitflow/history`; React Router then renders that page at its original URL. The initial response has HTTP 404 status, although the app loads. After service-worker activation, navigation can use the cached app shell. Vite preview has an SPA fallback, so it does not reproduce this initial 404 status.

`.github/workflows/deploy-pages.yml` builds and deploys on pushes to `main` and supports manual dispatch. It uses Node 22, `npm ci`, and `npm run build:github`, then uploads `dist/` through the official Pages Actions. Set the repository's Settings → Pages → Source to GitHub Actions before the first run. Verify installation on HTTPS after deployment; localhost verification does not establish physical-device installation. IndexedDB schema and database name are unchanged. Cloudflare and GitHub Pages are different origins, so transfer existing local data with the backup export/import flow if needed.

## Local database

`FitFlowDB` is wrapped by Dexie. Page components call repositories; only `src/db/` and repository modules access Dexie directly.

| Table | Primary key | Purpose |
| --- | --- | --- |
| `trainingPlans` | `id` | Editable seven-day plans and planned movements |
| `exercises` | `id` | Seeded and custom exercise definitions |
| `workoutSessions` | `id` | In-progress and completed sessions, set values, start/end times, and rest timer timestamps |
| `dailySchedules` | `date` | Per-day strength, cardio, rest, and notes; starting a strength plan creates its session |
| `meals` | `id` | Date and meal groups, with item-level nutrition snapshots |
| `foods` | `id` | Editable local food catalog and custom foods |
| `favoriteFoods` | `foodId` | Favorite food references |
| `recentFoods` | `foodId` | Recent food references and use times |
| `bodyRecords` | `date` | Weight and height history |
| `nutritionTargets` | `id` | Current daily nutrition targets |
| `settings` | `id` | Current plan, training preferences, and local profile |

The first open seeds the PPL plan, exercise library, local food catalog, sample body records, and default targets. It does not create meal entries, completed workouts, or calendar schedules. Food nutrition values are estimates and can be edited; each meal item keeps the name and nutrition values used when it was recorded. Data stays local to the browser origin. Core data is never written to `localStorage`. The “复制到今天” action appears only in the details of a completed workout, so a clean browser profile has no source to copy until a workout is completed.

## Backup and restore

`我的 → 数据管理` exports version 3 `FitFlow` JSON containing training plans, workouts, schedules, meal snapshots, the editable food catalog, favorites, recent foods, nutrition targets, body records, and settings. Version 1 and 2 backups are normalized on import; older meal values are kept as historical snapshots. Confirming restore replaces local tables in one IndexedDB transaction. “清理本机数据” initializes the starter plan and food catalog without adding meal entries.

## PWA

The Vite PWA plugin generates a standalone manifest and service worker. The worker precaches the built HTML, JavaScript, CSS, icons, and fonts; it does not cache API or arbitrary network requests. The temporary FitFlow icon is in `public/`. On Android Chrome/Edge, use the browser's install option. On iPhone, open the HTTPS site in Safari and choose Share → Add to Home Screen.

## Manual acceptance

- Check the five tabs and page layout at 375, 390, 430, and 768 px, then at a desktop width. Confirm no horizontal scrolling and usable inputs with the keyboard open.
- Create a plan; edit a day; add, reorder, configure, and remove movements; duplicate a plan; switch the active plan.
- Start a workout; change weight and reps; complete a set; adjust or skip rest; switch exercises; add/delete a set; finish and open its report.
- While a session is active, refresh the page or close/reopen the installed app. Continue the saved session and confirm both elapsed time and rest time recalibrate.
- Finish a session and confirm the calendar, date details, sets, and volume show that record after reopening the browser.
- In “日历”, select today, choose “安排今天 → 力量训练”, and save. Refresh, start it, complete a set, and confirm the rest timer starts. Finish and confirm the schedule and session both show completed.
- Select a future date and schedule strength or cardio. Confirm it remains after refresh and cannot start before that day. Schedule a rest day, delete it, and save a note; confirm these changes persist after refresh.
- With no other plan for today, schedule cardio, then enter actual duration, optional distance, and a note. Refresh and confirm the values remain.
- Open a past completed workout and choose “复制到今天”. Confirm it first creates a planned schedule, then creates a new session only when started. Edit today's set data and confirm the source workout is unchanged.
- In “饮食”, add eggs to breakfast, record two pieces, and confirm the calculated values. Change the amount, move it to another meal, remove it, and undo the removal.
- Favorite a food, add it once, and confirm “常吃” and “最近吃过” display it. Create a custom food and edit an existing catalog item.
- Navigate to yesterday and copy its breakfast into today. Change a copied amount and confirm yesterday's entry is unchanged. Confirm future dates cannot save meal entries.
- Refresh and reopen the app; confirm meal records remain, the home nutrition totals update, and a past history detail shows its food names, amounts, and totals.
- Export version 3 and confirm `data.foods`, `data.favoriteFoods`, `data.recentFoods`, `data.meals`, and `data.nutritionTarget` are present. Clear the test data, restore the export, and confirm the food catalog and meals return. Import version 1 and 2 backups to verify migration.
- Install on HTTPS, load the app once, disconnect the network, then reopen it and search the food catalog, add a meal item, and view local history.
- Install on HTTPS, load the app once, disconnect the network, then reopen it and save a training change.

## Current limits

- Browser storage is isolated by browser and site origin, including different ports on the same computer. Data can be transferred with a FitFlow backup file.
- Production AI photo recognition uses a local Mock provider: choose a JPEG/PNG/WebP image, review and edit the demo foods and gram weights, then save to the existing meal records. Images are compressed to at most 1600 px on the longest side and 1 MB; originals above 20 MB or 60 megapixels are rejected. HEIC needs conversion. No image is uploaded or stored in IndexedDB, and no real AI request is made. See [Phase 6A acceptance](docs/phase6a-acceptance.md).
- Training counts, durations, calendars, and session details use IndexedDB records. The capacity percentage trend remains the existing Mock sample.
- Browser sound and notification behavior is not implemented. Vibration is attempted only when `navigator.vibrate` exists and is enabled.

## Phase 4：数据统计与趋势

入口为“日历 → 趋势”，直接地址 `/history?view=trends`。统计读取现有 IndexedDB，默认最近 30 天；图表无需外部依赖，支持离线。

计算口径、测试结果、已知边界与人工验收步骤见 [Phase 4 验收报告](docs/phase4-acceptance.md)。分析层断言运行：`node scripts/test-analytics.mjs`（Node 24）。

## Phase 6B-1：本地 Qwen 食物识别

本阶段仅增加本地 API。真实 Qwen 验收需自行在本地配置凭据；本轮已完成模拟测试，未部署。推荐 Node 22.18+ 或 Node 24。

在本项目目录（`C:\Users\wy\Documents\ChatGPT\健身小程序\web`）：

1. `Copy-Item .env.example .env`，在本地编辑被 Git 忽略的 `.env`。
2. 填写后端 `DASHSCOPE_API_KEY`、实际北京工作空间 `QWEN_BASE_URL`；模型默认 `qwen3-vl-flash`。不要在聊天、前端变量或 Git 中放 Key。
3. 将 `VITE_FOOD_RECOGNITION_PROVIDER` 改为 `remote`，公开 API 地址为 `VITE_FOOD_RECOGNITION_API_URL=http://localhost:8788`。
4. 终端 A：`npm run dev:api`；终端 B：`npm run dev`。更改环境后重启。
5. 打开 Vite 显示的本地 URL，饮食 → AI 拍照识别 → 选择真实餐食照片 → 识别 → 确认 AI估算的名称、重量与整份营养 → 保存。

本地 API 使用 Node 原生 HTTP，仅监听 `127.0.0.1:8788`，路由 `POST /api/food-recognition`。图片只在内存用于本次调用，不保存原图；AI 路径直接返回名称、克数、整份热量/蛋白质/碳水/脂肪与置信度，不匹配本地 Food 库。确认后直接保存营养快照，并标记“AI估算”；手动添加仍使用本地 Food 库。重量和营养独立编辑，修改重量不自动修改整份营养。

将 provider 改回 `mock` 并重启前端即可回退。**本阶段 `build` 和 `build:github` 均强制 Mock**，开发环境的 Remote 设置不会使静态站点请求 localhost。GitHub `/fitflow/` 和 Cloudflare `/` 构建方式保持原样。公网 Remote 留待 Phase 6B-2。

验证命令：`npm run typecheck`、`npm run typecheck:api`、`npm run test:recognition`、`npm run build`、`npm run build:github`。

当前 AI 直接营养快照流程、73 项接口检查和浏览器回归结果见 [AI 食物识别简化验收](docs/ai-food-simplification-acceptance.md)。早期 [Phase 6B-1 报告](docs/phase6b1-acceptance.md) 中的 Food 匹配流程已被本次简化替代。本地 API 需要重启才会使用新 Prompt 和七字段响应校验。
