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

`dist/` is static output. Configure the static host to serve `index.html` for application routes. `public/_redirects` provides the SPA fallback format used by Netlify; other hosts may need their equivalent rewrite.

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
- Photo selection and preview are implemented, with manual food selection. No AI request is made.
- Training counts, durations, calendars, and session details use IndexedDB records. The capacity percentage trend remains the existing Mock sample.
- Browser sound and notification behavior is not implemented. Vibration is attempted only when `navigator.vibrate` exists and is enabled.

## Phase 4：数据统计与趋势

入口为“日历 → 趋势”，直接地址 `/history?view=trends`。统计读取现有 IndexedDB，默认最近 30 天；图表无需外部依赖，支持离线。

计算口径、测试结果、已知边界与人工验收步骤见 [Phase 4 验收报告](docs/phase4-acceptance.md)。分析层断言运行：`node scripts/test-analytics.mjs`（Node 24）。
