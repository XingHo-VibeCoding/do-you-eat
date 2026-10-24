# 交付说明（一页看完）— do you eat

> **用途**：结营交付的一张「地图」。公网地址、API 文档、数据库说明、部署清单四样原本散在
> 五个文件里，评审时来回翻不方便，所以整到这一页：**每段都给出结论 + 去哪看细节 + 怎么当场验证**。
>
> **整理日期**：2026-10-17（结营后）；**2026-10-24（Day 29）同步过一次**：AI 健康助手上线，
> 契约 v1.6 → **v1.7**（接口 12 → 16 个，表 4 → 5 张）。
> 文中所有「线上实测」数字都是当天跑出来的，不是抄旧文档。
> 按项目纪律「验收证据必须当日重测」，**过期请重跑 `bash scripts/verify.sh` 或本文第四节的命令**。
>
> ⚠️ **Day 29 起本页第四节之前的接口状态是「代码已部署、控制台三件事待办」**：
> 建 `daily_logs` 表 / 给 health 函数配 `CLOUDBASE_API_KEY` / 绑 `/api/assistant` 路由。
> 三件事清单见 [`docs/day29-ai-assistant.md`](./day29-ai-assistant.md) 第二节。

---

## 一、公网地址

| 对象 | 地址 | 当天实测 |
|---|---|---|
| **前端首页（静态托管）** | <https://doyoueat-d5g36rg7ia785b553-1496350653.tcloudbaseapp.com/> | 可访问，已渲染 |
| **API 基地址（主）** | `https://doyoueat-d5g36rg7ia785b553-1496350653.ap-shanghai.app.tcloudbase.com/api` | `GET /api/health` → `{"ok":true,"service":"do you eat"}` |
| **API 基地址（备）** | `https://doyoueat-d5g36rg7ia785b553-1496350653.service.tcloudbase.com/api` | 同域名双通道，两个都通 |
| **源码仓库** | <https://github.com/XingHo-VibeCoding/do-you-eat>（Public，分支 `main`） | `f7e6317` 已同步，`git log origin/main..HEAD` 为空 |
| **CloudBase 环境** | 环境 ID `doyoueat-d5g36rg7ia785b553`（上海） | 免费体验版，**2027-03-26 到期**，不支持自动续费 |
| **额度** | 套餐用量页：控制台 → 环境 → 套餐用量 | **220.96 / 3000 点**（2026-10-15 实测），日均约 11.6 点，按此速率够用到到期日 |

**当场验证（复制即跑，带重试防网关抖动）**

```bash
API="https://doyoueat-d5g36rg7ia785b553-1496350653.ap-shanghai.app.tcloudbase.com/api"
curl -s -m 15 "$API/health"                 # 期望：{"ok":true,"service":"do you eat"}
curl -s -m 15 "$API/foods" | grep -o '"id"' | wc -l   # 期望：9（种子 8 + 历史测试自建 1）
```

> 网关有约 1/6 概率单次请求挂 20s+（`curl -m 15` 会变 `000`）。**一次失败先重跑**，
> 固定位置反复失败才是真故障，位置漂移是网络问题。

---

## 二、API 文档

**唯一权威**：[`api-contract.md`](../api-contract.md)（**v1.7**，Day 29）。

| 章节 | 内容 |
|---|---|
| 〇、通用约定 | 基地址 / JSON 格式 / 统一错误体 `{"error":{code,message}}` / 匿名身份（`X-User-Id` 头）/ 命名风格 |
| 一～六、接口详述 | 16 个接口逐个：路径、参数、成功响应、错误响应、实现要点 |
| 七、接口总表 | **16 行状态表**——`scripts/verify.sh` 直接解析这一节的状态列做「契约 vs 实现」比对 |

### 16 个接口当前状态（截至 2026-10-24，Day 29）

| # | 方法 | 路径 | 状态 |
|---|---|---|---|
| 1 | GET | `/api/foods` | ✅ Day 17 |
| 2 | POST | `/api/foods` | ✅ Day 18 |
| 3 | DELETE | `/api/foods/:id` | ✅ Day 24 |
| 4 | GET | `/api/ratings` | ✅ Day 22 |
| 5 | PUT | `/api/ratings/:foodId` | ✅ Day 22 |
| 6 | DELETE | `/api/ratings/:foodId` | ✅ Day 22 |
| 7 | GET | `/api/favorites` | ✅ Day 17 |
| 8 | POST | `/api/favorites/:foodId` | ✅ Day 18 |
| 9 | DELETE | `/api/favorites/:foodId` | ✅ 结营后 10-17（**此前 405，是最后一个阻塞核心流程的缺口**） |
| 10 | GET | `/api/health/profile` | ✅ Day 29 |
| 11 | PUT | `/api/health/profile` | ✅ Day 29 |
| 12 | DELETE | `/api/health/profile` | ✅ Day 29 |
| 13 | GET | `/api/health/logs` | ✅ Day 29 |
| 14 | PUT | `/api/health/logs/:date` | ✅ Day 29（**字段级 upsert**，未提交的字段保留原值） |
| 15 | DELETE | `/api/health/logs/:date` | ✅ Day 29（删不到 → 404） |
| 16 | POST | `/api/assistant/chat` | ✅ Day 29（双引擎：有 `LLM_API_KEY` → 大模型，没有 → 规则引擎） |

外加 `GET /api/health`（健康检查，无表，已上线）。

> #10 曾长期被判定为「平台限制不可能实现」——`/api/health` 是**前缀路由**，
> `/api/health/profile` 会被健康检查分支吃掉。Day 29 的解法反而是顺水推舟：
> 既然子路径本来就进这个函数，就把档案和每日记录都实现在它里面，
> 用户一次控制台都不用跑。详见 `docs/day29-ai-assistant.md`。

### 云函数

| 函数 | 承担接口 | 运行时 | 代码位置 |
|---|---|---|---|
| `health` | `/api/health` + #10 #11 #12 #13 #14 #15 | Nodejs 20.19，Event 类型 | `functions/health/index.js` + `healthRepository.js` |
| `foods` | #1 #2 #3 | 同上 | `functions/foods/index.js` + `foodsRepository.js` |
| `favorites` | #7 #8 #9 | 同上 | `functions/favorites/index.js` + `favoritesRepository.js` |
| `ratings` | #4 #5 #6 | 同上 | `functions/ratings/index.js` + `ratingsRepository.js` |
| `assistant` | #16 | 同上，timeout 30s | `functions/assistant/index.js`（无仓库层，不碰库） |

分层：**接口层**（index.js：验参 / 方法白名单 / 状态码）→ **仓库层**（Repository：PostgREST 读写 / 错误包装）。
数据访问走 PostgREST `https://{envId}.api.tcloudbasegateway.com/v1/rdb/rest/{table}`
（共享集群不给 PG 直连地址），鉴权 `Authorization: Bearer <CLOUDBASE_API_KEY>`，**只在云函数环境变量里**。

> 路由绑定在控制台：HTTP 网关 → 路由管理 → 云函数 / 默认域名 / `/api/<函数名>` / 鉴权关。
> 网关会剥掉前缀：`/api/favorites/f001` 进到函数时 `event.path` 只剩 `/f001`。

---

## 三、数据库说明

**PostgreSQL（CloudBase「SQL 型数据库」）· 5 张表**，结构唯一契约 = [`db/schema.sql`](../db/schema.sql)（Day 29 起含 daily_logs）。

| 表 | 作用 | 主键 | 关键约束 | 对应接口 |
|---|---|---|---|---|
| `foods` | 食物库（全局共享） | `id` | `mealPeriod ∈ 早/午/晚/夜宵` | #1 #2 #3 |
| `ratings` | 用户评分 | `("userId","foodId")` 复合 | `score 1~5`；外键 → foods `ON DELETE CASCADE` | #4 #5 #6 |
| `favorites` | 收藏 | `("userId","foodId")` 复合 | 外键 → foods `ON DELETE CASCADE` | #7 #8 #9 |
| `health_profiles` | 健康档案 | `userId` | 身高 50~250 / 体重 10~300 / 年龄 1~150 | #10 #11 #12 |
| `daily_logs` | 每日健康记录（Day 29） | `("userId","date")` 复合 | 业务字段全部可空；体重 10~300 / 睡眠 0~24 / 饮水 0~10000 / 心情 1~5 | #13 #14 #15 |

> `daily_logs` 的 6 个业务字段**全部可空**是刻意的：用户可能早上只记体重、晚上才补饮食，
> 配合 #14 的字段级 upsert，早上的体重才不会被晚上的提交抹掉。
> 线上追加这张表用 [`db/migrate-add-daily-logs.sql`](../db/migrate-add-daily-logs.sql)
> （`CREATE TABLE IF NOT EXISTS`，不动现有表）。⚠️ **别直接跑 `schema.sql`**，那份开头会 DROP 全部 5 张表。

**三条必须知道的 PG 细节**

1. camelCase 列名**必须带双引号**（`"userId"` `"foodId"` `"updatedAt"`），否则会被折叠成全小写，前端类型就对不上。
2. 无 `TINYINT` / `UNSIGNED` → 用 `SMALLINT` + `CHECK`；`DECIMAL` 写 `NUMERIC`；JSON 用 `JSONB`。
3. 复合主键 = 业务上的「一人一菜只有一条」，也是重复收藏/重复评分幂等的基础。

**种子数据**：[`db/seed.sql`](../db/seed.sql)（105 行，可重复执行，开头先清空 4 表）。
foods 8 / ratings 7 / favorites 6 / health_profiles 5。
（`daily_logs` 是用户每天自己记的流水，**不设种子**——灌假数据会让用户的图表一上来就是别人的曲线。）

**数据来源（合法性）**：foods 全部取自 `src/data/foods.ts` 内置库，**id / 名字 / emoji / 描述 / 标签原样照抄，无任何爬取、无第三方接口**。

**已知数据缺口**：内置库 54 条，种子只灌了 8 条，加上历史测试自建 1 条（「锅包肉」），
**线上共 9 条**。前端走 `fetchFoods()` 拉接口，所以线上只看到 9 条。不是 Bug（抽卡、筛选都正常），是数据同步缺口，已列入后续计划。

**重建方式**：控制台 SQL 编辑器依次执行 `schema.sql` → `seed.sql`，任意遍结果一致。

---

## 四、部署清单

### 4.1 每次发版（静态托管）

```bash
bash scripts/verify.sh                     # 1. 全量检查，退出码必须 0（无 FAIL）
npm run build                              # 2. 产出 dist/
tcb hosting deploy dist -e doyoueat-d5g36rg7ia785b553   # 3. 部署
ls dist/assets/index-*.js                  # 4. 记下产物 hash，与线上 <script src> 比对（防 CDN 旧缓存）
```

沙箱内跑 CLI 需加前缀（否则读不到凭据）：

```bash
HOME="<工作区>/.tcb-home" USERPROFILE="<工作区>/.tcb-home" XDG_CONFIG_HOME="<工作区>/.tcb-home" \
  node.exe <tcb-cli>/bin/tcb hosting deploy dist -e doyoueat-d5g36rg7ia785b553
```

CLI 不在机器上时重装（实测 34 秒）：

```bash
cd C:\Users\34199\.workbuddy\binaries\node\workspace
node.exe C:\Users\34199\.workbuddy\binaries\node\versions\22.22.2\node_modules\npm\bin\npm-cli.js install @cloudbase/cli
# 可执行文件：C:\Users\34199\.workbuddy\binaries\node\workspace\node_modules\@cloudbase\cli\bin\tcb
```

### 4.2 云函数部署

```bash
tcb fn deploy <函数名> --force -e doyoueat-d5g36rg7ia785b553
```

- **更新已存在的函数不会丢环境变量**（2026-10-17 实测：部署 favorites 后 `GET /favorites` 立刻 200）。
  「新部署要单独配 API Key」只针对**新建**函数。
- 部署后**等 30 秒**再 curl 验证（新代码生效有延迟）。
- ⚠️ 别用 `fn deploy --httpFn --path`（会建成 Web 类型，公网报 `FUNCTIONS_PARAM_INVALID`）。

### 4.3 检查器基线

```
结营时（10-17）：PASS 26 / FAIL 0 / EXCEPTION 1（仅 #10 平台限制），exit 0
Day 29（10-24）：PASS 24 / FAIL 7 / EXCEPTION 0，exit 1 —— 正确阻断
```

Day 29 的 7 条 FAIL **全部指向用户待做的 3 件控制台操作**，不是代码缺陷：
#10–#15 报 `CLOUDBASE_API_KEY 未配置`（health 函数以前只做健康检查、从没配过 Key），
#16 报 `/api/assistant` 路由没绑。**三件事做完预期回到 PASS 31 / FAIL 0。**

五组：A 安全（密钥/凭据）、B 构建与部署（本地 build + 线上产物 hash 比对）、C 公网接口连通、
D 契约与实现一致（**实时解析 `api-contract.md` 第七节状态列**，防虚报）、E 架构纪律。
三态：**FAIL = 虚报，阻断发布**；EXCEPTION = 文档滞后或已知限制，只提醒。

### 4.4 回滚与备份

详见 [`docs/rollback-manual.md`](./rollback-manual.md)（含「什么情况必须回滚」判断表、静态托管回退命令、
云函数与数据回退备查、**2026-10-14 实测演练记录**：回滚 9s / 恢复 8s，含人工约 3 分钟）。

| 对象 | 备份 | 恢复 |
|---|---|---|
| 源代码 | `git push` + tag（远端即异地备份） | `git checkout v1.0` |
| 构建产物 | 不入 git，从 tag 重新 build | 同左 |
| 表结构与种子 | `db/schema.sql` + `db/seed.sql` 在仓库内 | 控制台执行 SQL |
| 线上业务数据 | 控制台导出 / PostgREST 全量拉 JSON（备查，暂未实操） | 按契约字段写回或 seed |

当前版本标记：**tag `v1.0`**（指向 `78f7403`，已推 GitHub）。

---

## 五、未完成项与后续（详见 `docs/day28-acceptance.md` / `day28-demo-outline.md`）

| 项 | 现状 | 性质 |
|---|---|---|
| 评分未上云 | 后端 #4/#5/#6 已上线且实测全通，**前端 `storage.ts` 仍走 localStorage** | 最大功能欠账，只差接线 |
| ~~#10 / #11 / #12 健康档案接口~~ | ✅ **Day 29 已实现**（前缀路由从障碍变成入口，见第二节注） | 已还清 |
| AI 大脑接真大模型 | 页面与接口已就绪，**双引擎**：没 `LLM_API_KEY` 走规则引擎（建议按真实数据算），配了 Key 才走大模型 | 可选，不接也能用 |
| 内置 54 条 vs 线上 9 条 | 种子只灌 8 条 | 数据同步缺口 |
| Day 27 资源文档两处占位 | 「检查结论一句话」「4 份 CSV 导出清单」仍是 `[ ]` | 文档未完成 |

结营后自己迭代的方向：接真实数据源、加注册登录、复用现有 GET 接口做统计页（前端图表）。

---

## 六、相关文档索引

| 文件 | 内容 |
|---|---|
| [`PRD.md`](../PRD.md) | 产品需求 v1.0（MVP 范围、13 条验收 A1-A8/B1-B2/C1-C3） |
| [`TECH_DESIGN.md`](../TECH_DESIGN.md) | 技术设计 v1.0（四层架构、技术选型与取舍） |
| [`api-contract.md`](../api-contract.md) | **接口契约 v1.7**（16 接口 / 5 表，施工唯一依据） |
| [`db/migrate-add-daily-logs.sql`](../db/migrate-add-daily-logs.sql) | 线上追加 `daily_logs` 表的增量脚本（只 CREATE，不 DROP） |
| [`RUNBOOK.md`](../RUNBOOK.md) | 日常操作手册（环境、命令、常见坑） |
| [`AGENTS.md`](../AGENTS.md) | 协作宪法（人机分工、提交纪律、当日收尾） |
| [`docs/release-checklist.md`](./release-checklist.md) | 发版操作手册（含发布记录） |
| [`docs/rollback-manual.md`](./rollback-manual.md) | 回滚与恢复 |
| [`docs/day29-ai-assistant.md`](./day29-ai-assistant.md) | **AI 健康助手**（Day 29 交付：做了什么 + 用户待办的 3 件控制台操作 + 验收 7 步） |
| [`docs/day28-acceptance.md`](./day28-acceptance.md) | **最终验收表**（10 项逐项结论 + 证据） |
| [`docs/day28-demo-outline.md`](./day28-demo-outline.md) | 4 分 40 秒演示提纲（六段） |
| [`docs/day28-retrospective.md`](./day28-retrospective.md) | 结营复盘 |
| [`docs/day27-resource-check.md`](./day27-resource-check.md) | 额度与到期风险 |
| [`docs/architecture.md`](./architecture.md) + `layered-architecture.svg` | 架构图 |
