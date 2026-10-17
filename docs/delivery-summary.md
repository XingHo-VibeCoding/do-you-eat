# 交付说明（一页看完）— do you eat

> **用途**：结营交付的一张「地图」。公网地址、API 文档、数据库说明、部署清单四样原本散在
> 五个文件里，评审时来回翻不方便，所以整到这一页：**每段都给出结论 + 去哪看细节 + 怎么当场验证**。
>
> **整理日期**：2026-10-17（结营后）。文中所有「线上实测」数字都是当天跑出来的，不是抄旧文档。
> 按项目纪律「验收证据必须当日重测」，**过期请重跑 `bash scripts/verify.sh` 或本文第四节的命令**。

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

**唯一权威**：[`api-contract.md`](../api-contract.md)（**v1.6**，382 行）。

| 章节 | 内容 |
|---|---|
| 〇、通用约定 | 基地址 / JSON 格式 / 统一错误体 `{"error":{code,message}}` / 匿名身份（`X-User-Id` 头）/ 命名风格 |
| 一～四、接口详述 | 12 个接口逐个：路径、参数、成功响应、错误响应、实现要点 |
| 五、接口总表 | **12 行状态表**——`scripts/verify.sh` 直接解析这一节的状态列做「契约 vs 实现」比对 |

### 12 个接口当前状态（截至 2026-10-17）

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
| 10 | GET | `/api/health/profile` | ❌ 未实现（被 `/api/health` 前缀路由吃掉，**平台限制**） |
| 11 | PUT | `/api/health/profile` | ❌ 未实现 |
| 12 | DELETE | `/api/health/profile` | ❌ 未实现 |

外加 `GET /api/health`（健康检查，无表，已上线）。

### 云函数

| 函数 | 承担接口 | 运行时 | 代码位置 |
|---|---|---|---|
| `health` | `/api/health` | Nodejs 20.19，Event 类型 | `functions/health/index.js` |
| `foods` | #1 #2 #3 | 同上 | `functions/foods/index.js` + `foodsRepository.js` |
| `favorites` | #7 #8 #9 | 同上 | `functions/favorites/index.js` + `favoritesRepository.js` |
| `ratings` | #4 #5 #6 | 同上 | `functions/ratings/index.js` + `ratingsRepository.js` |

分层：**接口层**（index.js：验参 / 方法白名单 / 状态码）→ **仓库层**（Repository：PostgREST 读写 / 错误包装）。
数据访问走 PostgREST `https://{envId}.api.tcloudbasegateway.com/v1/rdb/rest/{table}`
（共享集群不给 PG 直连地址），鉴权 `Authorization: Bearer <CLOUDBASE_API_KEY>`，**只在云函数环境变量里**。

> 路由绑定在控制台：HTTP 网关 → 路由管理 → 云函数 / 默认域名 / `/api/<函数名>` / 鉴权关。
> 网关会剥掉前缀：`/api/favorites/f001` 进到函数时 `event.path` 只剩 `/f001`。

---

## 三、数据库说明

**PostgreSQL（CloudBase「SQL 型数据库」）· 4 张表**，结构唯一契约 = [`db/schema.sql`](../db/schema.sql)（79 行，可重复执行）。

| 表 | 作用 | 主键 | 关键约束 | 对应接口 |
|---|---|---|---|---|
| `foods` | 食物库（全局共享） | `id` | `mealPeriod ∈ 早/午/晚/夜宵` | #1 #2 #3 |
| `ratings` | 用户评分 | `("userId","foodId")` 复合 | `score 1~5`；外键 → foods `ON DELETE CASCADE` | #4 #5 #6 |
| `favorites` | 收藏 | `("userId","foodId")` 复合 | 外键 → foods `ON DELETE CASCADE` | #7 #8 #9 |
| `health_profiles` | 健康档案 | `userId` | 身高 50~250 / 体重 10~300 / 年龄 1~150 | #10 #11 #12（未实现） |

**三条必须知道的 PG 细节**

1. camelCase 列名**必须带双引号**（`"userId"` `"foodId"` `"updatedAt"`），否则会被折叠成全小写，前端类型就对不上。
2. 无 `TINYINT` / `UNSIGNED` → 用 `SMALLINT` + `CHECK`；`DECIMAL` 写 `NUMERIC`；JSON 用 `JSONB`。
3. 复合主键 = 业务上的「一人一菜只有一条」，也是重复收藏/重复评分幂等的基础。

**种子数据**：[`db/seed.sql`](../db/seed.sql)（105 行，可重复执行，开头先清空 4 表）。
foods 8 / ratings 7 / favorites 6 / health_profiles 5。

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
bash scripts/verify.sh   →   PASS 26 / FAIL 0 / EXCEPTION 1（仅 #10 平台限制），exit 0
```

五组：A 安全（密钥/凭据）、B 构建与部署（本地 build + 线上产物 hash 比对）、C 公网接口连通、
D 契约与实现一致（**实时解析 `api-contract.md` 第五节状态列**，防虚报）、E 架构纪律。
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
| #10 / #11 / #12 健康档案接口 | 未实现（#10 另有平台限制：前缀路由冲突） | 已如实标注，不阻塞结营 |
| 内置 54 条 vs 线上 9 条 | 种子只灌 8 条 | 数据同步缺口 |
| Day 27 资源文档两处占位 | 「检查结论一句话」「4 份 CSV 导出清单」仍是 `[ ]` | 文档未完成 |

结营后自己迭代的方向：接真实数据源、加注册登录、复用现有 GET 接口做统计页（前端图表）。

---

## 六、相关文档索引

| 文件 | 内容 |
|---|---|
| [`PRD.md`](../PRD.md) | 产品需求 v1.0（MVP 范围、13 条验收 A1-A8/B1-B2/C1-C3） |
| [`TECH_DESIGN.md`](../TECH_DESIGN.md) | 技术设计 v1.0（四层架构、技术选型与取舍） |
| [`api-contract.md`](../api-contract.md) | **接口契约 v1.6**（12 接口 / 4 表，施工唯一依据） |
| [`RUNBOOK.md`](../RUNBOOK.md) | 日常操作手册（环境、命令、常见坑） |
| [`AGENTS.md`](../AGENTS.md) | 协作宪法（人机分工、提交纪律、当日收尾） |
| [`docs/release-checklist.md`](./release-checklist.md) | 发版操作手册（含发布记录） |
| [`docs/rollback-manual.md`](./rollback-manual.md) | 回滚与恢复 |
| [`docs/day28-acceptance.md`](./day28-acceptance.md) | **最终验收表**（10 项逐项结论 + 证据） |
| [`docs/day28-demo-outline.md`](./day28-demo-outline.md) | 4 分 40 秒演示提纲（六段） |
| [`docs/day28-retrospective.md`](./day28-retrospective.md) | 结营复盘 |
| [`docs/day27-resource-check.md`](./day27-resource-check.md) | 额度与到期风险 |
| [`docs/architecture.md`](./architecture.md) + `layered-architecture.svg` | 架构图 |
