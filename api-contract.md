# api-contract.md — 「do you eat」接口契约 v1.3

> **地位**：本文档是第 3 周（Day 16–20）建表和写接口的**唯一施工依据**。
> Day 15 只登记占位，不实现任何接口。
>
> **推导来源**：第 2 周四个页面（首页抽卡 / 食物库 / 场景 / 健康）+ 三个 service 文件
> （`mockApi.ts` / `storage.ts` / `healthStorage.ts`）+ `favoriteApi.ts`。
> 前端现有代码的函数签名和返回形状，全部按「换 fetch 时上层组件一行不改」的原则设计。

---

## 〇、通用约定（先读这个）

### 基地址

```
https://doyoueat-d5g36rg7ia785b553-1496350653.ap-shanghai.app.tcloudbase.com/api
```

（`/api/health` 已上线可用，就是这套地址下的第一个接口。）

### 请求 / 响应格式

- 所有接口返回 JSON；写操作（POST/PUT/DELETE）的请求体也是 JSON；
- 成功：HTTP 2xx + 业务数据；
- 失败：HTTP 4xx/5xx + 统一错误体（见下）。

### 统一错误返回形状（所有接口一致）

```json
{
  "error": {
    "code": "NOT_FOUND",
    "message": "食物不存在：f999"
  }
}
```

常用 `code`：`BAD_REQUEST`（参数不合法）/ `NOT_FOUND`（资源不存在）/ `INTERNAL`（服务端错误）。

### 用户身份 —— ✅ 已拍板（Day 16）

匿名 ID 方案：前端首次生成 UUID 存 localStorage，每次请求带 `X-User-Id` 头。
服务端**不建 users 表**、不做登录体系（防蔓延，见第六节），userId 只透传存储。
将来若升级 CloudBase 匿名登录或正式登录，接口形状不变，只换身份来源。

### 命名风格

- 路径全小写、复数名词（`/foods` `/ratings` `/favorites`）；
- 字段名 camelCase，与前端 TS 类型（`src/types/food.ts`）逐字段对齐，**不做蛇形转换**。

---

## 一、foods 表（食物库）→ 3 个接口

对应前端：`mockApi.ts` 的 `fetchFoods / addFood / removeFood`，食物库页和场景页共用。
数据形状 = 前端 `Food` 类型原样上云（见附录 A）。

### 1. GET /api/foods — 读取食物列表 ✅ 已实现（Day 17）

首页、食物库页、场景页打开时的**第一个请求**（案例清单里「别忘了的列表读取接口」）。

> **实现说明（Day 17）**：云函数 `functions/foods`（Event 类型）已上线，经 PostgREST REST API 读库，
> 公网地址见〇节基地址。当前库里是 seed 的 8 条真实数据（54 条全量入库见待办）；
> 非 GET 方法返回 405（契约未登记的错误码，按统一错误体格式返回）。

| 项 | 内容 |
|---|---|
| 请求参数 | 无（标签 / 菜系 / 时段 / 收藏筛选全部在前端做，后端一次给全量） |
| 成功响应 | `200` + `Food[]`（含内置 54 条 + 用户自建，按固定顺序返回即可） |

```json
[
  {
    "id": "f001",
    "name": "麻婆豆腐",
    "emoji": "🌶️",
    "description": "麻辣鲜香，下饭神器",
    "mealPeriod": "dinner",
    "spicy": true,
    "tags": ["辣", "饭", "川味"],
    "cuisine": "川"
  }
]
```

| 错误 | HTTP | body |
|---|---|---|
| 服务端故障 | 500 | `{"error": {"code": "INTERNAL", "message": "..."}}` |

### 2. POST /api/foods — 新增一道菜

对应食物库页「添加食物」表单。

| 项 | 内容 |
|---|---|
| 请求体 | `AddFoodInput`（= `Food` 去掉 `id`，id 由后端生成） |
| 成功响应 | `201` + 完整 `Food`（带新 id） |

```json
// 请求体
{
  "name": "锅包肉",
  "emoji": "🍖",
  "description": "酸甜酥脆，东北名菜",
  "mealPeriod": "dinner",
  "spicy": false,
  "tags": ["甜", "肉"],
  "cuisine": "鲁"
}
// 响应 201
{
  "id": "user-lx3k2-9ab12c",
  "name": "锅包肉",
  "emoji": "🍖",
  "description": "酸甜酥脆，东北名菜",
  "mealPeriod": "dinner",
  "spicy": false,
  "tags": ["甜", "肉"],
  "cuisine": "鲁"
}
```

| 错误 | HTTP | body |
|---|---|---|
| 缺 name / name 为空串 | 400 | `{"error": {"code": "BAD_REQUEST", "message": "name 不能为空"}}` |
| mealPeriod 不在 4 个合法值内 | 400 | `{"error": {"code": "BAD_REQUEST", "message": "mealPeriod 非法"}}` |

### 3. DELETE /api/foods/:id — 删除一道菜

对应食物库页每条右侧的「删除」按钮。

| 项 | 内容 |
|---|---|
| 路径参数 | `id`（食物 id） |
| 成功响应 | `204` 无 body（前端删除后本地刷新列表） |

| 错误 | HTTP | body |
|---|---|---|
| id 不存在 | 404 | `{"error": {"code": "NOT_FOUND", "message": "食物不存在：<id>"}}` |

---

## 二、ratings 表（用户评分）→ 3 个接口

对应前端：`storage.ts` 的 `getRating / setRating / clearRating / getAllRatings`。
存储形状从「`dye:rating:<foodId>` 一 key 一条」平移为「表里一行」：`(userId, foodId)` 唯一。

### 4. GET /api/ratings — 读取当前用户全部评分 ✅ 已实现（Day 22）

对应 `getAllRatings`（列表读取接口）。请求头带 `X-User-Id`。

> **实现说明（Day 22）**：云函数 `functions/ratings`（Event 类型）已上线，经 PostgREST REST API 读库，
> `X-User-Id` 头校验后按 `userId=eq.<值>` 过滤（URL 编码 + PostgREST 内部参数化，防注入等价）。
> 缺失 / 超长（>64）的 `X-User-Id` 返回 400 `BAD_REQUEST`。

| 项 | 内容 |
|---|---|
| 请求参数 | 无 |
| 成功响应 | `200` + `UserRating[]`（没有评过 = 空数组 `[]`，不是 404） |

```json
[
  { "foodId": "f001", "score": 5, "updatedAt": "2026-09-22T14:30:00.000Z" }
]
```

### 5. PUT /api/ratings/:foodId — 写入 / 修改一条评分 ✅ 已实现（Day 22）

对应 `setRating`（打分和改分同一个接口，覆盖写）。

> **实现说明（Day 22）**：云函数 `functions/ratings` 已上线。覆盖写语义：仓库层先查
> （`findOne`），没有走 POST 插入、有走 PATCH 更新，`updatedAt` 一律后端时钟。
> foodId 不存在返回 404 `NOT_FOUND`，score 非 1~5 整数返回 400 `BAD_REQUEST`。
> **今日课题「删除为什么比新增容易出事」**：调用方需要二次确认（Day 22 前端
> StarRating 已加 `window.confirm`，云函数层无状态由调用方兜底）。

| 项 | 内容 |
|---|---|
| 路径参数 | `foodId` |
| 请求体 | `{"score": 4}` |
| 成功响应 | `200` + 落库后的完整记录（`updatedAt` 由后端写，前端只回显） |

```json
{ "foodId": "f001", "score": 4, "updatedAt": "2026-10-05T09:12:33.000Z" }
```

| 错误 | HTTP | body |
|---|---|---|
| score 不是 1~5 整数 | 400 | `{"error": {"code": "BAD_REQUEST", "message": "score 必须是 1~5 的整数"}}` |
| foodId 不存在 | 404 | `{"error": {"code": "NOT_FOUND", "message": "食物不存在：f999"}}` |

### 6. DELETE /api/ratings/:foodId — 取消评分 ✅ 已实现（Day 22）

对应 `clearRating`（评分组件的「取消」）。

> **实现说明（Day 22）**：云函数 `functions/ratings` 已上线。DELETE 用
> `Prefer: return=representation` 拿被删行数判断 204/404（删除无此评分返回
> 404「无此评分：<foodId>」，**不是** 404「食物不存在」——区分「菜不在」和「没评过」）。
> 幂等性：重复 DELETE 第二次起返回 404（Day 22 拍板：与 favorites 的「重复 → 201 幂等」相反，
> **DELETE 必须告诉调用方「这条本来就不在」，避免误判为「我删成功了」**）。
> **今日课题「删除为什么比新增容易出事」**：调用方需要二次确认（Day 22 前端
> StarRating 已加 `window.confirm`）。

| 项 | 内容 |
|---|---|
| 路径参数 | `foodId` |
| 成功响应 | `204` 无 body |

| 错误 | HTTP | body |
|---|---|---|
| 该用户没评过这道菜 | 404 | `{"error": {"code": "NOT_FOUND", "message": "无此评分"}}` |

---

## 三、favorites 表（收藏）→ 3 个接口

对应前端：`favoriteApi.ts`（现在是 400ms 假延迟的 mock）。数据 = 一串 `foodId`，`(userId, foodId)` 唯一。

### 7. GET /api/favorites — 读取收藏列表 ✅ 已实现（Day 17）

**案例清单点名要求的那个接口**。App 启动时拉一次，恢复用户的收藏状态（现在刷新即丢，上云后修复的就是这一点）。

> **实现说明（Day 17）**：云函数 `functions/favorites`（Event 类型）已上线，经 PostgREST REST API 读库，
> `X-User-Id` 头校验后按 `userId=eq.<值>` 过滤（URL 编码 + PostgREST 内部参数化，防注入等价）。
> 缺失 / 超长（>64）的 `X-User-Id` 返回 400 `BAD_REQUEST`。

| 项 | 内容 |
|---|---|
| 请求参数 | 无 |
| 成功响应 | `200` + `foodId` 数组（没收藏 = `[]`） |

```json
["f001", "f017", "user-lx3k2-9ab12c"]
```

### 8. POST /api/favorites/:foodId — 收藏

对应 `addFavorite`。

| 项 | 内容 |
|---|---|
| 路径参数 | `foodId` |
| 请求体 | 无 |
| 成功响应 | `201` + `{"foodId": "f001"}`（与 mock 返回形状一致，FavoriteButton 不用改） |

| 错误 | HTTP | body |
|---|---|---|
| foodId 不存在 | 404 | `{"error": {"code": "NOT_FOUND", "message": "食物不存在：f999"}}` |

> **幂等约定（Day 16 拍板）**：重复收藏不返回 409，直接返回 `201` + `{"foodId": "..."}`。
> 前端 FavoriteButton 不需要处理「已收藏」错误分支。

### 9. DELETE /api/favorites/:foodId — 取消收藏

对应 `removeFavorite`。

| 项 | 内容 |
|---|---|
| 路径参数 | `foodId` |
| 成功响应 | `204` 无 body |

| 错误 | HTTP | body |
|---|---|---|
| 本来就没收藏 | 404 | `{"error": {"code": "NOT_FOUND", "message": "未收藏该食物"}}` |

---

## 四、health_profiles 表（健康档案）→ 3 个接口

对应前端：`healthStorage.ts` 的 `getHealth / saveHealth / clearHealth`。
档案是**单条记录**（不是列表），按 userId 一人一份。

### 10. GET /api/health/profile — 读取健康档案

| 项 | 内容 |
|---|---|
| 请求参数 | 无 |
| 成功响应（已保存） | `200` + 档案 |
| 成功响应（没填过） | `200` + `null`（和前端 `getHealth` 返回 null 的约定一致，不是 404） |

```json
{ "heightCm": 175, "weightKg": 68.5, "age": 28, "updatedAt": "2026-09-29T16:42:00.000Z" }
```

### 11. PUT /api/health/profile — 保存健康档案

对应 `saveHealth`（覆盖写，重复保存即更新）。

| 项 | 内容 |
|---|---|
| 请求体 | `{"heightCm": 175, "weightKg": 68.5, "age": 28}`（`updatedAt` 后端写） |
| 成功响应 | `200` + 落库后的完整档案 |

| 错误 | HTTP | body |
|---|---|---|
| 字段越界（身高 50–250 / 体重 10–300 / 年龄 1–150，与 HealthPage 校验一致） | 400 | `{"error": {"code": "BAD_REQUEST", "message": "身高请填 50~250 之间的数字（cm）"}}` |

### 12. DELETE /api/health/profile — 清空健康档案

对应 `clearHealth`。

| 项 | 内容 |
|---|---|
| 请求参数 | 无 |
| 成功响应 | `204` 无 body（没档案时也返回 204，幂等） |

---

## 五、接口总表（12 个）

| # | 方法 | 路径 | 用途 | 前端替换的函数 | 对应表 | 状态 |
|---|---|---|---|---|---|---|
| 1 | GET | /api/foods | 食物列表全量读取 | `mockApi.fetchFoods` | foods | ✅ Day 17 |
| 2 | POST | /api/foods | 新增一道菜 | `mockApi.addFood` | foods | |
| 3 | DELETE | /api/foods/:id | 删除一道菜 | `mockApi.removeFood` | foods | |
| 4 | GET | /api/ratings | 读取全部评分 | `storage.getAllRatings` | ratings | ✅ Day 22 |
| 5 | PUT | /api/ratings/:foodId | 写入/修改评分 | `storage.setRating` | ratings | ✅ Day 22 |
| 6 | DELETE | /api/ratings/:foodId | 取消评分 | `storage.clearRating` | ratings | ✅ Day 22 |
| 7 | GET | /api/favorites | 读取收藏列表 | （新增，App 启动时） | favorites | ✅ Day 17 |
| 8 | POST | /api/favorites/:foodId | 收藏 | `favoriteApi.addFavorite` | favorites | |
| 9 | DELETE | /api/favorites/:foodId | 取消收藏 | `favoriteApi.removeFavorite` | favorites | |
| 10 | GET | /api/health/profile | 读取健康档案 | `healthStorage.getHealth` | health_profiles | |
| 11 | PUT | /api/health/profile | 保存健康档案 | `healthStorage.saveHealth` | health_profiles | |
| 12 | DELETE | /api/health/profile | 清空健康档案 | `healthStorage.clearHealth` | health_profiles | |

外加已上线的 `GET /api/health`（健康检查，不在上表，无表）。

**共 4 张表**：`foods` / `ratings` / `favorites` / `health_profiles`（Day 16 建表清单）。

### 表结构已落库（Day 16 · PostgreSQL）

- **数据库**：CloudBase 控制台「SQL 型数据库」（PostgreSQL）。`db/schema.sql` = 表结构唯一设计契约；`db/seed.sql` = 可复现种子数据（foods 8 / ratings 7 / favorites 6 / health_profiles 5，foods 全部照抄 `src/data/foods.ts` 真实内置库，用户用 UUID 形态），两者均可重复执行。
- **列名 = camelCase 且必须带双引号**：PG 会把不带引号的标识符折叠成全小写；带引号保住驼峰后，`SELECT *` 的结果直接就是接口要返回的 JSON 形状，零转换。
- **键与约束**：
  - 主键：`foods.id`；`ratings("userId","foodId")`、`favorites("userId","foodId")` 复合主键（一人一菜一条）；`health_profiles."userId"`（一人一份）；
  - 外键：`ratings."foodId"`、`favorites."foodId"` → `foods.id`，`ON DELETE CASCADE`（删菜连带清评分/收藏）；
  - CHECK：`mealPeriod` 四选一 / `score` 1~5 / 身高 50~250 / 体重 10~300 / 年龄 1~150（与 HealthPage 校验一致）。
- **类型要点**：`tags` 用 JSONB（数组原样存，AND 筛选在前端做）；`updatedAt` 存 ISO 8601 字符串 `VARCHAR(24)`（与附录 A 一致，接口零转换）；PG 无 TINYINT / UNSIGNED → `SMALLINT` + CHECK 兜底；体重 `NUMERIC(5,1)`。
- **userId 不建 users 表**：前端 UUID 透传（见〇节拍板），数据库里只是一列字符串。

---

## 六、明确不做的事（防蔓延）

- **抽卡随机挑选不上后端**：`pickRandom` 留在前端（全量列表拉回来本地随机，逻辑已存在且好用）；
- **筛选不上后端**：标签多选（AND）、菜系 / 时段 segmented、「只看收藏」开关，全部前端过滤；
- **分页不做**：54 条 + 用户自建，全量返回足够（< 1000 条）；
- **鉴权 / 跨域之外的登录体系不做**：第 3 周只做匿名用户（见〇节开放问题）。

## 附录 A：字段类型对照（与 `src/types/food.ts` 逐字段一致）

| 字段 | 类型 | 说明 |
|---|---|---|
| `id` | string | 内置 `f001` 式；用户自建后端生成（UUID） |
| `name` | string | 必填，中文显示名 |
| `emoji` | string | 配图（Day 5 决策 D2） |
| `description` | string | 一句话俏皮文案 |
| `mealPeriod` | `'breakfast' \| 'lunch' \| 'dinner' \| 'snack'` | 四选一 |
| `spicy` | boolean | 是否辣 |
| `tags` | string[] | 自由标签（Day 12 AND 筛选用） |
| `cuisine` | `'川'\|'粤'\|'鲁'\|'苏'\|'浙'\|'闽'\|'湘'\|'徽'` \| 空 | 八大菜系，可缺省 |
| `score` | 1–5 整数 | 评分 |
| `updatedAt` | string（ISO 8601） | 一律后端时钟写入，前端只回显 |

---

*版本：v1.3（Day 22，2026-10-09）· v1.3 改动：接口 #4（GET /api/ratings）、#5（PUT /api/ratings/:foodId）、#6（DELETE /api/ratings/:foodId）实现并上线（云函数 ratings，PostgREST REST API + API Key 方案，HTTP 网关路由已绑 /api/ratings）；总表 #4 #5 #6 状态标 ✅ Day 22；#5 #6 各加一段「今日课题『删除为什么比新增容易出事』」说明（PUT/DELETE 调用方需要二次确认，前端 StarRating 已加 `window.confirm`，云函数无状态由调用方兜底；DELETE 重复返回 404「无此评分」而非幂等 204，避免调用方误判「删成功」）。前端 `StarRating.tsx` 两条删除路径（再点同一颗星 + 「清除我的评分」按钮）Day 22 加 `window.confirm` 二次确认。此前 v1.2（Day 17）。*

> **Day 17 实现备注（重要，Day 18+ 写接口沿用）**：体验版共享集群不提供 PG 内网/外网地址，
> 云函数**无法用 `pg` 库 TCP 直连**。已改用官方 PostgREST REST API：
> `https://{envId}.api.tcloudbasegateway.com/v1/rdb/rest/{table}`，
> 认证用 **API Key**（service_role，配在函数环境变量 `CLOUDBASE_API_KEY`，严禁进代码/前端/提交）。
> 写操作（POST/PUT/DELETE）同样走 REST API（`Prefer: return=representation` 返回落库行）。
