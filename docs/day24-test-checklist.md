# Day 24｜「do you eat」核心流程测试清单

> 用途：**回归基线**。修复 Bug 前后各跑一遍，前后各留一份证据（截图 / curl 输出）。
> 口径说明：今日清单原文里的「检查台 → plan_days / checkins → 打卡」**在本项目不存在**（MVP 只有抽卡 + 评级 + 打分，数据库只有 `foods` / `favorites` / `ratings` / `health_profiles`）。
> 本清单已按**真实功能**重写，链路等价替换为：
> **打开健康档案「检查台」→ 读取数据（health_profiles / foods / favorites / ratings）→ 打分（= 写入 ratings）→ 刷新确认 → 修改评分 → 删除评分 / 删除收藏**

- 环境：线上 `https://doyoueat-d5g36rg7ia785b553-1496350653.ap-shanghai.app.tcloudbase.com/api`
- 契约版本：`api-contract.md` v1.4
- 匿名身份：所有带用户数据的请求都要带 `X-User-Id`（前端首次启动生成 UUID 存本地）
- 基线时间：2026-10-12（Day 24）· 测试用户：`test-day24-*`
- 中文 JSON 一律写 UTF-8 文件 + `curl --data-binary @文件`（命令行直接 `-d` 中文会 GBK 乱码）

---

## 一、主链路（6 步，逐步留证）

### S1 打开健康档案「检查台」

| 项 | 内容 |
|---|---|
| 操作 | 浏览器开 `…/#/health`，看表单是否回显上次录入的身高/体重/年龄 |
| 预期 | 表单可输入；有历史数据时自动回显 |
| 验证方式 | UI 目视 + `localStorage.getItem('dye:health:profile')` |
| 关联 | ⚠️ 现在走 `src/services/healthStorage.ts`（**浏览器本地**），云端接口 #10–#12 **未上线** |
| 基线 | ✅ 可用（本地态） |

### S2 读取数据（四张「表」各读一遍）

| 子步 | 命令 | 预期 | 关联接口 | 基线 |
|---|---|---|---|---|
| S2a 读食物库 | `curl "$API/foods"` | 200 + 9 条 | #1 | ✅ |
| S2b 读我的收藏 | `curl -H "X-User-Id: $U" "$API/favorites"` | 200 + 数组 | #7 | ✅ |
| S2c 读我的评分 | `curl -H "X-User-Id: $U" "$API/ratings"` | 200 + 数组 | #4 | ✅ |
| S2d 读健康档案 | `curl -H "X-User-Id: $U" "$API/health/profile"` | 200 + 档案 or `null` | #10 | ❌ 未实现（被 `/api/health` 路由吃掉，返回 `{"ok":true,...}`） |

**必测边界**：S2b / S2c **不带** `X-User-Id` → 应 `400 {"code":"BAD_REQUEST","message":"缺少有效的 X-User-Id 请求头"}`（已实测 ✅）

### S3 打分（= 写入）

| 项 | 内容 |
|---|---|
| 操作 | UI：在菜品卡片点星星；API：`curl -X PUT -H "Content-Type: application/json" -H "X-User-Id: $U" -d '{"score":4}' "$API/ratings/f001"` |
| 预期 | UI：星星点亮；API：`200` + `{"userId","foodId","score":4,"updatedAt":"后端时钟"}` |
| 关联 | #5 |
| 基线 | ✅ `200` |

**边界**：`score=0` / `score=6` / `score=3.5` → 全部 `400`（已实测 ✅）；不存在的 foodId（`f999`）→ `404 食物不存在：f999`（已实测 ✅）

> ⚠️ **已知缺口**：前端 UI 打分仍写 `storage.ts`（**localStorage**），**没有**调用 #5——所以 UI 打分后 `curl GET /api/ratings` 看不到。这条链路「UI 写入」与「云端读取」目前是断的（Day 22 遗留，Day 25 候选 #4）。当前 UI 侧验证只能用 `localStorage.getItem('dye:rating:f001')`。

### S4 刷新确认（持久化）

| 项 | 内容 |
|---|---|
| 操作 | 刷新页面（或重新 curl） |
| 预期 | **云端数据**：评分还在；**UI 本地评分**：刷新后也在（localStorage 持久） |
| 验证方式 | `curl` 重读 + 刷新后目视 |
| 基线 | ✅ 云端 PUT 后重读仍在；本地评分刷新不丢 |
| ⚠️ 反例 | 换浏览器 / 清缓存：本地评分消失——跨设备不一致（Day 22 遗留，**不是 Bug 是 MVP 边界**，但要在 Day 25 决定去留） |

### S5 修改评分

| 项 | 内容 |
|---|---|
| 操作 | 对同一食物再打一次分（同样 `PUT #5`，走 upsert） |
| 预期 | `200`，`score` 被覆盖，`updatedAt` 变新 |
| 基线 | ✅ 4 → 5 覆盖成功，无重复行（复合主键 `("userId","foodId")` 起效） |
| 关联 | #5 |

### S6 删除（两条路径都要测）

| 子步 | 命令 / 操作 | 预期 | 关联接口 | 基线 |
|---|---|---|---|---|
| S6a 删评分（首次） | `curl -X DELETE -H "X-User-Id: $U" "$API/ratings/f001"` | `204` 无 body | #6 | ✅ |
| S6b 删评分（重复） | 同上再来一次 | `404 无此评分：f001`（**故意不幂等**，避免调用方误判「删成功」） | #6 | ✅ |
| S6c 删收藏（首次） | `curl -X DELETE -H "X-User-Id: $U" "$API/favorites/f001"` | `204` | #9 | ❌ **405 本接口只支持 GET 和 POST** |
| S6d 删一道菜 | `curl -X DELETE "$API/foods/f001"` | `204` | #3 | ✅ Day 24 修复 |
| S6e 删不存在的菜 | `curl -X DELETE "$API/foods/f999"` | `404 食物不存在：f999` | #3 | ✅ |
| S6f CASCADE 连带 | 给某菜打分+收藏 → 删该菜 → 重读 ratings / favorites | 该 foodId 从两处消失 | #3 + DB FK | ✅ Day 24 实测 |

> ⚠️ **S6c 是当前唯一的红线**：前端「只看收藏」里取消收藏会失败（Bug #9，Day 25 第一顺位）。

---

## 二、补充边界用例（刁钻输入，卡住时的降级方案）

| # | 输入类型 | 用例 | 预期 | 基线 |
|---|---|---|---|---|
| B1 | 空值 | `POST /api/foods` 缺 `name` / 空 `name` | `400` 中文提示 | ✅ |
| B2 | 空 body | `POST /api/foods` 无 body | `400 请求体不能为空，需要 JSON 对象` | ✅ |
| B3 | 枚举越界 | `mealPeriod: "midnight"` | `400` | ✅ |
| B4 | 数值越界 | 身高 `49` / 体重 `9` / 年龄 `151` | `400` | ✅ 云端未实现，仅 DB CHECK 层 |
| B5 | 数值越界 | `score: 0 / 6 / 3.5` | `400` | ✅ |
| B6 | 超长文本 | `X-User-Id` 70 字符 | `400` | ✅ |
| B7 | 超长文本 | `POST foods` 超长 `description` | `400`（不超过列上限） | 待测 |
| B8 | 缺失 header | ratings / favorites 不带 `X-User-Id` | `400` | ✅ |
| B9 | 非法方法 | `PATCH /api/foods/f001` | `405 本接口只支持 GET / POST / DELETE` | ✅ |
| B10 | 不存在的路径参数 | `DELETE /api/foods/缺id`（`DELETE /api/foods`） | `400 缺少 id…` | 待测 |
| B11 | 快速连点 | UI 连点「抽一抽」 | 第二次被 `rolling` 挡住，不重复抽 | 待测 |
| B12 | 快速连点 | UI 连点「删除」 | 第一次成功后条目消失，第二次无目标 | 待测 |
| B13 | 中文/emoji | `name: "🍜测试面"`、emoji 字段填多字符 | 正常落库或 `400` | 待测 |
| B14 | 重复提交 | `POST /api/favorites/:id` 同一菜两次 | 两次都 `201`（幂等） | ✅ |
| B15 | 重复提交 | `POST /api/foods` 同名菜两次 | 第二次 `409` 同名拒绝 | ✅ |

---

## 三、跑法（给非技术视角的最简说明）

1. 打开线上站 `https://doyoueat-d5g36rg7ia785b553-1496350653.tcloudbaseapp.com/`
2. 按 S1 → S6 顺序走一遍，**每步留一张截图**（关键看：刷新后数据还在不在、删除后条目少没少）
3. 想核云端真值：F12 → Network 面板看请求与响应；或按上面 curl 命令逐条打
4. 收尾：把截图前后两份一起存档到 `docs/day24-screenshots/`

---

## 四、已知阻塞（跑不通时先看这里，别当新 Bug 报）

| 阻塞 | 表现 | 归属 |
|---|---|---|
| #9 DELETE favorites | 取消收藏 → 405 | Day 25 候选 #1 |
| #10–#12 health profile | 健康档案读写删全走不到云端 | Day 25 候选 #2 #3 |
| 前端打分未接 #5 | UI 打分只在 localStorage，云端查不到 | Day 25 候选 #4 |
| 网关未知路由错误 | 返回体无 `.error` 包裹、message 英文 | Day 25 候选 #6 |
