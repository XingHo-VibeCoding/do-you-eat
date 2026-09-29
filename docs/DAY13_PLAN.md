# Day 13 计划文档

> 任务：实现 3 个页面或独立视图 + 为列表数据补齐四种状态。
> 日期：2026-09-29 · 周二

---

## 一、视图切换方式选型

**最终决策：自实现 hash router，不引入 react-router-dom。**

### 候选方案

| 维度 | 自实现 hash router | react-router-dom | 单页 tab 区块切换 |
|---|---|---|---|
| 新增依赖 | 0 | +1 包 | 0 |
| 代码量 | ~40 行 | ~80+ 行（最小用法） | ~20 行 |
| 地址栏可见路径 | ✅ `#/library` | ✅ `/library` | ❌ 永远同一个 |
| 浏览器返回按钮 | ✅ 天然支持 | ✅ | ❌ 不支持 |
| 静态托管部署友好 | ✅（无需 fallback 配置） | ⚠️ 需 SPA fallback | ✅ |
| 满足「够用就好」 | ✅ | ❌ 偏重 | ✅ 但无地址栏 |
| 「卡住降级」兜底 | 进一步降级到 tab | 不算降级 | —— |

### 选定 hash 自实现的理由

1. **任务清单约束**：「不要做路由库的进阶用法（够用就好）」+「卡住降级：路由配置困难就用三个独立区块做可点击切换」—— 自实现最贴近「够用就好」的语义。
2. **页面规模匹配**：4 个页面、无嵌套、无守卫、无动态路由 —— hash router 完全够用。
3. **部署成本最低**：CloudBase 静态托管天然支持 hash，**不需要**服务端 fallback 配置；react-router 的 BrowserRouter 在静态托管下需要把所有路径 fallback 到 index.html。
4. **diff 控制**：不修改 `package.json` / `package-lock.json`，降低 Day 13 风险面、便于回滚。
5. **截图可寻址**：用户截图时地址栏显示 `#/library`、`#/health` 等，路径与视图一一对应，满足「图里要有地址栏」。

---

## 二、页面路径表

| Hash | 视图标题 | 主要功能 | 组件文件 | 数据来源 |
|---|---|---|---|---|
| `#/` | 抽一抽 | 现有抽卡（不动） | `pages/HomePage.tsx` | `mockApi.fetchFoods` |
| `#/library` | 食物库 | 浏览 + 新增 + 删除 | `pages/LibraryPage.tsx` | `mockApi.fetchFoods` + 本地增删 |
| `#/scenarios` | 场景抽取 | 早 / 中 / 晚 + 八大菜系 | `pages/ScenariosPage.tsx` | `mockApi.fetchFoods` + 场景筛选 |
| `#/health` | 健康档案 | 身高 / 体重 / 年龄 | `pages/HealthPage.tsx` | `healthStorage`（localStorage） |

> **兜底**：未知 hash → 重定向到 `#/`，避免空白页。
> **保留所有 URL**：`#/` 之外的页面刷新后会停留原位置（hash 路由天然支持）。

---

## 三、四态文案表

新增 `src/lib/stateMessages.ts`，按「页面 × 状态」分键，所有文案集中管理：

| 状态 | 通用标题 | 通用描述 | 通用行动按钮 |
|---|---|---|---|
| `loading` | 「正在为你准备…」 | 「数据马上就来」 | 无（spinner） |
| `success` | （页面自渲） | （页面自渲） | （页面自渲） |
| `empty` | 「这里还空空如也」 | 「添加第一道菜，开启你的美食之旅」 | 「去添加」（仅 library 页签可见） |
| `error` | 「出了点小问题」 | 「数据没拿到，请稍后再试」 | 「再试一次」 |

> **健康档案页面（health）不使用「empty」状态**：表单空时直接显示提示，不视为错误；保存后有数据时显示「已保存」。
> **首页（home）继续复用现有四态**：loading / success / empty / error 都已在 `App.tsx` 跑通，本日不重复实现。

---

## 四、本日步骤一览（详见 task list）

### 板块 1：规划视图结构（本板块已完成）
- ✅ 1.1 写计划文档（本文件）
- ✅ 1.2 跑 `npm run build` 确认基线没坏

### 板块 2：实现多级切换
- 2.1 新增 `src/lib/hashRouter.ts`（hook `useRoute()`、工具 `navigate()`）
- 2.2 新增 `src/components/AppNav.tsx`（4 tab 导航 + `aria-current="page"`）
- 2.3 抽出 `App.tsx` 现有内容到 `pages/HomePage.tsx`（逻辑零改动）
- 2.4 新增占位 `pages/LibraryPage.tsx` / `ScenariosPage.tsx` / `HealthPage.tsx`
- 2.5 `App.tsx` 改为路由壳：渲染 `<AppNav>` + 当前页
- 2.6 跑 `npm run build` 验证
- 2.7 部署到 CloudBase（沿用 Day 8 的命令），让用户在浏览器内访问 URL 并截图

### 板块 3：补齐四种状态
- 3.1 新增 `src/lib/stateMessages.ts`，集中四态文案
- 3.2 改造 `services/mockApi.ts`：增 `addFood / removeFood / listFoods`
- 3.3 实现 `LibraryPage`：列表 + 新增/删除表单 + 四态
- 3.4 实现 `ScenariosPage`：场景切换 + 候选池筛选 + 抽卡
- 3.5 新增 `services/healthStorage.ts` + 实现 `HealthPage`：表单 + localStorage 持久化 + 显示已保存
- 3.6 跑构建验证 + 部署
- 3.7 收尾（commit + push）

### 余力加练
- 浏览器返回按钮：天然支持（hash 路由）
- 面包屑：在 `<AppNav>` 下加一行「首页 / 食物库」式层级指示
- `aria-current="page"`、键盘可达（左右箭头切 tab）

---

## 五、需用户拍板的点（已在执行计划中给出默认）

| 决策点 | 默认 | 备选 |
|---|---|---|
| 路由方式 | hash 自实现 | react-router-dom / tab 区块切换 |
| 健康数据 service | 新建 `healthStorage.ts` | 扩展现有 `storage.ts` |
| 截图方式 | CloudBase 部署后用户截 | 用户跑 `npm run dev` 截 |

---

## 六、不做的事（与今日清单无关）

- ❌ 不做登录/支付
- ❌ 不引入新 npm 依赖
- ❌ 不动 `storage.ts`（评分专属），健康数据走新建的 `healthStorage.ts`
- ❌ 不实现 react-router 进阶用法（懒加载、loader、action、嵌套路由、动态路由、守卫）
- ❌ 不动 `App.tsx` 现有抽卡逻辑（仅搬迁到 `HomePage.tsx`）

---

## 七、风险与回退

| 风险 | 兜底 |
|---|---|
| hash 路由让初次部署后用户不习惯 | 在 `<AppNav>` 加 tooltip / 占位说明 |
| 新增 4 个页面文件 diff 太大 | 板块 2 先用占位最小可运行，板块 3 再补内容 |
| 构建报错（TypeScript 类型问题） | 立即停下报告，不循环重试 |
| CloudBase 部署失败 | 回退到本地 `npm run dev`，URL 改为 `http://localhost:5173/#/library` |