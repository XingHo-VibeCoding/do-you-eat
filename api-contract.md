# api-contract.md — 「do you eat」接口契约 v1.8

> **地位**：本文档是第 3 周（Day 16–20）建表和写接口的**唯一施工依据**。
> Day 15 只登记占位，不实现任何接口。
>
> **推导来源**：第 2 周四个页面（首页抽卡 / 食物库 / 场景 / 健康）+ 三个 service 文件
> （`mockApi.ts` / `storage.ts` / `healthStorage.ts`）+ `favoriteApi.ts`。
> 前端现有代码的函数签名和返回形状，全部按「换 fetch 时上层组件一行不改」的原则设计。
>
> **v1.8（2026-10-24）食堂真实数据上云**：`foods` 表加 `price` / `location` / `"canteenType"`，
> 接口路径与状态码不变，仅 #1 返回多带字段、#2 可选接收字段（详见 §一）。
>
> **v1.7（2026-10-24）新增 AI 健康助手**：接口 #10–#16，新增 `daily_logs` 表。
> 路由关键事实（当日实测确认）：HTTP 网关的 `/api/health` 是**前缀路由**——
> `GET /api/health/profile` 实测返回 200，说明 `/api/health/<子路径>` 一律打进 `health` 云函数。
> 因此 #10–#15 全部实现在**已有的 health 云函数**内，**不需要新建任何路由绑定**；
> 只有 #16 需要新建 `assistant` 云函数 + 一条路由。

---

## 〇、通用约定（先读这个）

### 基地址

```
https://doyoueat-d5g36rg7ia785b553-1496350653.ap-shanghai.app.tcloudbase.com/api
```

（`/api/health` 已上线可用，就是这套地址下的第一个接口。它是前缀路由，
`/api/health/profile` 与 `/api/health/logs` 都落在同一个 `health` 云函数里。）

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

> **Day 30 追加 3 个可选字段**（浙大紫金港食堂真实菜品采集）：`price`（价格，元）、
> `location`（食堂位置）、`canteenType`（档口类型）。在 `db/schema.sql` 里全部可空——
> 老数据与用户自建菜没有价格档口，查出来是 **null**（不是 undefined）。
> 前端 `formatFoodMeta()` 对 null 做跳过处理，避免显示「¥null」。
> POST 规则：**不传 = 不写库**（老行为不变）；传了就校验，非法 400 不静默丢弃。

| 字段 | 类型 | 合法值 |
|---|---|---|
| `price` | number \| null | `0 ~ 999.99`（列类型 NUMERIC(5,2)） |
| `location` | string \| null | `大食堂` / `二楼西区食堂` / `二楼东区食堂` |
| `canteenType` | string \| null | `风味餐厅` / `休闲餐厅` / `民族餐厅` |

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
    "id": "f173",
    "name": "麻婆豆腐",
    "emoji": "🌶️",
    "description": "麻辣豆腐，拌饭一绝",
    "mealPeriod": "lunch",
    "spicy": true,
    "tags": ["辣", "下饭"],
    "cuisine": "川",
    "price": 3.5,
    "location": "大食堂",
    "canteenType": "风味餐厅"
  }
]
```

> 老数据（非食堂采集）这三项为 `null`：`"price": null, "location": null, "canteenType": null`。

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
// 食堂采集版（Day 30 起可带三项，全都不传也照样能建）
{
  "name": "锅包肉",
  "emoji": "🍖",
  "description": "外酥里嫩，糖醋口",
  "mealPeriod": "lunch",
  "spicy": false,
  "tags": ["硬菜", "经典"],
  "price": 5.5,
  "location": "大食堂",
  "canteenType": "风味餐厅"
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
| price 非数字 / 越界（Day 30） | 400 | `{"error": {"code": "BAD_REQUEST", "message": "price 非法，只能是 0 ~ 999.99 之间的数字"}}` |
| location 不在 3 个合法值内（Day 30） | 400 | `{"error": {"code": "BAD_REQUEST", "message": "location 非法，只能是 大食堂 / 二楼西区食堂 / 二楼东区食堂 之一"}}` |
| canteenType 不在 3 个合法值内（Day 30） | 400 | `{"error": {"code": "BAD_REQUEST", "message": "canteenType 非法，只能是 风味餐厅 / 休闲餐厅 / 民族餐厅 之一"}}` |

### 3. DELETE /api/foods/:id — 删除一道菜 ✅ 已实现（Day 24）

对应食物库页每条右侧的「删除」按钮。

> **实现说明（Day 24）**：云函数 `functions/foods` 加 DELETE 分支（此前白名单只有 GET/POST，
> 前端删除按钮一直 405——Day 24 定性为 Bug 修复，详见 `docs/day24-bug-fix.md`）。
> 仓库层 `deleteFoodById` 用 `Prefer: return=representation` 拿被删行数判断 204/404（照抄 Day 22
> ratings 的 `deleteOne` 模式）。连带清理靠数据库：ratings / favorites 的 FK 带
> `ON DELETE CASCADE`，删菜自动清评分和收藏，代码零改动。

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
| 本来就没收藏 | 404 | `{"error": {"code": "NOT_FOUND", "message": "无此收藏：<foodId>"}}` |

> **结营后 2026-10-17 实现**（此前一直 405，用户点了收藏取消不掉）。口径与接口 #6（删除评分）保持一致：
> 删到了 → `204` 无 body；本来就没收藏 → `404`「无此收藏」而**不是**幂等 204——避免调用方把「根本没收藏过」误判成「取消成功」。
> 实现要点：PostgREST 的 DELETE 对「条件不匹配」不报错、只返回空数组，所以必须加
> `Prefer: return=representation` 后靠「返回的行数组是否为空」判断有没有删到东西，不能只看 HTTP 状态码。
> 前端 `removeFavorite` Day 20 就写好了，本次只补后端，前端零改动。

---

## 四、health_profiles 表（健康档案）→ 3 个接口

对应前端：`healthStorage.ts` 的 `getHealth / saveHealth / clearHealth`。
档案是**单条记录**（不是列表），按 userId 一人一份。

> **Day 29 全部实现**（此前长期未上线，是契约里最大的欠账；#10 曾因为 `/api/health`
> 是前缀路由而被健康检查分支吃掉）。
> 实现位置：**已有的 `functions/health`**——不再新建云函数、不再新建路由。
> 路径判定（沿用 Day 18 已验证的网关剥前缀行为）：绑 `/api/health` 后 `event.path`
> 只剩子路径（`/api/health/profile` → `/profile`），接口层按子路径分派：
> `/profile` 或空 → 健康检查；`/profile` 带 profile 段 → 档案接口；`/logs...` → 每日记录接口。

### 10. GET /api/health/profile — 读取健康档案 ✅ 已实现（Day 29）

| 项 | 内容 |
|---|---|
| 请求参数 | 无 |
| 成功响应（已保存） | `200` + 档案 |
| 成功响应（没填过） | `200` + `null`（和前端 `getHealth` 返回 null 的约定一致，不是 404） |

```json
{ "heightCm": 175, "weightKg": 68.5, "age": 28, "updatedAt": "2026-09-29T16:42:00.000Z" }
```

### 11. PUT /api/health/profile — 保存健康档案 ✅ 已实现（Day 29）

对应 `saveHealth`（覆盖写，重复保存即更新）。
三个字段**必须一次给全**（档案是整体替换，不做部分更新——身高体重年龄本来就是一起填的）。

| 项 | 内容 |
|---|---|
| 请求体 | `{"heightCm": 175, "weightKg": 68.5, "age": 28}`（`updatedAt` 后端写） |
| 成功响应 | `200` + 落库后的完整档案 |

| 错误 | HTTP | body |
|---|---|---|
| 缺字段 / 不是数字 | 400 | `{"error": {"code": "BAD_REQUEST", "message": "请完整填写身高、体重、年龄"}}` |
| 字段越界（身高 50–250 / 体重 10–300 / 年龄 1–150，与前端校验一致） | 400 | `{"error": {"code": "BAD_REQUEST", "message": "身高请填 50~250 之间的数字（cm）"}}` |

### 12. DELETE /api/health/profile — 清空健康档案 ✅ 已实现（Day 29）

对应 `clearHealth`。

| 项 | 内容 |
|---|---|
| 请求参数 | 无 |
| 成功响应 | `204` 无 body（没档案时也返回 204，幂等——与 #6/#9 的「删不到就 404」口径相反） |

> 为什么这里幂等、#6/#9 却不幂等：档案只有一份，「本来就没有」和「删成功」对用户
> 是同一件事；而评分/收藏是多条，用户点取消时必须知道「其实你根本没收藏过」。

---

## 五、daily_logs 表（每日健康记录）→ 3 个接口 ✅ 已实现（Day 29）

对应前端：AI 健康助手页的「今天的健康数据」表单 + 体重折线图。
数据是**流水**：一天一条，`(userId, date)` 唯一（与 ratings/favorites 同构）。

### 13. GET /api/health/logs — 读取每日记录

| 项 | 内容 |
|---|---|
| 请求参数 | `?days=30`（可选，默认 30；取最近 N 天） |
| 成功响应 | `200` + `DailyLog[]`（按日期升序；没有记录 = `[]`） |

```json
[
  {
    "date": "2026-10-24",
    "weightKg": 67.0,
    "sleepHours": 7.5,
    "waterMl": 1200,
    "mood": 4,
    "meals": ["麻婆豆腐", "米饭"],
    "note": "晚上有点饿",
    "createdAt": "2026-10-24T01:20:00.000Z"
  }
]
```

### 14. PUT /api/health/logs/:date — 写入 / 更新某一天的记录

**字段级 upsert**（不是整体覆盖）：请求体里出现的字段覆盖，没出现的**保留原值**。
理由：用户早上记体重、晚上补饮食是正常使用方式，整体覆盖会把早上的体重抹掉。

| 项 | 内容 |
|---|---|
| 路径参数 | `date`，格式 `YYYY-MM-DD` |
| 请求体 | 任意字段子集，例 `{"weightKg": 67, "sleepHours": 7.5}` |
| 成功响应 | `200` + 落库后的完整记录（`createdAt` 后端写） |

| 错误 | HTTP | body |
|---|---|---|
| date 格式不是 `YYYY-MM-DD` | 400 | `{"error": {"code": "BAD_REQUEST", "message": "日期格式应为 YYYY-MM-DD"}}` |
| 全部字段都为空 / 一个有效字段都没有 | 400 | `{"error": {"code": "BAD_REQUEST", "message": "至少要填一项数据"}}` |
| 字段越界（体重 10–300 / 睡眠 0–24 / 饮水 0–10000 / 心情 1–5） | 400 | `{"error": {"code": "BAD_REQUEST", "message": "体重请填 10~300 之间的数字（kg）"}}` |

### 15. DELETE /api/health/logs/:date — 删除某一天的记录

| 项 | 内容 |
|---|---|
| 路径参数 | `date` |
| 成功响应 | `204` 无 body |

| 错误 | HTTP | body |
|---|---|---|
| 本来就没这一天的记录 | 404 | `{"error": {"code": "NOT_FOUND", "message": "无此记录：<date>"}}` |

> 口径与 #6/#9 一致：**删不到就 404**，不幂等。

---

## 六、assistant（AI 健康助手）→ 1 个接口 ✅ 已实现（Day 29）

唯一需要新建云函数 + 新建路由的一组。Key 只存在云函数环境变量里，**永不进前端**。

### 16. POST /api/assistant/chat — 向 AI 提问

| 项 | 内容 |
|---|---|
| 请求体 | `{"intent": "trend" \| "recommend" \| "log" \| "free", "message"?, "candidates"?, "logs"?, "profile"?}` |
| 成功响应 | `200` + `{"reply": "...", "source": "llm" \| "rules"}` |

四个意图：

| intent | 用途 | 必填字段 | 规则引擎（无 Key 时）的行为 |
|---|---|---|---|
| `trend` | 体重趋势点评 | `logs: DailyLog[]` | 按真实数据算 7 天/30 天变化量与周降幅，给分档文案 |
| `recommend` | 今天吃什么 | `candidates: string[]`、`profile?` | 从候选里挑一道 + 按 BMI/时段给一句理由 |
| `log` | 记录完今天的点评 | `logs[0]`（当天记录） | 逐项比对睡眠/饮水/心情阈值，逐条给结论 |
| `free` | 自由提问 | `message` | 返回一句固定的「我还没接上大模型」+ 通用建议 |

> **双引擎设计（关键）**：云函数读环境变量 `LLM_API_KEY`。
> - 没配 → 走规则引擎，`source: "rules"`。页面**照常可用**，建议是按真实数据算出来的模板句。
> - 配了 → 走大模型，`source: "llm"`。前端代码一行不改。
> 这样 Key 申请、实名、出网这些外部依赖卡住时，功能不会跟着塌掉。

| 错误 | HTTP | body |
|---|---|---|
| 请求体不是 JSON / 缺 intent | 400 | `{"error": {"code": "BAD_REQUEST", "message": "缺少 intent"}}` |
| 调大模型失败 | 200 | 自动降级为规则引擎回答，`source: "rules"`（不把上游故障抛给用户） |

---

## 七、接口总表（16 个）

| # | 方法 | 路径 | 用途 | 前端替换的函数 | 对应表 | 状态 |
|---|---|---|---|---|---|---|
| 1 | GET | /api/foods | 食物列表全量读取 | `mockApi.fetchFoods` | foods | ✅ Day 17 |
| 2 | POST | /api/foods | 新增一道菜 | `mockApi.addFood` | foods | ✅ Day 18 |
| 3 | DELETE | /api/foods/:id | 删除一道菜 | `mockApi.removeFood` | foods | ✅ Day 24 |
| 4 | GET | /api/ratings | 读取全部评分 | `storage.getAllRatings` | ratings | ✅ Day 22 |
| 5 | PUT | /api/ratings/:foodId | 写入/修改评分 | `storage.setRating` | ratings | ✅ Day 22 |
| 6 | DELETE | /api/ratings/:foodId | 取消评分 | `storage.clearRating` | ratings | ✅ Day 22 |
| 7 | GET | /api/favorites | 读取收藏列表 | （新增，App 启动时） | favorites | ✅ Day 17 |
| 8 | POST | /api/favorites/:foodId | 收藏 | `favoriteApi.addFavorite` | favorites | ✅ Day 18 |
| 9 | DELETE | /api/favorites/:foodId | 取消收藏 | `favoriteApi.removeFavorite` | favorites | ✅ 结营后 10-17 |
| 10 | GET | /api/health/profile | 读取健康档案 | `healthStorage.getHealth` | health_profiles | ✅ Day 29 |
| 11 | PUT | /api/health/profile | 保存健康档案 | `healthStorage.saveHealth` | health_profiles | ✅ Day 29 |
| 12 | DELETE | /api/health/profile | 清空健康档案 | `healthStorage.clearHealth` | health_profiles | ✅ Day 29 |
| 13 | GET | /api/health/logs | 读取近 N 天每日记录 | `assistantApi.fetchLogs` | daily_logs | ✅ Day 29 |
| 14 | PUT | /api/health/logs/:date | 写入/更新某天记录 | `assistantApi.saveLog` | daily_logs | ✅ Day 29 |
| 15 | DELETE | /api/health/logs/:date | 删除某天记录 | `assistantApi.deleteLog` | daily_logs | ✅ Day 29 |
| 16 | POST | /api/assistant/chat | 向 AI 提问 | `assistantApi.askAssistant` | （无表） | ✅ Day 29 |

外加已上线的 `GET /api/health`（健康检查，不在上表，无表）。

**共 5 张表**：`foods` / `ratings` / `favorites` / `health_profiles` / **`daily_logs`**（Day 29 新增）。

### 表结构已落库（Day 16 · PostgreSQL）

- **数据库**：CloudBase 控制台「SQL 型数据库」（PostgreSQL）。`db/schema.sql` = 表结构唯一设计契约；`db/seed.sql` = 可复现种子数据（foods 8 / ratings 7 / favorites 6 / health_profiles 5，foods 全部照抄 `src/data/foods.ts` 真实内置库，用户用 UUID 形态），两者均可重复执行。
- **列名 = camelCase 且必须带双引号**：PG 会把不带引号的标识符折叠成全小写；带引号保住驼峰后，`SELECT *` 的结果直接就是接口要返回的 JSON 形状，零转换。
- **键与约束**：
  - 主键：`foods.id`；`ratings("userId","foodId")`、`favorites("userId","foodId")` 复合主键（一人一菜一条）；`health_profiles."userId"`（一人一份）；
  - 外键：`ratings."foodId"`、`favorites."foodId"` → `foods.id`，`ON DELETE CASCADE`（删菜连带清评分/收藏）；
  - CHECK：`mealPeriod` 四选一 / `score` 1~5 / 身高 50~250 / 体重 10~300 / 年龄 1~150（与 HealthPage 校验一致）。
- **类型要点**：`tags` 用 JSONB（数组原样存，AND 筛选在前端做）；`updatedAt` 存 ISO 8601 字符串 `VARCHAR(24)`（与附录 A 一致，接口零转换）；PG 无 TINYINT / UNSIGNED → `SMALLINT` + CHECK 兜底；体重 `NUMERIC(5,1)`。
- **userId 不建 users 表**：前端 UUID 透传（见〇节拍板），数据库里只是一列字符串。

**⑤ daily_logs（每日健康记录，Day 29 新增，一人一天一条）**——对应接口 13/14/15。
在线上已有的 4 张表之外单独追加，不重跑 `schema.sql`（那份脚本会 DROP 全表）。

```sql
CREATE TABLE IF NOT EXISTS daily_logs (
  "userId"     VARCHAR(64)  NOT NULL,
  date         VARCHAR(10)  NOT NULL,
  "weightKg"   NUMERIC(5,1) NULL,
  "sleepHours" NUMERIC(3,1) NULL,
  "waterMl"    SMALLINT     NULL,
  mood         SMALLINT     NULL,
  meals        JSONB        NULL,
  note         VARCHAR(200) NULL,
  "createdAt"  VARCHAR(24)  NOT NULL,
  PRIMARY KEY ("userId", date),
  CONSTRAINT chk_log_weight  CHECK ("weightKg"   IS NULL OR "weightKg"   BETWEEN 10 AND 300),
  CONSTRAINT chk_log_sleep   CHECK ("sleepHours" IS NULL OR "sleepHours" BETWEEN 0  AND 24),
  CONSTRAINT chk_log_water   CHECK ("waterMl"    IS NULL OR "waterMl"    BETWEEN 0  AND 10000),
  CONSTRAINT chk_log_mood    CHECK (mood         IS NULL OR mood         BETWEEN 1  AND 5)
);
```

设计取舍：
- **全部业务字段可空**：用户可能早上只记了体重、晚上才补饮食。可空 + 接口 #14 的
  「字段级 upsert」配合，才不会让早上的体重被晚上的提交抹掉。
- **date 用 `VARCHAR(10)` 存 `YYYY-MM-DD` 字符串而不是 DATE 类型**：与项目既有的
  「`updatedAt` 存 ISO 字符串、`SELECT *` 出来直接就是接口 JSON 形状」惯例一致，
  前端拿到的形状和写入的形状完全一样，零转换。
- **不设外键**：daily_logs 只按 userId 独立存储，删掉用户数据不需要 CASCADE。

---

## 八、明确不做的事（防蔓延）

- **抽卡随机挑选不上后端**：`pickRandom` 留在前端（全量列表拉回来本地随机，逻辑已存在且好用）；
- **筛选不上后端**：标签多选（AND）、菜系 / 时段 segmented、「只看收藏」开关，全部前端过滤；
- **分页不做**：54 条 + 用户自建，全量返回足够（< 1000 条）；
- **鉴权 / 跨域之外的登录体系不做**：第 3 周只做匿名用户（见〇节开放问题）；
- **AI 不流式输出**（Day 29）：一次性返回整个回答。流式（SSE）在 CloudBase HTTP 网关的
  Event 函数上要做分块编码，复杂度远超收益；前端用等待态 + 超时兜底即可；
- **AI 不做医疗诊断**（Day 29）：只做饮食/作息的生活方式建议，回答里不带疾病判断、
  不带用药建议。这是产品口径红线，不因为模型能力更强而放开。

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

### 附录 B：DailyLog 字段对照（与 `src/types/health.ts` 逐字段一致，Day 29）

| 字段 | 类型 | 说明 |
|---|---|---|
| `date` | string（`YYYY-MM-DD`） | 与 userId 组成复合主键；后端按**用户本地日历日**由前端传入，不做时区换算 |
| `weightKg` | number \| null | 体重 10–300 |
| `sleepHours` | number \| null | 睡眠时长 0–24 |
| `waterMl` | number \| null | 饮水 0–10000 |
| `mood` | number \| null | 心情 1–5 |
| `meals` | string[] \| null | 当天吃了什么，JSONB 数组 |
| `note` | string \| null | 备注 ≤200 字 |
| `createdAt` | string（ISO 8601） | 后端时钟写入，前端只回显 |

---

*版本：v1.8（Day 30，2026-10-24）· **食堂真实数据上云**：`foods` 表追加 3 个可选列 `price` / `location` / `"canteenType"`（全部可空，老数据为 null），接口 #1/#2/#3 的路径、状态码、错误码**一律不变**，只是 #1 的返回多带 3 个字段、#2 的请求体可选接收 3 个字段（不传不写库，传了严格校验、非法 400）。**接口编号与总表状态列未动**——`scripts/verify.sh` 的 16 条基线不受影响。配套：`db/migrate-add-canteen-fields.sql`（增量加列，可重复跑）、`db/seed-canteen-foods.sql`（120 条食堂菜品，ON CONFLICT 幂等）。*

*版本：v1.7（Day 29，2026-10-24）· **AI 健康助手上线**：新增 `daily_logs` 表与接口 #13（GET /api/health/logs）、#14（PUT /api/health/logs/:date，字段级 upsert）、#15（DELETE /api/health/logs/:date，删不到 404）、#16（POST /api/assistant/chat，双引擎：有 `LLM_API_KEY` 走大模型、没有走规则引擎，`source` 字段标明来源）；补上长期欠账的 #10/#11/#12（健康档案三接口）。**关键结构决策：实测确认 `/api/health` 是前缀路由**（`GET /api/health/profile` 返回 200 且被健康检查分支接住），因此 #10–#15 全部实现在已有的 `functions/health` 里，用户**无需新建任何路由绑定**；只有 #16 需要新建 `assistant` 云函数并绑一条路由。前端 `#/health` 路由不变、内容整个换成 AI 助手页（原档案表单收进「我的资料」折叠区），已发布的页面地址不失效。*

*版本：v1.6（结营后，2026-10-17）· v1.6 改动：**接口 #9（DELETE /api/favorites/:foodId）实现并上线**——这是结营验收时唯一真正阻塞核心流程的缺口（用户点了收藏取消不掉，一直 405）。改动：`functions/favorites/favoritesRepository.js` 新增 `deleteOne()`（DELETE + `Prefer: return=representation`，靠返回行数组判空），`functions/favorites/index.js` 方法白名单加 DELETE 并新增 DELETE 分支（204 删到 / 404 无此收藏，与 #6 同口径）；前端 `removeFavorite` 早已写好，**前端零改动**。副作用：此前因 #9 未实现而删不掉的验收测试残留（`day28-final-check` / `f001`）已一并清掉。*

*版本历史：v1.5（Day 28，2026-10-16）· **仅文档对齐，无任何代码改动**——总表 #2（POST /api/foods）、#8（POST /api/favorites/:foodId）补 ✅ Day 18。这两个接口在 Day 18 写接口那批就已上线，但契约总表停在 v1.2（Day 17）没同步，此后每次跑 `scripts/verify.sh` 都会报 EXCEPTION「实测已实现但总表未标 ✅」（Day 21 记为待办，Day 28 结营前补齐）。补齐后 EXCEPTION 基线由 3 条降为 1 条（剩下 #10，属平台限制）。

*版本历史：v1.4（Day 24，2026-10-12）· 接口 #3（DELETE /api/foods/:id）实现并上线（Day 24 Bug 修复——此前 foods 云函数白名单只有 GET/POST，前端删除按钮 405；修复：仓库层加 deleteFoodById + 接口层加 DELETE 分支，CASCADE 连带清理；前端 LibraryPage 移除 405「尚未上线」特判文案）；总表 #3 状态标 ✅ Day 24。v1.3（Day 22，2026-10-09）· 接口 #4（GET /api/ratings）、#5（PUT /api/ratings/:foodId）、#6（DELETE /api/ratings/:foodId）实现并上线（云函数 ratings，PostgREST REST API + API Key 方案，HTTP 网关路由已绑 /api/ratings）；总表 #4 #5 #6 状态标 ✅ Day 22；#5 #6 各加一段「今日课题『删除为什么比新增容易出事』」说明（PUT/DELETE 调用方需要二次确认，前端 StarRating 已加 `window.confirm`，云函数无状态由调用方兜底；DELETE 重复返回 404「无此评分」而非幂等 204，避免调用方误判「删成功」）。前端 `StarRating.tsx` 两条删除路径（再点同一颗星 + 「清除我的评分」按钮）Day 22 加 `window.confirm` 二次确认。v1.2（Day 17）。*

> **Day 17 实现备注（重要，Day 18+ 写接口沿用）**：体验版共享集群不提供 PG 内网/外网地址，
> 云函数**无法用 `pg` 库 TCP 直连**。已改用官方 PostgREST REST API：
> `https://{envId}.api.tcloudbasegateway.com/v1/rdb/rest/{table}`，
> 认证用 **API Key**（service_role，配在函数环境变量 `CLOUDBASE_API_KEY`，严禁进代码/前端/提交）。
> 写操作（POST/PUT/DELETE）同样走 REST API（`Prefer: return=representation` 返回落库行）。
