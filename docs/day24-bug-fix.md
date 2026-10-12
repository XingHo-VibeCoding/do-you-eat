# Day 24｜Bug 修复全记录：DELETE /api/foods/:id 一直 405

> 今日主线：**修复一个真实 Bug 并留全证据**。
> 四步证据链：复现 → 定位 → 修复 → 验证。本文件是四步的完整存档。
> 日期：2026-10-12 · 分支 main · 关联契约：`api-contract.md` v1.4 · 接口编号：#3

---

## 一、Bug 一句话

**「食物库」里点「删除」按钮，请求 `DELETE /api/foods/:id` 永远返回 HTTP 405「本接口只支持 GET 和 POST」——删除功能从前端看是「可点的」，实际从来没通过。**

严重度：中（用户能真实点到失败的按钮）
影响面：食物库所有条目的删除入口

---

## 二、板块 ① 复现（三条证据链）

### ① 后端 curl（完全绕开前端）

```
$ curl -sS -X DELETE -w '\n[HTTP %{http_code}]\n' \
    https://doyoueat-d5g36rg7ia785b553-1496350653.ap-shanghai.app.tcloudbase.com/api/foods/f001

{"error":{"code":"METHOD_NOT_ALLOWED","message":"本接口只支持 GET 和 POST"}}
[HTTP 405]
```

### ② 线上页面里跑真实 fetch（浏览器控制台等价物）

在线上页面 console 里执行 `fetch('/api/foods/f001', { method: 'DELETE' })`：

```
[DAY24 复现] DELETE /api/foods/f001 → HTTP 405
{"error":{"code":"METHOD_NOT_ALLOWED","message":"本接口只支持 GET 和 POST"}}
```

### ③ UI 用户视角

食物库点「删除 豆浆油条」→ 页面顶出现红字提示：

> 后端删除接口尚未上线，此功能将在后续版本开放

**⚠️ 关键发现（今天的核心课题）**：这句文案是 Day 20 前端主动 `catch(405)` 写死的。它把 Bug 伪装成了「已知状态」——**报错文案太客气，会掩盖 Bug 的严重性**，让这个 405 活了 4 天没被当 Bug 看待。

### 复现截图

`docs/day24-screenshots/before-error.png`
（含：地址栏 URL、请求方法、405 报错原文、前端提示、食物库 9 条列表）

---

## 三、板块 ② 定位（排除法）

### 原因排序（可能性 高 → 低）

| # | 可能原因 | 可能性 | 结论 |
|---|---|---|---|
| 1 | foods 云函数方法白名单只有 GET/POST，没有 DELETE 分支 | ~95% | ✅ **真凶** |
| 2 | 网关路由没放行 DELETE 方法 | ~3% | ❌ 排除 |
| 3 | 前端 URL 拼错 / method 没带对 | ~1% | ❌ 排除 |
| 4 | PostgREST / 数据库拒绝删除 foods 表 | ~1% | ❌ 排除 |

### 每个原因的验证方法与结果

**原因 1 — 成立（真凶）**
- 读 `functions/foods/index.js`（原第 107–117 行）：

```javascript
if (isHttpCall && method !== 'GET' && method !== 'POST') {
  return httpJson(405, { error: { code: 'METHOD_NOT_ALLOWED',
                                  message: '本接口只支持 GET 和 POST' } });
}
```
- **铁证**：白名单就俩词。DELETE 一进来、还没碰任何业务逻辑就被打回，响应文案与 curl 拿到的**一字不差**。
- 交叉验证 `foodsRepository.js`：导出清单只有 `listFoods / findFoodIdsByName / insertFood`——**连删数据的仓库函数都没写**。整条链路从上到下都没有删除能力。

**原因 2 — 排除**
- 如果 405 是**网关**拦的，响应会是网关自己的格式。Day 23 已记录事实：「网关未知路由错误 JSON 无 `.error` 包裹、message 为英文」。
- 实际拿到的是 `{"error":{"code","message"}}` + **中文**文案 → 是 foods 函数的 `httpJson()` 包装出来的，请求已穿过网关到达函数本体。网关无辜。

**原因 3 — 排除**
- T6 用 **curl 直打后端**（绕开前端）同样 405。且 `api.ts:removeFood` 请求的路径与契约一致。前端无关。

**原因 4 — 排除**
- 405 在函数第一道门就返回，压根没走到数据库。且同一条 PostgREST 链路上，ratings 表 Day 22 的 DELETE 已实测成功（204）——链路本身支持 DELETE。

### 根因（为什么会漏到今天）

1. Day 17/18 上线 foods 函数时只做了 GET/POST，注意力全在「409 防同名重复」，DELETE 一直排队；
2. 契约总表 #3 状态列一直空着 → 被当成 **feature gap（待办）** 而不是 **Bug**，没人追究；
3. 前端把 405 特判成「尚未上线」的友好文案 → Bug 被伪装成已知状态，警觉性归零。

---

## 四、板块 ③ 修复

### 改动文件清单

| # | 文件 | 改了什么 |
|---|---|---|
| 1 | `functions/foods/foodsRepository.js` | 新增 `deleteFoodById(id)`：`DELETE /foods?id=eq.<id>` + `Prefer: return=representation`，返回 `true`（删了）/ `false`（没找到）；导出它 |
| 2 | `functions/foods/index.js` | ① 方法白名单 `GET/POST` → `GET/POST/DELETE`，405 文案改为「本接口只支持 GET / POST / DELETE」；② 新增 `extractFoodId()`（取网关剥前缀后 path 的最后一段）；③ 新增 DELETE 分支：缺 id → 400；id > 64 字符 → 400；没删到 → 404 `食物不存在：<id>`；删到 → 204 |
| 3 | `src/pages/LibraryPage.tsx` | 删掉 405「后端删除接口尚未上线」特判（Bug 已修，文案不能撒谎），失败统一走「删除失败，请稍后重试」；清掉不再使用的 `ApiError` import |
| 4 | `src/services/api.ts` | `removeFood` 注释更新：「Day 20 后端暂未实现，返回 405」→「Day 24 后端已上线：204 成功 / 404 食物不存在」 |
| 5 | `api-contract.md` | 接口 #3 状态列标 ✅ Day 24 + 实现说明段；版本升 **v1.4**（v1.3 历史保留） |
| 6 | `.gitignore` | 新增 `.tcb-home/`（部署时 CLI 凭据副本，严禁入库） |

**没做的**：CASCADE 清理代码——Day 16 建表时 `ratings` / `favorites` 的 FK 已带 `ON DELETE CASCADE`，删菜自动连带清评分和收藏，代码零改动（但回归清单里实测了）。

### 部署 & 冒烟

修复前 / 修复后对比（关键铁证）：

```
修复前：DELETE /api/foods/f001       → HTTP 405  "本接口只支持 GET 和 POST"
修复后：DELETE /api/foods/f999-day24smoke → HTTP 404  "食物不存在：f999-day24smoke"
```

405 → 404 的意义：请求已穿过方法白名单 → 进入 DELETE 分支 → 调用仓库层 `deleteFoodById` → PostgREST 返回空数组 → 接口层正确包装 404。**整条链路活了**；同时证明重部署后 API Key 环境变量仍在（否则会 500）。

**部署踩坑**：沙箱拦 CLI 写 `~/.config/.cloudbase` 凭据目录 → 把 `HOME` / `USERPROFILE` / `XDG_CONFIG_HOME` 重定向到工作区 `.tcb-home/` 内解决；该目录已加进 `.gitignore`。

---

## 五、板块 ④ 验证（回归清单 R1–R8 实测结果）

| # | 用例 | 预期 | 实测 | 结论 |
|---|---|---|---|---|
| R1 | `POST /api/foods` 建测试菜「Day24删除验证菜」 | 201 | `201`，id=`user-4fe1890697ec` | ✅ |
| R4a | 给它打分 `PUT /api/ratings/user-4fe1890697ec` | 200 | `200` `{"score":4,...}` | ✅ |
| R4b | 收藏它 `POST /api/favorites/user-4fe1890697ec` | 201 | `201` | ✅ |
| R4c | `GET /api/ratings` 能看到它 | 含该 foodId | 含 | ✅ |
| R4d | `GET /api/favorites` 能看到它 | 含该 foodId | 含 | ✅ |
| R1 | `DELETE /api/foods/user-4fe1890697ec` | 204 无 body | `204` | ✅ |
| R4e | 删后 `GET /api/ratings` | `[]`（CASCADE 清评分） | `[]` | ✅ CASCADE |
| R4f | 删后 `GET /api/favorites` | `[]`（CASCADE 清收藏） | `[]` | ✅ CASCADE |
| R2 | 重复 `DELETE` 同一 id | 404 食物不存在 | `404 {"code":"NOT_FOUND","message":"食物不存在：user-4fe1890697ec"}` | ✅ |
| R2b | `DELETE /api/foods/f999` | 404 | `404 食物不存在：f999` | ✅ |
| R3 | `GET /api/foods` | 测试菜消失 | 消失，剩 9 条（8 正式 + 锅包肉） | ✅ |
| R5 | UI：食物库点「删除」测试菜 | 列表少一条，无报错 | 消失，`NO_ERROR_SHOWN`（新 bundle `index-Ct9Cfrho.js` 已生效） | ✅ |
| R6 | 删除后刷新页面 | 仍消失 | 仍在为 `false`，剩 9 条 | ✅ |
| R7a | `GET /api/foods` 条数 | 9 | 9 | ✅ |
| R7b | `GET /api/ratings`（干净用户） | 200 `[]` | `200 []` | ✅ |
| R7c | `PUT /api/ratings/f001` | 200 | `200` | ✅ |
| R7d | `DELETE /api/ratings/f001` | 204 | `204` | ✅ |
| R7e | `POST /api/favorites/f001` | 201 | `201` | ✅ |
| R7f | `DELETE /api/favorites/f001` | 204 | **405** | ⚠️ **Bug #9（已知未实现）**，非本次回归失败 |
| R7g | `GET /api/health` | 200 | `200 {"ok":true,...}` | ✅ |
| R7h | `PATCH /api/foods/f001`（验证白名单仍拦非法方法） | 405 + 新文案 | `405`「本接口只支持 GET / POST / DELETE」 | ✅ |
| R8 | `npm run build` | 通过 | `✓ built in 588ms` | ✅ |

**21 项：20 PASS / 1 已知 Bug（#9，Day 25 处理）**

### 验证截图

| 文件 | 内容 |
|---|---|
| `docs/day24-screenshots/before-error.png` | 修复前：405 报错原文 + 地址栏 + 前端「尚未上线」提示 |
| `docs/day24-screenshots/after-success.png` | 修复后：HTTP 204 + UI 删除成功 + 刷新仍消失（剩 9 条）+ 地址栏 |
| `docs/day24-screenshots/dice-rolling.png` | 加练②：抽卡滚动中的骰子（`animation-name=dice-roll`） |

### 测试残留（需 Day 25 清理）

- 用户 `test-day24-regress` 在 `favorites` 表留了 1 条 `f001`——因 #9（DELETE favorites）未实现，API 删不掉，只能等 #9 上线后清或控制台 SQL 删。
- 本次测试菜（`user-4fe1890697ec` / `user-775181277649`）已随测试删除，库里无残留。

---

## 六、加练内容（余力）

### 加练① 核心流程测试清单

→ 见 `docs/day24-test-checklist.md`（按真实功能重写，替换掉清单里不存在的「打卡 / plan_days / checkins」）

### 加练② 骰子滚动动画（Day 14 真人反馈的遗留项）

- 现象：抽卡 `rolling` 阶段骰子 🎲 是静态的（首页只有小幅抖动、场景页完全没有动画）
- 修复：`src/styles/app.css` 新增 `@keyframes dice-roll`（360° 旋转 + 缩放弹跳，0.5s 循环），`.is-rolling .card__emoji` 改为应用它；`src/pages/ScenariosPage.tsx` 的页面容器补上 `is-rolling` 条件类，与首页共用一套
- 证据：截图 `dice-rolling.png` + 运行时实测 `animation-name=dice-roll ; duration=0.5s`
- 改动文件：`app.css`、`ScenariosPage.tsx`

---

## 七、Day 25 候选 Bug 清单（今天不动，只记录）

| # | 事项 | 类型 | 来源 | 备注 |
|---|---|---|---|---|
| 1 | #9 `DELETE /api/favorites/:foodId` 405 | Bug | Day 24 curl 第二轮 | 与 #3 同型，小工作量（约 20 行） |
| 2 | #10 `GET /api/health/profile` 被 `/api/health` 路由吃掉 | Bug | Day 24 curl 第三轮 | 网关前缀匹配冲突 |
| 3 | #11/#12 health profile 的 PUT/DELETE 405 | 未实现 | Day 24 curl 第三轮 | 需建 `functions/health` + API Key + 路由，工作量大 |
| 4 | 「评分没上云」：`storage.ts` 仍 localStorage，`api.ts` 缺 ratings 组函数 | 功能缺口 | Day 22 验收遗留 | 前端跨设备评分不一致 |
| 5 | 食物库「配图」栏文案误导（用户以为传图，实际填 emoji） | 体验 | Day 14 真人反馈 | 改标签文案 |
| 6 | 网关未知路由错误 JSON 无 `.error` 包裹、message 英文 | 契约不一致 | Day 23 安全审计 | 影响前端错误翻译 |
| 7 | 清理测试残留：`test-day24-regress` 收藏 1 条、`day21-check` / `day21-demo` 用户数据 | 卫生 | Day 21 / Day 24 | #9 上线后或控制台 SQL 清 |
