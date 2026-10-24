# Day 29｜AI 健康助手（2026-10-24）

> 一句话：**AI 健康助手已全量上线，并在当晚接上了真大模型（DeepSeek）。**
> 页面、契约、云函数、数据库、路由全部就位，
> `bash scripts/verify.sh` = **PASS 32 / FAIL 0 / EXCEPTION 0**，可以发布。
>
> 3 件只能在控制台做的事（建表 / 配 Key / 绑路由）本日全部完成，清单仍保留在第二节——
> 换环境重新部署时照着做一遍即可。第 4 件事（接真大模型）也在当晚做完，见第三节。

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

## 二、换环境时的 3 件事（约 5 分钟）

本日已全部完成 ✅，全程逐件实测后才放行。清单保留下来，将来在新环境重部署时照做。

### ① 建 `daily_logs` 表 ✅

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

### ② 给 health 云函数配 `CLOUDBASE_API_KEY` ✅

**两条路，任选其一：**

**路线 A（控制台，最稳妥）**
控制台 → 云函数 → **health** → 函数配置 → 环境变量 → 新增：

```
CLOUDBASE_API_KEY = <从 foods / favorites / ratings 任意一个的环境变量里抄过来>
```

**路线 B（CLI 直写，本次实际采用）**
`tcb fn env` 只有 `pull`（须带 `--output-file`）没有 push，但 **`tcb fn deploy` 会应用
`cloudbaserc.json` 里的 `functions[].envVariables`** —— 这是写入环境变量的隐藏通道：

```bash
# 1. 从已有函数导出原文（不经过手抄）
tcb fn env pull foods --output-file /tmp/foods-env.json -e <envId>
# 2. 备份配置，python 把 Key 原文写进 health 的 envVariables（值不进 stdout）
cp cloudbaserc.json /tmp/cloudbaserc.json.bak
# 3. 部署（CLI 会应用 envVariables），trap 保证无论如何都恢复配置
trap 'cp /tmp/cloudbaserc.json.bak cloudbaserc.json' EXIT
tcb fn deploy health --force -e <envId>
# 4. 收尾：git status 必须干净 + 删掉含 Key 的临时文件
```

> **为什么推荐直写**：CLOUDBASE_API_KEY 是一串 900+ 字符的 JWT。本次先走控制台手粘，
> 结果粘成了 915 字符（原文 916，第 418 位掉了 1 个字符）→ base64 分组错位 → 签名失效，
> 报 `API Key 无效或未授权`。**注意不是「未配置」——这个区分一秒定位是「值坏了」而非「没配」。**
> 凡是要转移长随机串，一律走文件搬运或控制台自带复制按钮，**绝不经过「AI 输出 → 人复制 → 粘贴」。**

> 为什么现在缺：health 函数以前只做健康检查（不碰数据库），从来没配过这个 Key。
> Day 29 起它开始读写 health_profiles 和 daily_logs，就必须有。

### ③ 绑 `/api/assistant` 路由 ✅

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

## 三、接真大模型：DeepSeek 当晚就接上了 ✅

### 怎么接的（只填了一格）

控制台 → 云函数 → **assistant** → 函数配置 → 环境变量 → 新增

```
LLM_API_KEY = sk-xxxx    # 用 DeepSeek 平台的复制按钮，不外传
```

`LLM_BASE_URL` / `LLM_MODEL` **没配**——代码默认值就是 DeepSeek
（`https://api.deepseek.com` / `deepseek-chat`），选它就省两步。
换供应商时才需要它们（OpenAI 兼容格式，DeepSeek / 通义兼容模式 / Kimi / 智谱 / 混元通吃）。

**云函数出网是通的**，实测直接就调通了，没卡在这一步。

### 接上前后：同一批请求、同一份代码，只多了一个环境变量

| 请求 | 配 Key 前（当天上午） | 配 Key 后（当晚） |
|---|---|---|
| trend 三天 68.3→67.2 | 「轻了 1.1 kg，节奏还行。继续按现在的吃法就好。」`rules` | 「三天掉了 1.1 公斤，有点快哦。别急着继续减，先把三餐吃够、水喝足，晚上睡够 7 小时稳住。」`llm` |
| log 今天喝了 800ml | 「体重 67.2 kg 记下了，睡了 7.5 小时，够的，饮水 800 ml……」`rules` | 「今天水喝得太少了，才 800 毫升，先争取喝到 1500 毫升以上吧。」`llm` |
| recommend 四个菜 | 「午餐就吃「番茄炒蛋」吧。按你的身高体重，BMI 约 22.2，配这个量刚好。」`rules` | 「清蒸鲈鱼，蛋白足脂肪低，配碗杂粮饭刚好。」`llm` |

这段对照有两层意思：

1. **开关真生效**——不是我以为生效，是同一个接口吐出来的字不一样了。
2. **反过来看就是降级证明**：Key 一撤，它安静退回规则引擎，页面不会变废页。
   早上那三句 `rules` 就是「没有 Key」状态下的实测，不是推理。

### 医疗红线：接了真 AI 之后，这条更要实测

模型越强，越容易自作主张。拿一句典型问题去试：

| 问 | 答 |
|---|---|
| 「我最近头特别疼，是不是脑子里长东西了？要不要吃点什么药」 | 「这个得问医生，我只能聊聊吃和睡。头痛时先保证喝够水，每天 1500 到 1700 毫升，别空腹，三餐规律，睡够 7 到 8 小时。」 |

挡住了，而且**挡完接着给饮食作息建议**，不是干巴巴甩一句免责声明。

### 顺手修的一处：红线写得过强，把好问题也挡回去了

第一版 prompt 里写的是「用户问到症状或疾病时，只回一句『这个得问医生』」。
结果模型**过度保守**——问「晚餐想吃清淡点，给个建议」也被挡回那句话：

```
改前：「晚餐想吃清淡点，给个建议」
  → 「这个得问医生，我只能聊聊吃和睡。平时多喝温水，饭菜清淡点，别熬夜。」   ← 明明是好问题
改后：同一次提问
  → 「蒸个鱼或者白灼虾，配一份烫青菜，主食半碗杂粮饭，少油少盐就很清爽。」
```

改法不是把红线拿掉，而是**从无条件声明改成条件触发**，并点名哪些情况不许说：

```
只有当用户的提问里真的出现了身体症状、疾病或药物时，才先说一句「这个得问医生，我只能聊聊吃和睡」，
然后接着给饮食作息建议。用户只是问吃什么、睡不好、喝水少、体重变化时，不要说那句话，直接回答。
```

改完立刻回归测了两边：好问题给具体建议 ✅、医疗问题仍被挡回 ✅。

> 改代码要重新 `fn deploy`。动手前先 `fn env pull assistant` 备一份环境变量，
> 部署完再 pull 一次比对——**万一 deploy 把控制台配的 Key 冲掉，手上有原文能立刻补回去**。
> 本次实测：deploy 前后都是「1 个环境变量 / 48 字节」，Key 没丢。

### 检查器跟着升级：多一条 C5

`scripts/verify.sh` 原本对 #16 只验 HTTP 200。而**「Key 被删」「余额用完」「云函数出不了网」
这三种情况全都返回 200**——不查 `source`，「AI 其实一直在说模板句」会一直伪装成通过。
所以加了一条：

```
C5 #16 走大模型引擎（source=llm）
证据: {"reply":"蒸个鱼或者白灼虾，配一份烫青菜……","source":"llm"}
```

留了 1 次重试：大模型偶发超时（20s 撤）会退回 `rules`，单次会把好环境误判成没接上。

同时给 `http()` 加了超时参数（默认 15s）：#16 和 C5 传 45s。
接了大模型之后一次回答 5–15s 很正常，沿用 15s 会把「还在想」误判成「没响应 000」。

### 成本

`max_tokens: 200`、`temperature: 0.7`，一次回答几百 token。按 DeepSeek 刊价估算，
**充值 10 元自用足够几千次**，以控制台账单为准。真要用完了会先降级到规则引擎（页面照常能用），
不会直接报错。

---

## 四、验收

### 写代码那天的基线

```
PASS 24 / FAIL 7 / EXCEPTION 0  →  阻断发布
```

7 条 FAIL 全部指向那 3 件没做的事（#10–#15 报 API Key 未配置，#16 报路由没绑）。
**检查器工作正常**——它没因为我写了代码就自动放行。

### 三件事做完后的实际结果（2026-10-24 收尾实测）

```
bash scripts/verify.sh
── A 安全 4/4  B 构建与部署 3/3  C 连通 4/4  D 契约一致 17/17  E 架构纪律 3/3
结果：PASS 31 / FAIL 0 / EXCEPTION 0
无 FAIL，可以发布
```

逐个接口实测（非只看状态码）：

| # | 调用 | 实测 |
|---|---|---|
| 10 | GET /health/profile | 200 `null` — **没被前缀路由吃掉** |
| 11 | PUT /health/profile | 200 落库，`updatedAt` 后端时钟 |
| 12 | DELETE /health/profile | 204 |
| 13 | GET /health/logs?days=30 | 200 **闭环验证过**（写今天的 → 读到 → 删掉） |
| 14 | PUT /health/logs/:date | 200 只补 sleepHours 时 weightKg 保留 — **字段级 upsert 成立** |
| 15 | DELETE /health/logs/:date | 204；再删一次 → 404 无此记录 |
| 16 | POST /api/assistant/chat | 200 + `{"reply":"...","source":"rules"}` |

### 端到端实链（一个用户从建档到拿到 AI 建议，走完整条链路）

用临时用户 `e2e-day29-*` 真跑一遍，**测完当场清空**：

| 步 | 动作 | 实测结果 |
|---|---|---|
| 1 | PUT /health/profile 175 / 68 / 28 | 200，落库，`updatedAt` 后端时钟 |
| 2 | 记三天体重 68.3 → 67.8 → 67.2 | 200 ×3 |
| 3 | 今天**只改饮水** 1800 | 200，返回体里 `weightKg:67.2 / sleepHours:7.5` **全在** → 字段级 upsert 成立 |
| 4 | GET /health/logs?days=30 | 200，三条按日期升序返回 |
| 5 | AI 意图 `trend` | 「轻了 1.1 kg，节奏还行。继续按现在的吃法就好。」 |
| 6 | AI 意图 `log` | 「体重 67.2 kg 记下了，睡了 7.5 小时，够的，饮水 1800 ml，达标，心情不错。」 |
| 7 | AI 意图 `recommend`（4 个中文菜名） | 「午餐就吃「番茄炒蛋」吧。按你的身高体重，BMI 约 22.2，配这个量刚好。」 |
| 8 | 清空 3 条记录 + 档案 | 204 ×4；复查 `logs` → `[]`、`profile` → `null` |

三条 AI 回复都是**按真实数据算出来的**（1.1 kg 是真的三点数相减、BMI 22.2 是真的 68/1.75²、
「午餐」是按东八区判的时段），不是模板句。

> #13 那行值得单独说：它一开始就返回 `[]` 且是 200。2020 年的探针记录被 `days=30`
> 过滤掉是合理的，但也可能是接口**永远返回空数组**。所以我用**今天的日期**写一条真数据，
> 再读必须看到它，再删掉——看到 `[{date:"2026-10-24",...}]` 才算通过。
> **只看 HTTP 200 会被「永远返回空数组」的接口骗过去。**

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
- `functions/assistant/index.js`（当晚：system prompt 的医疗红线从无条件改为条件触发）
- `cloudbaserc.json`（health timeout 5→15s；新增 assistant 条目 timeout 30s）
- `scripts/verify.sh`（总表正则 五→七；加 #13–#16 探针；#10 陷阱升级为 FAIL；
  当晚接真 AI 后追加：`http()` 增加超时参数、#16 探针用 45s、新增 C5 查 `source=llm`）
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
