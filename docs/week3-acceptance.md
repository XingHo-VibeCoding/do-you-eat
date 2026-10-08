# 第 3 周验收表（Day 15–20）·「do you eat」后端周

> 验收日期：2026-10-08（Day 21）
> 验收范围：Day 15–20 后端板块全部产出。
> 验收方法说明：**每一项都是当日（Day 21）重新实测**，不引用历史口头结论；
> 线上接口用 curl 直接打公网地址，代码结构用文件检查 + git 提交记录佐证。
> 结论只有三种：**PASS / FAIL / 未执行**，不用模糊表述。

---

## 一、逐项验收

| # | 验收项 | 验证方法 | 结果 | 证据 |
|---|---|---|---|---|
| 1 | schema / seed 脚本（Day 16） | 文件存在；Day 16 已实测可重复执行；线上接口返回 seed 真实数据（证明 4 表已落库） | **PASS** | `db/schema.sql`、`db/seed.sql`；提交 `37e4e3c`；下方证据 A |
| 2 | GET 公网接口 #1 #7（Day 17） | curl 打公网地址，看 HTTP 状态码 + 返回体 | **PASS** | `/api/health` 200、`/api/foods` 200 返回 8 条真实数据、`/api/favorites` 200 返回 `[]`；提交 `7dc4e7c`；证据 B |
| 3 | POST 公网接口 #2 #8（Day 18） | 真实写入：POST 收藏 → 重新 GET 确认持久化；POST foods 走校验分支看 400 | **PASS** | 收藏写入 201 + 重读返回 `["f001"]`；foods 缺 name 返回 400 `BAD_REQUEST`；提交 `f0713af`；证据 C |
| 4 | 分层重构（Day 19） | 检查 repository 文件存在；全文搜索确认 PostgREST 调用只在 repository 层、`index.js` 无数据库直连 | **PASS** | `functions/foods/foodsRepository.js`、`functions/favorites/favoritesRepository.js` 存在；`tcloudbasegateway` 仅出现在这两个文件；提交 `cf07ef9` + `f19874b`；证据 D |
| 5 | 公网检查台 URL（前端 + API） | curl 打前端托管域名和 API 基地址，看 HTTP 状态码 | **PASS** | 前端 `https://doyoueat-d5g36rg7ia785b553-1496350653.tcloudbaseapp.com/` 返回 200；API 双域名（`ap-shanghai.app.tcloudbase.com` / `service.tcloudbase.com`）均通；证据 E |
| 6 | api-contract.md 完整性 | 逐节核对：12 接口定义、4 表结构、错误形状、总表状态列与实际实现是否同步 | **FAIL** | 契约 v1.2 内容本身完整（12 接口 + 表结构 + 附录字段对照齐全），**但总表状态列滞后**：#2 #8 已于 Day 18 上线，状态列未标 ✅（v1.2 停在 Day 17 未随 Day 18 更新）。缺陷明确、可修复，**不顺手修，记录到下周**（见第四节） |

---

## 二、证据明细（当日 curl 原始输出）

### 证据 A：表已落库（配合 schema/seed）

`GET /api/foods` 返回 seed 里的真实数据（第 1 条）：

```
[{"id":"f001","name":"豆浆油条","emoji":"🥛","description":"黄金搭档，趁热咬一口就是宿舍的早晨",
  "mealPeriod":"breakfast","spicy":false,"tags":["咸口","传统"],"cuisine":"鲁"}, …]
```

foods / ratings / favorites / health_profiles 四表的 DDL 见 `db/schema.sql`（提交 `37e4e3c`），
favorites 的读写闭环（证据 C）同时证明 favorites 表健在。

### 证据 B：GET 接口（Day 21 实测）

```
$ curl https://…/api/health
{"ok":true,"service":"do you eat"}          HTTP 200

$ curl https://…/api/foods
[{"id":"f001","name":"豆浆油条",…}, …]       HTTP 200（8 条真实数据）

$ curl -H "X-User-Id: day21-check" https://…/api/favorites
[]                                          HTTP 200（未收藏返回空数组，符合契约 #7）
```

### 证据 C：POST 真实写入 + 持久化（Day 21 实测）

```
$ curl -X POST -H "X-User-Id: day21-check" https://…/api/favorites/f001
{"foodId":"f001"}                           HTTP 201（真实写入库）

$ curl -H "X-User-Id: day21-check" https://…/api/favorites
["f001"]                                    HTTP 200（重新读取，数据还在 → 持久化成立）

$ curl -X POST -d '{"description":"故意缺name触发400"}' https://…/api/foods
{"error":{"code":"BAD_REQUEST","message":"name 不能为空"}}   HTTP 400（校验分支正确）
```

> 说明：POST foods 的成功路径 Day 18 已实测（提交 `f0713af`，中文 409 防重均过）；
> Day 21 为避免往生产库塞测试菜，只复测了校验分支。真实写入的证据由 favorites 担纲。

### 证据 D：分层重构（代码检查，Day 21 实测）

- `functions/foods/` = `index.js`（接口层）+ `foodsRepository.js`（数据库层）
- `functions/favorites/` = `index.js` + `favoritesRepository.js`
- `functions/health/` = `index.js`（无数据库操作，不拆 repository，合理）
- 全文搜索 `tcloudbasegateway`：**只命中 2 个 repository 文件**，任何 `index.js` 里都没有数据库直连 —— 分层约束真实成立。

### 证据 E：公网检查台 URL（Day 21 实测）

```
前端托管  https://doyoueat-d5g36rg7ia785b553-1496350653.tcloudbaseapp.com/   → HTTP 200
API 基地址 https://doyoueat-d5g36rg7ia785b553-1496350653.ap-shanghai.app.tcloudbase.com/api   → 通（见证据 B/C）
```

---

## 三、同伴交叉验证（三行结论原样存档）

> 由未参与开发的同伴按固定步骤操作（打开网站 → 收藏一道菜 → 刷新页面看收藏是否还在），
> 结论**原样存档，一字不改**。

```
验证人：李国旭
验证时间：10月8日
1. 能否打开：能 / 不能 —— 首页是否正常显示出食物内容  能
2. 能否真实读写：能 / 不能 —— 我收藏了「蛋炒饭」，刷新后收藏 还在
3. 有无报错：无
```

**交叉验证结论**：三行全过 —— 公网可访问 ✅、真实读写 + 刷新持久化 ✅、无报错 ✅。
与第一节第 2、3、5 项（GET/POST 接口、公网检查台）的自测结果相互印证：
自测是命令级证据（curl + 状态码），同伴验证是真人浏览器级证据，两层互相咬合。

---

## 四、缺项清单（如实标记，未做就是未做）

| 缺项 | 状态 | 说明 |
|---|---|---|
| 契约接口 #3 #9（DELETE foods / DELETE favorites） | **未实现** | Day 18 优先做了 POST；删除接口留待后续 |
| 契约接口 #4 #5 #6（ratings 读写） | **未实现** | 评分上云未动工 |
| 契约接口 #10 #11 #12（health_profiles 读写） | **未实现** | 健康档案上云未动工 |
| 契约 #1 的全量数据：库里仅 seed 8 条 | **未完成** | 内置库 54 条未全部入库（契约已自我标注「见待办」），前端因此部分页面仍受影响 |
| api-contract.md 总表状态列 | **FAIL** | #2 #8 已上线未标 ✅（本表第 6 项），Day 18 后契约未升版 |
| 云函数日志 | **未执行** | CLI `fn log` 报「topic not exist」（CLS 主题未开通），调试只能靠响应体回显 |
| Day 14 遗留（属第 2 周，跨周跟踪） | **未修复** | 配图栏文案、骰子动画 |

> 以上缺项**今天一个都不修**（今日不做与验收无关的修复），全部记录在案，处理优先级由下周计划决定。

---

## 五、本周复盘（一句话）

第 3 周最花时间的是 Day 15–17 与 CloudBase 平台的搏斗（函数类型建错、路由绑定被禁、共享集群不给 PG 地址逼出 PostgREST 方案）。
**值**：这些坑填平后，Day 18–20 每天都是纯增量产出，本周验收 5 项 PASS 的证据全部建立在那几天的地基上。

---

*生成：Day 21 · 2026-10-08 · 证据均为当日公网实测原始输出*
