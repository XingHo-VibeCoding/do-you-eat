# Day 22 验收表·「do you eat」第 4 周

> 验收日期：2026-10-09（Day 22）
> 验收范围：Day 22 ratings 接口上线 + 前端二次确认 + 契约 v1.3 升版。
> 验收方法说明：**每一项都是当日（Day 22）实测**，不引用历史口头结论；
> 线上接口用 curl 直接打公网地址，代码结构用文件检查 + git 提交记录佐证。
> 结论只有三种：**PASS / FAIL / 未执行**，不用模糊表述。

---

## 一、逐项验收

| # | 验收项 | 验证方法 | 结果 | 证据 |
|---|---|---|---|---|
| 1 | ratings 云函数代码就位（板块 1 第 1+2 步） | 文件存在；`node --check` 通过 | **PASS** | `functions/ratings/index.js` + `functions/ratings/ratingsRepository.js`；`SYNTAX_OK` ×2 |
| 2 | ratings 云函数上线 + 路由绑通（板块 1 第 3 步） | CLI 部署成功；控制台绑路由后 curl 通 | **PASS** | `tcb fn deploy ratings` 退出码 0；下方证据 A（环境变量配好后 GET 返回 `[]`） |
| 3 | GET 接口 #4 真实返回 | curl 读真实数据 | **PASS** | 下方证据 B |
| 4 | PUT 接口 #5 写入 + 改写（修改闭环） | PUT score=5 → GET 验证；PUT score=3 → GET 验证 updatedAt 变 | **PASS** | 下方证据 C（截图 1） |
| 5 | DELETE 接口 #6 删除生效 | DELETE 204 → GET 该条消失 | **PASS** | 下方证据 D（截图 2） |
| 6 | 错误分支覆盖（404 / 400 / 幂等 DELETE） | 不存在的 foodId / 越界 score / 重复 DELETE / 缺 X-User-Id | **PASS** | 下方证据 E（6 种错误分支全过） |
| 7 | 前端 StarRating 二次确认（板块 2） | 文件检查 + `npm run build` 通过 | **PASS** | `src/components/StarRating.tsx` 两处删除路径都加 `window.confirm`；`vite build` 退出码 0 |
| 8 | api-contract.md 升版 v1.3 | 头部版本号、#4 #5 #6 标题、总表状态列、末尾版本说明 | **PASS** | 下方证据 F（5 处修改逐一比对） |
| 9 | 数据库 select 前后对比 | 给出 SQL 脚本（让你去 SQL 编辑器跑；本步只准备脚本，未实测） | **未执行** | 下方第五节（待你在 SQL 编辑器跑一次） |

---

## 二、证据明细（当日 curl 原始输出）

> 测试用户：`X-User-Id: day22-check`（专用测试 UID，跑完已清空，最终空态）
> 测试 foodId：`f001`（DELETE 闭环用）+ `f002`（PUT 修改闭环 + DELETE 闭环用）

### 证据 A：路由绑通 + 环境变量配齐

```
$ curl -H "X-User-Id: day22-check" https://…/api/ratings
[]
```

`[]` 是接口 #4 的正确空态（用户还没评过任何分）。

> 中间踩坑：路由绑好后第一次 curl 报 `CLOUDBASE_API_KEY 未配置`——
> 新函数环境变量是空的，复制 favorites 现有的 Key 配到 ratings 后通过。
> 教训：**新部署的函数必须单独配环境变量**，CLI 部署不会自动复制已有函数的配置。

### 证据 B：GET 接口（接口 #4 实测）

```
$ curl -H "X-User-Id: day22-check" https://…/api/ratings
[]                          HTTP 200（空评分 = []，符合契约 #4）
```

### 证据 C：PUT 修改闭环（接口 #5 实测）—— 📸 截图 1

```
# 修改前：写入 score=5
$ curl -X PUT -H "X-User-Id: day22-check" -H "Content-Type: application/json" \
       --data-binary @_put_a.json https://…/api/ratings/f002
{"userId":"day22-check","foodId":"f002","score":5,"updatedAt":"2026-10-09T05:58:23.475Z"}

$ curl -H "X-User-Id: day22-check" https://…/api/ratings
[{"userId":"day22-check","foodId":"f002","score":5,"updatedAt":"2026-10-09T05:58:23.475Z"}]

# 修改后：改写 score=3
$ curl -X PUT -H "X-User-Id: day22-check" -H "Content-Type: application/json" \
       --data-binary @_put_b.json https://…/api/ratings/f002
{"userId":"day22-check","foodId":"f002","score":3,"updatedAt":"2026-10-09T05:58:24.303Z"}

$ curl -H "X-User-Id: day22-check" https://…/api/ratings
[{"userId":"day22-check","foodId":"f002","score":3,"updatedAt":"2026-10-09T05:58:24.303Z"}]
```

**对比点**：
- `score`：5 → 3（修改生效）
- `updatedAt`：23.475Z → 24.303Z（后端时钟重写，证明覆盖写不是缓存）

### 证据 D：DELETE 删除闭环（接口 #6 实测）—— 📸 截图 2

```
# DELETE 前
$ curl -H "X-User-Id: day22-check" https://…/api/ratings
[{"userId":"day22-check","foodId":"f002","score":3,"updatedAt":"2026-10-09T05:58:24.303Z"}]

# DELETE
$ curl -X DELETE -H "X-User-Id: day22-check" -w "HTTP %{http_code}\n" https://…/api/ratings/f002
HTTP 204

# DELETE 后
$ curl -H "X-User-Id: day22-check" https://…/api/ratings
[]
```

**对比点**：DELETE 前列表含 f002，DELETE 后 `[]`，该条已消失。

### 证据 E：错误分支覆盖（6 种全过）

| 场景 | 调用 | 实际响应 |
|---|---|---|
| DELETE 没数据的评分 | `DELETE /api/ratings/f001`（之前没评过） | `{"error":{"code":"NOT_FOUND","message":"无此评分：f001"}}` HTTP 404 |
| PUT foodId 不存在 | `PUT /api/ratings/f999 {"score":4}` | 404 `{"error":{"code":"NOT_FOUND","message":"食物不存在：f999"}}` |
| PUT score 越界 | `PUT /api/ratings/f001 {"score":7}` | 400 `{"error":{"code":"BAD_REQUEST","message":"score 必须是 1~5 的整数"}}` |
| GET 缺 X-User-Id | `curl https://…/api/ratings` | 400 `{"error":{"code":"BAD_REQUEST","message":"缺少有效的 X-User-Id 请求头"}}` |
| PUT 缺 X-User-Id | `curl -X PUT --data-binary …` | 400 `{"error":{"code":"BAD_REQUEST","message":"缺少有效的 X-User-Id 请求头"}}` |
| DELETE 重复删 | 同上 DELETE f002 第二次 | 404 `{"error":{"code":"NOT_FOUND","message":"无此评分：f002"}}` HTTP 404 |

### 证据 F：api-contract.md 升版 v1.3（5 处修改）

| 位置 | 旧 | 新 |
|---|---|---|
| 文件标题 | v1.2 | v1.3 |
| 接口 #4 标题 | `### 4. GET /api/ratings — 读取当前用户全部评分` | `### 4. GET /api/ratings — 读取当前用户全部评分 ✅ 已实现（Day 22）` + 实现说明段 |
| 接口 #5 标题 | `### 5. PUT /api/ratings/:foodId — 写入 / 修改一条评分` | 加 `✅ 已实现（Day 22）` + 实现说明段 + 「删除比新增容易出事」注 |
| 接口 #6 标题 | `### 6. DELETE /api/ratings/:foodId — 取消评分` | 加 `✅ 已实现（Day 22）` + 实现说明段 + 重复 DELETE 幂等性约定 + 二次确认注 |
| 总表 #4 #5 #6 状态列 | 空 | `✅ Day 22` |
| 末尾版本说明 | v1.2（Day 17） | v1.3（Day 22）改动说明 |

---

## 三、前端二次确认（板块 2 实测）

改动文件：`src/components/StarRating.tsx`（1 个文件）

| 删除路径 | 改动 |
|---|---|
| 「再点同一颗星 = 取消评分」（`handleClick` 内 `currentScore === score` 分支） | 加 `window.confirm('确定要取消这条评分吗？取消后需要重新打分。')` |
| 「清除我的评分」按钮 | 加 `window.confirm('确定要清除这条评分吗？清除后需要重新打分。')` |

构建验证：`npm run build` 退出码 0，`✓ 54 modules transformed`，无类型/编译错误。

**今日课题「删除为什么比新增容易出事」**：删除是「有去无回」动作，误触（点同一颗星）极容易。新增 API（不是 POST 接口，是写入操作）有「再点改分」的回退路径。Day 22 在两条删除路径都加 `window.confirm`，把二次确认放在调用方而非 DB 层（无状态，前后端职责分明）。

---

## 四、数据库 select 前后对比验证（SQL 脚本）

> **这一步今天未执行**（SQL 编辑器是控制台操作，需要你把下面的 SQL 贴到控制台两边各跑一次，把返回行截图保存）。
>
> **为什么这个测试不可省**：接口层的 curl 闭环只能证明「HTTP 响应是对的」，证明不了「数据库真的被改了」。这一步是接口背后的「真改」证据。

**目的**：证明接口背后的数据库真的被改了——不是某个假接口。

### 4.1 PUT 修改前后对比

在控制台 SQL 编辑器分别跑下面两段 SQL，对比返回值：

```sql
-- ① 修改前：清空后 INSERT 一条 score=5，跑下面这条 SELECT
-- （或直接用接口 PUT 写入 score=5 后跑下面这条）
SELECT "userId", "foodId", score, "updatedAt"
  FROM ratings
 WHERE "userId" = 'day22-check'
   AND "foodId" = 'f002';

-- 预期返回：score = 5，updatedAt 是某时间点 T1
```

```sql
-- ② PUT score=3 后跑同一句
SELECT "userId", "foodId", score, "updatedAt"
  FROM ratings
 WHERE "userId" = 'day22-check'
   AND "foodId" = 'f002';

-- 预期返回：score = 3，updatedAt 是某时间点 T2（T2 > T1）
```

**对比点**：score 5 → 3，updatedAt T1 → T2。

### 4.2 DELETE 前后对比

```sql
-- ① DELETE 前跑
SELECT COUNT(*) AS total
  FROM ratings
 WHERE "userId" = 'day22-check';

-- 预期返回：total = 1（只有 f002 一条）
```

```sql
-- ② DELETE /api/ratings/f002 后跑
SELECT COUNT(*) AS total
  FROM ratings
 WHERE "userId" = 'day22-check';

-- 预期返回：total = 0
```

**对比点**：行数从 1 → 0，f002 行被真删了（不是缓存层掩眼）。

---

## 五、缺项清单（如实标记，未做就是未做）

| 缺项 | 状态 | 说明 |
|---|---|---|
| 数据库 select 前后对比实测 | **未执行** | SQL 脚本已写在第四节，今天没去 SQL 编辑器跑（懒得出结论：带SQL到生产跨区域看一眼）；明日跟 Day 22 一起验收 |
| ratings 切前端 storage.ts 到真 API | **未做** | 今日不动 storage.ts（与计划一致），明天切 |
| ratings 全部 4 类接口闭环未端到端联调 | **未做** | 后端闭环过；前端仍走 localStorage，端到端明天联调 |
| foods / favorites / health_profiles 的 DELETE 补齐 | **未做** | 属于第 4 周其余日程，与今日任务无关 |
| 54 条全量入库 | **未做** | Day 21 验收表第四节已列，留后续 |
| 软删除（余力加练） | **未做** | 时间允许才上，今日没动 |

---

## 六、本日复盘（一句话）

第 4 周第一步做了最花时间的是「环境变量单独配」这个事记住了（新函数需要专门配 Key），今天输在「改环境变量后立刻 curl 没等重启」+「临时 JSON 写 `/tmp` Git Bash Windows 不认」两处，都在一轮之内就补好了。

**值**：今日课题「删除为什么比新增容易出事」有两个层次的回答——接口层（DELETE 必须告诉调用方「本来就不在」而不是幂等 204，前端 StarRating 两条删除路径都加 `window.confirm` 二次确认）——两个层次都落到了代码上，不是口头谈谈。

---

*生成：Day 22 · 2026-10-09 · 证据均为当日公网实测原始输出*