# Day 29｜AI 健康助手（2026-10-24）

> 一句话：**页面、接口、云函数、契约全部写完了并已部署；还差 3 件只能在控制台做的事，做完就能用。**
> 这 3 件事清单在本文第二节，照着点约 5 分钟。

---

## 一、这次做了什么

### 1. 页面：`#/health` 整个换成 AI 健康助手

路由没变（已发布的地址不失效），导航文案从「健康档案」改成「AI 助手」，图标 🤖。
原来的档案表单**没删**，收进页面底部的「我的资料」折叠区（默认收起）。

页面骨架就是你描述的那样：

```
        [ 要收集今天的健康数据吗？ ]        [ 今天想吃什么？ ]
                    ＼                        ／
                         ( ◕  ‿  ◕ )        ← 中心表情：会呼吸、会眨眼，
                    ／                        ＼            状态会变脸
        [ 看看我的体重变化 → ]          [ 聊两句 ]
─────────────────────────────────────────────
   ┌──────────────── 卡片区（点谁开谁）────────────────┐
   │  记录表单 / 体重折线 / AI 回答                     │
   └────────────────────────────────────────────────┘
   [ 问我点什么…                              ] [发送]
─────────────────────────────────────────────
   ▸ 我的资料（身高 / 体重 / 年龄，默认收起）
```

点气泡**不跳页**，卡片在原地展开——这是个「随手记一下」的页面，跳走再回来成本太高。

### 2. 数据：新增 `daily_logs` 表（一人一天一条）

`(userId, date)` 复合主键，业务字段全部可空。
可空不是偷懒：用户可能早上只记体重、晚上才补饮食，接口 #14 做的是**字段级 upsert**
（请求体里出现的字段覆盖，没出现的保留原值），所以早上的体重不会被晚上的提交抹掉。

### 3. 后端：7 个接口，只有 1 个需要新建云函数

| # | 接口 | 落点 |
|---|---|---|
| 10–12 | 健康档案三接口 | **已有的 health 云函数** |
| 13–15 | 每日记录三接口 | **已有的 health 云函数** |
| 16 | `POST /api/assistant/chat` | 新建 assistant 云函数 |

为什么 6 个接口都塞进现成的 health 函数：当日实测确认 HTTP 网关的 `/api/health` 是
**前缀路由**——`GET /api/health/profile` 会打进 health 函数（返回 `{"ok":true}`）。
既然入口本来就在那，就别让用户去控制台多绑两条路由。

注：这三个接口此前在契约里挂了很久的欠账（档案一直存 localStorage），本次一并还清，
换设备资料也在。

### 4. AI：双引擎，没 Key 也能用

`assistant` 云函数读环境变量 `LLM_API_KEY`：

- **没配** → 走规则引擎，返回 `source: "rules"`。
  建议是按**真实数据算出来的**（真算了 7 天体重差、真比对了 1500ml 饮水线），不是随机鸡汤。
- **配了** → 走大模型，返回 `source: "llm"`，前端代码一行不改。
- 大模型调用失败 → 自动降级成规则引擎，**不把上游故障抛给用户**。

实测四种意图（规则引擎）：

| intent | 输入 | 输出 |
|---|---|---|
| trend | 4 天体重 68.5→66.9 | 这 4 次记录里轻了 1.6 kg，幅度有点大。别再往下压了，晚餐主食加回半碗。 |
| recommend | 4 道候选 + 175cm/68kg | 早餐就吃「清蒸鲈鱼」吧。按你的身高体重，BMI 约 22.2，配这个量刚好。 |
| log | 睡眠 6.5h / 饮水 1000ml | 睡了 6.5 小时，稍微有点少，今晚早半小时睡，饮水 1000 ml，还差 500 ml…记得把水补上。 |
| free | 任意提问 | 这个我得想清楚再答——现在还没接上大模型，只能按数据给建议。 |

> **口径红线**（写进了契约第八节和给大模型的 system prompt）：
> 只给饮食 / 作息的生活方式建议，**不做医疗诊断、不判断疾病、不推荐药物**。
> 用户问到症状时只回一句「这个得问医生，我只能聊聊吃和睡」。

### 5. 契约升 v1.7

接口从 12 个 → **16 个**，`api-contract.md` 是 `scripts/verify.sh` 判定真假的事实源，
所以先改契约再写代码。同时把总表从第五节挪到第七节（新增了每日记录、助手两节），
`verify.sh` 里读总表的正则跟着从「五」改成了「七」。

---

## 二、你需要做的 3 件事（约 5 分钟）

做完一件就告诉我一声，或者直接做完再叫我——我会跑 `bash scripts/verify.sh` 验收。

### ① 建 `daily_logs` 表

控制台 → SQL 型数据库 → SQL 编辑器 → 粘贴下面这段 → 执行：

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
  CONSTRAINT chk_log_weight CHECK ("weightKg"   IS NULL OR "weightKg"   BETWEEN 10 AND 300),
  CONSTRAINT chk_log_sleep  CHECK ("sleepHours" IS NULL OR "sleepHours" BETWEEN 0  AND 24),
  CONSTRAINT chk_log_water  CHECK ("waterMl"    IS NULL OR "waterMl"    BETWEEN 0  AND 10000),
  CONSTRAINT chk_log_mood   CHECK (mood         IS NULL OR mood         BETWEEN 1  AND 5)
);
```

（完整脚本在 `db/migrate-add-daily-logs.sql`，带验证语句。
⚠️ **别跑 `db/schema.sql`** —— 那份开头会 DROP 全部 5 张表。）

验证（**单独一条一条执行**——控制台 SQL 编辑器一次贴多条只显示最后一条）：

```sql
SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' ORDER BY table_name;
```

应列出 5 张：daily_logs / favorites / foods / health_profiles / ratings。

### ② 给 health 云函数配 `CLOUDBASE_API_KEY`

控制台 → 云函数 → **health** → 函数配置 → 环境变量 → 新增

```
CLOUDBASE_API_KEY = <从 foods / favorites / ratings 任意一个的环境变量里抄过来>
```

> 为什么现在缺：health 函数以前只做健康检查（不碰数据库），从来没配过这个 Key。
> Day 29 起它开始读写 health_profiles 和 daily_logs，就必须有。
> CLI 只能 `fn env pull`（拉），没有 push 命令，写入只能走控制台。

### ③ 绑 `/api/assistant` 路由

控制台 → HTTP 网关(或云函数 HTTP 访问服务) → 路由管理 → 新建：

| 项 | 值 |
|---|---|
| 云函数 | `assistant` |
| 域名 | 默认域名 |
| 路径 | `/api/assistant` |
| 鉴权 | 关 |

> CLI 的 `routes add` 对默认域名一律报禁建，这步必须在控制台点。
> 绑完等 30 秒再测（实测绑完立刻 curl 会短暂 404）。

---

## 三、可选的第 4 件事：接真大模型

不接也能用，页面完整可用。想接时：

控制台 → 云函数 → **assistant** → 函数配置 → 环境变量 → 新增

```
LLM_API_KEY  = sk-xxxx
LLM_BASE_URL = https://api.deepseek.com      # 可选，默认 DeepSeek
LLM_MODEL    = deepseek-chat                 # 可选
```

用的是 **OpenAI 兼容格式**，所以 DeepSeek / 通义（兼容模式）/ Kimi / 智谱 / 混元
都通吃，换供应商只改环境变量，代码不动。

三个提前说清的点：

1. **Key 只待在云函数环境变量里**，永远不进前端、不进 git（`scripts/verify.sh` 的 A1/A2
   会扫全仓库，硬编码会被抓出来阻断发布）。
2. **云函数出网不一定通**。共享集群的公网出口需要实测。我在 `assistant` 里留了
   `AbortSignal.timeout(20000)`：20 秒没响应就撤，降级回规则引擎，不会让用户干等 30 秒。
   想先探一下出网，可以在控制台用函数测试直接调一次。
3. **回答口径**：只聊吃和睡，不做医疗诊断——这条写进了 system prompt。

---

## 四、验收

我做完后已跑过 `bash scripts/verify.sh`，结果：

```
PASS 24 / FAIL 7 / EXCEPTION 0  →  阻断发布
```

7 条 FAIL 全部指向上面那 3 件没做的事（#10–#15 报 API Key 未配置，#16 报路由没绑）。
**检查器工作正常**——它没因为我写了代码就自动放行。

你做完 3 件事后，我再跑一次，预期：

| 检查项 | 预期 |
|---|---|
| D1 #10 / #11 / #12 | PASS（200 / 400 / 204） |
| D1 #13 / #14 / #15 | PASS（200 / 200 / 204） |
| D1 #16 | PASS（200 + `source: "rules"`） |
| 其余 20 项 | 保持 PASS |

### 手工验收（浏览器里点一遍）

打开 `https://doyoueat-d5g36rg7ia785b553-1496350653.tcloudbaseapp.com/#/health`

1. 中心表情会呼吸、会眨眼；四个气泡上下漂浮（相位错开）
2. 点「要收集今天的健康数据吗？」→ 填体重 67、睡眠 7.5、饮水 1200、心情点 4 → 记下来
   → 卡片里出现 AI 点评；表情变成「满足」
3. **再点一次记录气泡 → 只改饮水为 1800 → 记下来 → 体重和睡眠还在**（验证字段级 upsert）
4. 点「看看我的体重变化 →」→ 至少两天有体重才画得出折线
5. 点「今天想吃什么？」→ 给出一道菜 + 一句理由
6. 底部输入框问「晚上饿了吃什么不胖」→ 返回 200（规则引擎会给「还没接上大模型」的实话）
7. 展开「我的资料」→ 填 175 / 68 / 28 → 保存 → 刷新页面，资料还在

---

## 五、本次改动的文件

**新增**

- `src/pages/AssistantPage.tsx`（页面）
- `src/components/AssistantFace.tsx`（中心表情，SVG + CSS 动画）
- `src/components/WeightChart.tsx`（手写 SVG 折线图，不引图表库）
- `src/components/DailyLogForm.tsx`（每日记录表单）
- `src/components/ProfileCard.tsx`（资料折叠区）
- `src/types/health.ts`（DailyLog / HealthProfile / Assistant 请求响应类型）
- `src/lib/date.ts`（`todayKey()`，本地日历日）
- `functions/assistant/index.js` + `package.json`
- `functions/health/healthRepository.js`
- `db/migrate-add-daily-logs.sql`

**修改**

- `api-contract.md`（v1.6 → v1.7，接口 12 → 16 个）
- `db/schema.sql`（加 daily_logs，验证段改 5 张表）
- `functions/health/index.js`（三合一路由分派）
- `cloudbaserc.json`（health timeout 5→15s；新增 assistant 条目 timeout 30s）
- `scripts/verify.sh`（总表正则 五→七；加 #13–#16 探针；#10 陷阱升级为 FAIL）
- `src/services/api.ts`（档案 / 记录 / 助手共 7 个函数）
- `src/lib/constants.ts`（助手页全部文案）
- `src/styles/app.css`（助手页样式，含 `prefers-reduced-motion` 降级）
- `src/App.tsx`、`src/components/AppNav.tsx`（路由指向新页面）

**删除**

- `src/pages/HealthPage.tsx`（功能已并入新页面）
- `src/services/healthStorage.ts`（档案上云，localStorage 版作废）

---

## 六、明确没做（防蔓延）

- **AI 不流式输出**（SSE 在 CloudBase Event 函数上要做分块编码，复杂度远超收益）；
- **AI 不做医疗诊断**（见前面口径红线）；
- **记录只增不改字段**：#14 是 upsert，没法把某个字段单独清空（想改就覆盖新值，
  想清就删掉当天）。这是刻意的——清空语义会让「没填」和「填了空」分不清。
