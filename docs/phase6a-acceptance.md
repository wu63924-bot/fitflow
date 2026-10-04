# FitFlow Phase 6A 验收报告

日期：2026-10-03。范围：AI 食物识别前端及本地 Mock。未接入真实 AI、网络服务或 API Key，未部署，也未开始 Phase 6B。

1. **修改/新增文件**
   - 新增 `src/pages/FoodPhotoPage.tsx`、`src/services/foodRecognitionService.ts`、`src/utils/foodImage.ts`、`scripts/test-food-recognition.mjs`、本报告。
   - 修改 `src/pages/NutritionPages.tsx`、`src/main.tsx`、`src/utils/nutrition.ts`、`src/repositories/mealRepository.ts`、`src/styles.css`、`README.md`。

2. **页面结构**：饮食页及添加饮食页均有 AI 拍照识别入口，沿用 `/nutrition/photo/:type?date=...`。页面依次显示隐私/Mock说明、拍照和相册入口、处理后的图片预览、分析状态、营养汇总、餐次及食物编辑、确认保存。状态为 `idle / selecting / preview / analyzing / success / error`。选择图片或处理失败可重新选择；分析过程可取消；保存时锁定编辑及重复提交。

3. **图片处理**：使用两个标准 file input；相机入口带 `capture="environment"`，相册入口不带 capture。只处理 JPEG、PNG、WebP。原图上限 20 MB、6000 万像素；Canvas 将最长边限制为 1600 px，白底 JPEG 输出，逐步调整大小/质量，输出上限 1 MB。空文件、非图片、HEIC、超限、读取失败、压缩失败均有中文提示。源图 Object URL 在 finally 中释放；预览 URL 由 React effect 在替换、取消、保存、卸载时释放。取消或离开时递增请求编号，忽略已经过期的异步结果。

4. **Provider 设计**：`FoodRecognitionProvider.recognizeFood(image: Blob): Promise<FoodRecognitionResult>`；当前实例为 `MockFoodRecognitionProvider`。页面只调用 `recognizeFood` 服务函数。返回每个食物的独立草稿 ID、食物库 Food（含每 100g 营养）、估算克数及置信度。没有远程 Provider 或网络请求。

5. **Mock 数据**：约 1.5 秒后返回米饭 200g、鸡胸肉 150g、西兰花 100g。营养值通过 `getFoodPickerData` 读取本地食品库，保留用户对营养资料的修改。西兰花置信度 0.66，用于展示“不确定，请确认”提示，仍可保存。结果是固定流程演示，不分析照片内容。缺少模拟食物、Provider 失败及空结果会进入错误提示。

6. **营养计算**：`createMealItemInGrams` 将按“个”等方式定义的固体食物转换为本次按克记录，不改变原食物库；继续使用 `calculateMealItem` 和 `sumItems` 按“每 100g × 克数 / 100”计算。组件只显示和格式化数据。重量可以完全清空；无效值暂不计入汇总，点击保存时校验。

7. **保存方式**：`addMealItems` 在现有 `db.meals` 上执行单个 Dexie 事务，保留既有项目及营养快照。草稿 ID 在编辑期间固定，事务按 ID 去重，重试或并发保存同一批草稿不会重复写入。页面另有即时 ref 锁和保存按钮禁用。保存成功返回当前日期饮食页并重新读取数据。不保存图片、置信度或第二套 AI 饮食记录。数据库仍为 FitFlowDB / schema v3 / 11 张表。

8. **PWA/路径**：Vite base、Router basename、manifest、Service Worker、GitHub workflow 均未更改。根路径及 `/fitflow/` 的 HTML、资源、图标、manifest、start_url、scope、SW 注册及导航 fallback 检查通过。新页面/服务随应用 JS 被现有 SW 缓存，无运行时 API 缓存。

9. **typecheck**：最终 `npm run typecheck` 通过，无新增 TypeScript any，也未关闭类型检查。

10. **普通构建**：最终 `npm run build` 通过，根路径产物能够打开饮食及 AI 页面。

11. **GitHub 构建**：最终 `npm run build:github` 通过，生成 `/fitflow/` 资源引用、正确 manifest/SW、`404.html`、`.nojekyll`。当前工作目录 dist 是 GitHub 构建；Cloudflare 使用 `npm run build` 重新生成根路径产物。

12. **浏览器与自动验收**
   - 在独立 `/fitflow/` 本地测试来源完成：饮食 → 添加饮食 → AI；选择 PNG；2400×1800 测试图输出 1600×1200、28 KB；分析按钮禁用；返回三种食物及低置信度提示。
   - 重量清空后保存被拦截；米饭从 200g 改为 100g，汇总从 543 kcal 变为 413 kcal。
   - 删除鸡胸肉，将西兰花换为菠菜，补充鸡蛋，改为午餐；保存后为 296 kcal、蛋白质 18.6g、碳水 32.3g、脂肪 10.2g。刷新后仍只有三种食物，记录和汇总保持一致。
   - 根路径 AI 页面及 `capture="environment"` 属性通过检查；应用取消/清除按钮恢复 idle。原生文件选择对话框的取消及手机摄像头未实机测试，cancel 事件监听和无文件分支已实现。
   - 生成测试图及独立测试数据库的浏览器验收为 **13 PASS / 0 FAIL**：JPEG/PNG/WebP、空文件、非图片/HEIC、超过 20 MB、读取失败、压缩失败、源图 URL 释放、连续/并发保存去重、旧记录保留、失败回滚/重试、非法份量、快照及 schema、离线 Mock。
   - 停止全部临时服务器后，Mock 仍读取本地食物库；新的浏览器标签页可以打开 `/fitflow/nutrition` 并读取保存的午餐。根路径 AI 页面刷新成功。离线训练可以开始、保存 20kg×10 次并触发休息计时，刷新后完成组和数值保留。日历及营养趋势正常打开。
   - `node scripts/test-food-recognition.mjs`（Node 24）通过：Mock 多项结果及失败/空结果、克数转换、实时计算、快照、非法重量、v3 新记录备份解析及 v1 旧记录迁移。
   - 对图片预览 URL 生命周期进行了代码检查；源图成功/异常路径释放有浏览器计数验证。备份/恢复实现及 schema 未改，本轮没有重复整库恢复的 UI 验收。

13. **已知边界**：Mock 不是真实识别；HEIC 需先转换；按毫升定义的饮品沿用手动添加入口；摄像头取消行为和已安装手机 PWA 仍需实机验收。构建保留原有大于 500 kB 的 JS 体积提示，不影响通过。所有浏览器数据和故障注入都在隔离本地测试来源/数据库完成。

14. **Phase 6B 接入位置**：未来在 `src/services/foodRecognitionService.ts` 实现同一 Provider 接口并替换 provider 实例选择。页面的识别调用和现有 MealItem 营养快照/保存流程可继续复用。本阶段没有实现 Remote Provider、请求、密钥或服务器。
