# Day 28｜最终验收表（10 项逐项核对）

> 检查日期：2026-10-16　检查人：本人 + 自动检查器
> **2026-10-17 复核补记**：按项目纪律「验收证据必须当日重测」，结营后第二天重跑了一遍，
> 并把当时唯一真正阻塞核心流程的缺口 **#9 取消收藏（405）修好上线**了（契约升 v1.6）。
> 受影响的三处——第 3 项（数据库读写）、第 4 项附近那段接口清单、第五节未完成表——**已就地更新**，
> 更新处均标 `【10-17 复核】`。其余各项的结论是 10-16 当天实测的，未变。
> 结论口径：**每项只写 PASS / FAIL / 未执行三档**，未验证的一律写未执行，不拿历史结论冒充今天的证据。
> 安全口径：本文件不出现任何密钥（API Key、连接串一律不写）。

**自动检查器基线（先跑，后人工）**：`bash scripts/verify.sh` → **PASS 26 / FAIL 0 / EXCEPTION 1**，退出码 0（可发布）。
剩下那 1 条 EXCEPTION 是 #10（`GET /api/health/profile` 被 `/api/health` 前缀路由吃掉），属平台限制，不是文档欠账，下文第 4 项说明。

---

## 一、总表

| # | 检查项 | 结论 | 一句话证据 |
|---|---|---|---|
| 1 | 页面 / 视图数量 | **PASS** | 4 个视图（首页 / 食物库 / 场景 / 健康），路由常量与页面文件一一对应 |
| 2 | 反馈交互 | **PASS** | 收藏四态、抽卡骰子动画、中文报错、删除二次确认，均可现场点出来 |
| 3 | 数据库读写 | **PASS** | 今天实测：写入 200、读回 200、删除 204（收藏 201/200；**【10-17 复核】其 DELETE 已实现：204 删到 / 404 无此收藏**） |
| 4 | 前后端链路 | **部分通过** | 食物 / 收藏 ✅ 走云；**评分 ❌ 前端仍存 localStorage**，后端接口已上线但未接入 |
| 5 | 合法数据来源 | **PASS** | 数据全部自建（种子 + 用户自建），无爬取、无第三方接口；**但内置 54 条 vs 线上 9 条，存在同步缺口** |
| 6 | 公网地址 | **PASS** | 静态托管已上线且可打开（见第三节） |
| 7 | 线上持久化 | **PASS** | 写入后隔 3 秒换新请求取回，数据仍在，证明落库而非内存 |
| 8 | 回滚与备份说明 | **PASS** | `docs/rollback-manual.md` 含判断表 + Day 26 实测演练记录；表结构 / 种子 / 云函数均在库内可重建 |
| 9 | CloudBase 额度与到期风险 | **PASS** | 已用 220.96 / 3000 点，到期 2027-03-26，按速率够用到期；**不支持自动续费**（风险已写明） |
| 10 | 敏感文件 | **PASS** | 库内只有 `.env.example`（空占位）；全库 grep 无密钥形态；`.gitignore` 已拦 `.env` / `.tcb-home` |

**10 项中：PASS 9 项，部分通过 1 项（第 4 项），FAIL 0 项。**

---

## 二、逐项明细（含可当场复现的做法）

### 1. 页面 / 视图数量 —— PASS

- 路由常量：`src/lib/hashRouter.ts` 第 23 行 `export const ROUTES = ['/', '/library', '/scenarios', '/health']`
- 页面文件：`src/pages/` 下 4 个 —— `HomePage.tsx` / `LibraryPage.tsx` / `ScenariosPage.tsx` / `HealthPage.tsx`
- 分发：`src/App.tsx` 第 62 行 `switch (route)`，四个分支一一对应，未知 hash 回落首页
- **当场展示**：公网首页底部导航点四个 Tab，地址栏 hash 依次变成 `#/`、`#/library`、`#/scenarios`、`#/health`

> ⚠️ 附带事实（不掩盖）：线上食物库实际是 **9 条**（种子 8 条 + 用户自建 1 条「锅包肉」`user-95b1a7c46868`），
> 而本地内置库 `src/data/foods.ts` 有 **54 条**。前端现在走 `fetchFoods()`（API），所以线上只看到 9 条。
> 这是**数据同步缺口**，不是 Bug（抽卡、筛选、收藏全部照常工作），今天不做修补，见第五节后续计划。

### 2. 反馈交互 —— PASS

| 交互 | 在哪 | 当场怎么展示 |
|---|---|---|
| 收藏四态（未收藏 / 收藏中 / 已收藏 / 失败回滚） | `src/components/` 收藏按钮 + `App.tsx` `handleToggleFavorite` | 首页点星，断网再点一次看回滚 |
| 抽卡骰子动画 | `HomePage` 抽卡按钮（Day 24 加） | 首页点「换一个」，看骰子滚动 |
| 中文报错文案 | `src/services/api.ts` `translateError()` + UI 出口 `friendlyErrorMessage()`（Day 23） | 断网操作，看提示是中文人话不是 `undefined` |
| 删除二次确认 | `StarRating.tsx` 两条删除路径（Day 22） | 点「清除我的评分」弹 `window.confirm` |

### 3. 数据库读写 —— PASS

今天的真实请求（测试身份 `X-User-Id: day28-final-check`，食物 `f001`）：

```
PUT    /api/ratings/f001  {"score":4}   → HTTP 200  {"userId":"day28-final-check","foodId":"f001","score":4,
                                                     "updatedAt":"2026-10-16T12:59:16.174Z"}
GET    /api/ratings                     → HTTP 200  [{...同上...}]
GET    /api/ratings（隔 3 秒再取）       → HTTP 200  [{...同上...}]
DELETE /api/ratings/f001                → HTTP 204
GET    /api/ratings（复查）              → HTTP 200  []

POST   /api/favorites/f001              → HTTP 201  {"foodId":"f001"}
GET    /api/favorites                   → HTTP 200  ["f001"]
DELETE /api/favorites/f001              → HTTP 405  {"error":{"code":"METHOD_NOT_ALLOWED",
                                                     "message":"本接口只支持 GET 和 POST"}}
```

**【10-17 复核】#9 已修复上线，重跑同一组请求（契约升 v1.6）**

```
GET    /api/favorites                   → HTTP 200  ["f001"]
DELETE /api/favorites/f001              → HTTP 204            ← 删掉了
DELETE /api/favorites/f001（再删一次）   → HTTP 404  {"error":{"code":"NOT_FOUND",
                                                     "message":"无此收藏：f001"}}
GET    /api/favorites（复查）            → HTTP 200  []
```

- 4 张表：`foods` / `ratings` / `favorites` / `health_profiles`（PostgreSQL，Day 16 建表，结构契约 `db/schema.sql`）
- 12 个接口：总表见 `api-contract.md` 第五节，**【10-17 复核】已实现 9 个标了 ✅**
- **未实现的 3 个**：#10 `GET /api/health/profile`（被 `/api/health` 前缀路由吃掉，平台限制）、#11/#12 `PUT`/`DELETE /api/health/profile`，契约里状态列留空，不虚标

> ✅ **【10-17 复核】残留已清**：上面那条因为 #9 未实现而删不掉的测试数据（`day28-final-check` / `f001`），
> 在 #9 上线当天用 `DELETE /api/favorites/f001` 删掉了，复查 `GET /api/favorites` → `[]`。
> 库里现在没有这次验收留下的脏数据。

### 4. 前后端链路 —— 部分通过（唯一未满分项）

| 链路 | 结论 | 证据 |
|---|---|---|
| 食物列表 | ✅ 走云 | `HomePage.tsx:109` 调 `fetchFoods()` → `GET /api/foods` |
| 收藏 | ✅ 走云 | `App.tsx` `handleToggleFavorite` → `POST /api/favorites/:foodId` + App 启动时 `GET /api/favorites` 恢复 |
| **评分** | ❌ **没上云** | `src/services/api.ts` 全文搜 `ratings` 只有 2 行命中，且都是「自动带 `X-User-Id` 头」的逻辑，**没有任何 ratings 读写函数**；`src/services/storage.ts` 仍是 `localStorage.getItem/setItem/removeItem`；调用方 `StarRating.tsx`、`src/lib/rating.ts` 都在 import 它 |

- **后端是好的**：ratings 三个接口 Day 22 上线，今天实测 PUT/GET/DELETE 全通（见第 3 项）
- **前端没接线**：所以用户打分现在只存在自己浏览器里，换设备 / 清缓存就没了
- **今天不补**：改这条要动 `storage.ts` + `StarRating.tsx` + 跑构建 + 重新部署，属于新功能，按「今日不做影响验收的新功能」让路；已列入第五节后续计划第 1 条

### 5. 合法数据来源 —— PASS

- 表结构：`db/schema.sql`（唯一契约）
- 种子数据：`db/seed.sql`（foods 8 / ratings 7 / favorites 6 / health_profiles 5，可重复执行）
- 用户自建：线上那条「锅包肉」是测试时通过 `POST /api/foods` 正常创建的，`id` 由后端生成 `user-95b1a7c46868`
- **没有爬虫、没有第三方数据接口、没有未授权素材**：配图是 emoji（Day 5 决策 D2），文案自写
- ⚠️ 同步缺口同第 1 项：内置 54 条没进数据库

### 6. 公网地址 —— PASS

- 前端：<https://doyoueat-d5g36rg7ia785b553-1496350653.tcloudbaseapp.com/>
- API：<https://doyoueat-d5g36rg7ia785b553-1496350653.ap-shanghai.app.tcloudbase.com/api>（`/health` 可裸开验证）
- 一致性：本地构建产物 `index-DqbCk9z7.js` ＝ 线上主 JS 同名同字节（171412 字节），证明**线上跑的就是仓库里这份代码**

### 7. 线上持久化 —— PASS

- 证据即第 3 项那组请求：写入后隔 3 秒**新开一个请求**去取，数据还在
- 为什么这能证明落库：云函数无状态，进程内存留不住；能取回就是写进了 PostgreSQL
- 前端侧另有一条：收藏状态在 App 启动时由 `GET /api/favorites` 恢复（刷新页面后收藏不丢）

### 8. 回滚与备份说明 —— PASS

- 手册：`docs/rollback-manual.md`
  - 一、什么情况必须回滚（判断表）
  - 三、静态托管回退（**Day 26 已实操演练**：回滚 9 秒 / 恢复 8 秒，含人工约 3 分钟）
  - 四、云函数回退（备查，未实操 —— 如实标注）
- 备份与重建能力（不依赖云环境）：
  - 表结构 `db/schema.sql`、种子 `db/seed.sql`、云函数代码 `functions/`（4 个）、前端源码 + `dist/`，**全部在 Git 仓库里**
  - 版本锚点：tag `v1.0` 指向 `78f7403`，已推 GitHub

### 9. CloudBase 额度与到期风险 —— PASS

数据来源：`docs/day27-resource-check.md`（**2026-10-15 21:50 实测**，控制台套餐用量页；今天未重查，按 Day 28 计划选「引用 Day 27 数字」）。

| 项 | 数字 |
|---|---|
| 套餐 | 云开发免费体验版 |
| 到期日期 | **2027-03-26** |
| 已用 / 总额度 | **220.96 / 3000 点（7.4%）** |
| 大头 | PostgreSQL 212.04 点（96%，CU 核秒 + 容量 GB·时，**没人访问也扣**） |
| 消耗速率 | 约 11.6 点/天 → 剩余约 240 天用量 > 距到期 162 天，**够用到期** |

**风险（不粉饰）**：
1. 体验版**不支持自动续费**，也不支持买资源包 / 按量付费 → 到期即停；到期 7 天内未处理，第 8 天起释放资源、**数据清除不可恢复**
2. PostgreSQL 是持续计费，放着不动也在烧点数
3. `docs/day27-resource-check.md` 里「检查结论一句话」和「导出物清单（4 份 CSV）」两处**仍是空白占位，Day 27 没填完** —— 今天如实标注，**未执行**

### 10. 敏感文件 —— PASS

```
git ls-files | grep -iE '\.env|credential|secret|\.pem|id_rsa|serviceAccount|\.tcb-home'
→ 唯一命中：.env.example（内容只有 CLOUDBASE_API_KEY= 空占位 + 中文注释）

git grep -InE 'sk-[A-Za-z0-9]{20,}|AKID[A-Za-z0-9]{20,}' -- .
→ 0 条命中

.gitignore：第 2 行 .env ｜ 第 3 行 .env.* ｜ 第 4 行 !.env.example ｜ 第 42 行 .tcb-home/
```

- API Key 只存在两处：① 云函数环境变量（控制台配）② 本机 `.env`（不入库）
- 云函数代码读取方式：`process.env.CLOUDBASE_API_KEY`，无字面量（检查器 A2 项）
- 文档与截图一律不含密钥（Day 27 起立的规矩）

---

## 三、当场复现命令（验收官想自己验，复制这段）

```bash
cd "C:/Users/34199/Desktop/工作空间"

# 1) 自动检查器（26 项，约 30 秒，含构建）
bash scripts/verify.sh

# 2) 四条底线手工验（健康 / 列表 / 写入 / 持久化 / 清理）
API="https://doyoueat-d5g36rg7ia785b553-1496350653.ap-shanghai.app.tcloudbase.com/api"
U="day28-final-check"
curl -s -m 20 -w "\nHTTP=%{http_code}\n" "$API/health"
curl -s -m 20 -H "X-User-Id: $U" "$API/foods" | grep -o '"id"' | wc -l
curl -s -m 20 -w "\nHTTP=%{http_code}\n" -X PUT -H "X-User-Id: $U" -H "Content-Type: application/json" -d '{"score":4}' "$API/ratings/f001"
curl -s -m 20 -w "\nHTTP=%{http_code}\n" -H "X-User-Id: $U" "$API/ratings"
curl -s -m 20 -w "\nHTTP=%{http_code}\n" -X DELETE -H "X-User-Id: $U" "$API/ratings/f001"
```

> 网关偶发抖动（Day 26 实测约 1/6 请求会挂 20s+），单条请求偶发 `000` 属正常，**重试一次即可**；
> 若同一位置反复失败才是真 Bug。

---

## 四、交付截图指引（今天要交的两张图）

**图 1 —— 验收清单逐项打勾**：对着本文第一节总表，把 10 项的结论（PASS / 部分通过）在纸上或表格里逐项勾出来，截图要能看到**每一行的勾选状态**。

**图 2 —— 作品公网地址打开的样子**：浏览器打开 <https://doyoueat-d5g36rg7ia785b553-1496350653.tcloudbaseapp.com/>，整屏截图，**地址栏完整可见 + 作品主体完整可见**（建议首页抽卡状态那屏，最能说明这是个什么应用）。

两张图都不含密钥；控制台截图只留「套餐名 + 有效期 + 点数 + 用量」。

---

## 五、如实标注的未完成项（不阻塞结营，但都写在这）

| 项 | 状态 | 原因 / 处置 |
|---|---|---|
| 评分上云（前端接 ratings） | 未执行 | 属新功能，Day 28 让路验收；后端已就绪，接线是纯前端活 |
| ~~#9 `DELETE /api/favorites/:foodId`~~ | **✅ 已修复上线（10-17）** | 仓库层加 `deleteOne()` + 接口层加 DELETE 分支（204/404），前端零改动；契约升 v1.6 |
| #10 `GET /api/health/profile` | 被前缀路由吃掉 | 平台限制：`/api/health` 路由吞掉了子路径；绕开办法是改绑 `/api/profile` |
| #11 / #12 健康档案 PUT / DELETE | 未实现 | 契约状态列留空，未虚标 |
| 内置 54 条 vs 线上 9 条 | 未执行补种 | 不影响功能，抽卡筛选照常；补种只需把 54 条灌进 `foods` 表 |
| Day 27 资源文档两处占位 | 未填 | 「检查结论一句话」「4 份 CSV 导出清单」仍是 `[ ]` |
| ~~收藏表 1 条测试残留~~ | **✅ 已清（10-17）** | #9 上线后删掉了，复查 `GET /api/favorites` → `[]` |
| 余力加练（导出按钮 / 完成率 / 部署日志提醒） | 未执行 | 今日不做新功能，已并入后续计划 |

### 结营后迭代方向（课程到此为止，以下是自己往后做的）

| 方向 | 怎么做 | 为什么现在不做 |
|---|---|---|
| **接真实数据源**（教材附录 F 方向） | `db/seed.sql` 改成从公开菜谱数据源生成；`Food` 类型与 4 张表结构不动 | 契约已定型，换的是"数据从哪来"，不是"数据长什么样"；属功能扩张 |
| **加注册登录**（教材附录 D 方向） | 升级 `X-User-Id` → token 解析 userId；服务端建 users 表 | 匿名方案是 Day 16 明确拍板的「防蔓延」决策，12 个接口形状不变即可平滑升级 |
| **统计页（复用现有 GET + 前端图表）** | `GET /api/ratings` + `GET /api/favorites` 拉全量，前端画打分分布 / 餐段偏好 / 收藏 Top N | **零后端改动**，成本最低；但属新页面，Day 28 不做 |
| 评分上云 | `storage.ts` 从 localStorage 换成调 ratings 三个接口 | 后端早已就绪，纯接线活，留给结营后第一个做 |
