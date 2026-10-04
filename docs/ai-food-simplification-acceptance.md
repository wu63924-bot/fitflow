# AI 食物识别简化验收

日期：2026-10-03。此报告描述当前行为，取代 Phase 6A/6B-1 报告中的本地 Food 匹配与营养来源说明。没有部署公网。

## 当前流程

Qwen 返回 `name`、`estimatedGrams`、`calories`、`protein`、`carbs`、`fat`、`confidence`。营养字段为该项估算重量对应的整份总量；热量单位 kcal，宏量营养单位 g。前端独立编辑名称、重量及四项营养值，改重量不会自动修改整份营养值，页面明确说明这一口径。

确认后 `createAiMealItem` 直接创建 `MealItem.nutritionSnapshot`，以确认后的重量作为 `referenceAmount`，单位 g。沿用 `addMealItems` 事务及稳定 ID 保存，重试不会重复添加。不创建或查找 Food，复杂菜品和食物库中不存在的名称均可保存。

每条 AI 记录含可选字段 `nutritionSource: 'ai'`；识别编辑页、营养汇总和饮食记录均显示“AI估算”，修改及复制记录不移除来源标记，备份保留此字段。旧记录没有此字段，继续按原逻辑显示和计算。为兼容既有 MealItem 类型，AI 项目的 foodId 为 `ai-${id}`，它不是 Food 库外键；现有数据层没有要求 MealItem 关联 Food。

保存后在饮食记录修改份量，仍用现有 snapshot 计算比例。例如确认 220g / 440 kcal 后，把已保存份量改为 110g，得到 220 kcal。

## 删除与保留

- 删除 `foodMatcher.ts`、AI 路径中的别名匹配、候选、手动绑定、FoodDraft 和 FoodEditor 入口。
- 删除匹配专用的启动别名补充工作。既有 Food aliases 字段、目录内容和备份兼容保留，AI 路径不读取这些数据。
- 保留 Mock / Remote Provider、请求取消、友好错误、图片压缩、Qwen 后端、超时和重试、HTTPS 配置校验、loopback/CORS、图片签名验证、安全日志与凭据隔离。
- 后端及前端均检查七字段；营养字段不得缺失、为字符串、负数或非有限数。各项营养限制为 0～10000；Remote 重量保持 `0 < grams <= 3000`，用户编辑保存重量为 `0 < grams <= 10000`。
- 手动添加继续用原本地 Food Catalog 和 nutrition utility，没有改变每 100g/100ml 及“个”的计算方式。
- 未增加可选“保存为常用食物”按钮；AI 保存不自动写入 Food。
- IndexedDB 仍为 v3，索引和备份版本不变，nutrition utility、训练、日历、趋势源码未修改。
- 原生产构建强制 Mock 的限制保留。Remote 仍用于本地开发，未增加公网接入。

## 验证结果

| 验证 | 结果 |
| --- | --- |
| npm run typecheck | PASS |
| npm run typecheck:api | PASS |
| npm run test:recognition | PASS，73 项 API/Provider 检查及营养、快照、备份回归 |
| npm run build | PASS |
| npm run build:github | PASS |
| Mock 浏览器识别、编辑、删除、保存、刷新 | PASS |
| Remote 浏览器完整 HTTP 闭环（模拟 Qwen 上游） | PASS |
| 未知复合菜品不匹配 Food，直接保存 | PASS |
| 空营养值阻止保存，修正后保存成功 | PASS |
| 重量 220g，确认热量 440 kcal、P30g、C35g、F20g | PASS，编辑值与保存快照一致 |
| 保存没有增加 Food 或自定义 Food 数量 | PASS |
| IndexedDB v3、真实备份导出/清空测试记录/恢复 | PASS，快照和 AI 来源标记一致 |
| 保存后份量比例计算、复制后的 AI 来源 | PASS |
| 手动添加鸡蛋两个 | PASS，143 kcal，仍关联 food-egg，无 AI 标记 |
| 图片 2000×1000 压缩为 1600×800 | PASS |
| 390px 页面截图检查、无水平溢出、无浏览器异常 | PASS |

浏览器测试使用隔离的无界面 Edge 上下文、本地端口 5183/5184 和模拟 API 8791，没有修改用户已有浏览器数据。模拟 Qwen 通过真实后端 HTTP multipart、Prompt/响应解析及七字段校验，再由 Remote Provider 返回页面。

构建仍提示主 bundle 超过 500 kB，构建成功。本轮没有重新调用真实 Qwen，也没有复测物理手机摄像头或真实餐食营养估算准确性。已有本地 API 需要重启后才使用新 Prompt/Schema。

浏览器回归脚本与截图位于 `C:\Users\wy\Documents\ChatGPT\微信小程序开发\verify_ai.cjs`、`ai_regression_api.mjs`、`ai-mock-edit.png` 和 `ai-remote-edit.png`。脚本使用此设备已有的 Playwright/Edge，不是应用运行时依赖。
