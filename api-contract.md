# api-contract.md — 「do you eat」接口契约 v1.0

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

### 用户身份 —— ⚠️ Day 16 待拍板的开放问题

现在 localStorage 天然按浏览器隔离；上云后需要一种用户标识。**候选方案**（Day 16 定）：
匿名 ID（前端首次生成 UUID 存 localStorage，每次请求带 `X-User-Id` 头）。
契约中所有「按用户隔离」的接口先按此占位，若届时改用 CloudBase 匿名登录，接口形状不变，只换身份来源。

### 命名风格

- 路径全小写、复数名词（`/foods` `/ratings` `/favorites`）；
- 字段名 camelCase，与前端 TS 类型（`src/types/food.ts`）逐字段对齐，**不做蛇形转换**。

---

## 一、foods 表（食物库）→ 3 个接口

对应前端：`mockApi.ts` 的 `fetchFoods / addFood / removeFood`，食物库页和场景页共用。
数据形状 = 前端 `Food` 类型原样上云（见附录 A）。

### 1. GET /api/foods — 读取食物列表

首页、食物库页、场景页打开时的**第一个请求**（案例清单里「别忘了的列表读取接口」）。

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

### 4. GET /api/ratings — 读取当前用户全部评分

对应 `getAllRatings`（列表读取接口）。请求头带 `X-User-Id`。

| 项 | 内容 |
|---|---|
| 请求参数 | 无 |
| 成功响应 | `200` + `UserRating[]`（没有评过 = 空数组 `[]`，不是 404） |

```json
[
  { "foodId": "f001", "score": 5, "updatedAt": "2026-09-22T14:30:00.000Z" }
]
```

### 5. PUT /api/ratings/:foodId — 写入 / 修改一条评分

对应 `setRating`（打分和改分同一个接口，覆盖写）。

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

### 6. DELETE /api/ratings/:foodId — 取消评分

对应 `clearRating`（评分组件的「取消」）。

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

### 7. GET /api/favorites — 读取收藏列表

**案例清单点名要求的那个接口**。App 启动时拉一次，恢复用户的收藏状态（现在刷新即丢，上云后修复的就是这一点）。

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
| 已收藏过（重复收藏） | 409 | `{"error": {"code": "CONFLICT", "message": "已收藏"}}`（幂等处理：也可直接返回 201，Day 16 定） |

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

| # | 方法 | 路径 | 用途 | 前端替换的函数 | 对应表 |
|---|---|---|---|---|---|
| 1 | GET | /api/foods | 食物列表全量读取 | `mockApi.fetchFoods` | foods |
| 2 | POST | /api/foods | 新增一道菜 | `mockApi.addFood` | foods |
| 3 | DELETE | /api/foods/:id | 删除一道菜 | `mockApi.removeFood` | foods |
| 4 | GET | /api/ratings | 读取全部评分 | `storage.getAllRatings` | ratings |
| 5 | PUT | /api/ratings/:foodId | 写入/修改评分 | `storage.setRating` | ratings |
| 6 | DELETE | /api/ratings/:foodId | 取消评分 | `storage.clearRating` | ratings |
| 7 | GET | /api/favorites | 读取收藏列表 | （新增，App 启动时） | favorites |
| 8 | POST | /api/favorites/:foodId | 收藏 | `favoriteApi.addFavorite` | favorites |
| 9 | DELETE | /api/favorites/:foodId | 取消收藏 | `favoriteApi.removeFavorite` | favorites |
| 10 | GET | /api/health/profile | 读取健康档案 | `healthStorage.getHealth` | health_profiles |
| 11 | PUT | /api/health/profile | 保存健康档案 | `healthStorage.saveHealth` | health_profiles |
| 12 | DELETE | /api/health/profile | 清空健康档案 | `healthStorage.clearHealth` | health_profiles |

外加已上线的 `GET /api/health`（健康检查，不在上表，无表）。

**共 4 张表**：`foods` / `ratings` / `favorites` / `health_profiles`（Day 16 建表清单）。

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

*版本：v1.0（Day 15，2026-10-02）· 下一次修订：Day 16 建表时如有出入随建随改，改完在此登记。*
