---
name: verify-project
description: |
  触发场景：do you eat 项目「上线 / 部署 / 发群里 / 交作业」之前，或修完 Bug、加完功能要做回归自检时。
  用途：跑一遍 15 项固定检查（安全 / 构建部署 / 公网接口 / 契约一致 / 架构纪律），逐项给 PASS / FAIL / EXCEPTION + 证据；任一 FAIL 阻断发布。
---

# Verify Project（do you eat 发布前检查）

> 本 Skill 把项目前十几天踩过的**真实坑**，固化成一份「不虚报」的发布前检查清单。
> 一条命令跑全部：`bash scripts/verify.sh`；工具不支持 Skill 时，也直接跑这条命令（脚本是唯一事实来源）。

---

## 1. 适用与不适用

**适用**
- 每次「上线 / 部署 / 发群里 / 交作业」之前，确认线上没坏、本地没漏、安全无泄漏、契约没撒谎。
- 修完 Bug 或加完功能后的回归自检 —— 尤其动过云函数、接口、`.gitignore`、环境变量时。

**不适用（今日边界）**
- 它**不是**自动化流水线：不接 CI、不挂 git hook、不自动部署。
- 它只做「只读检查 + 一次 `npm run build`」，跑完给你一张 PASS/FAIL 表，**由你决定发不发**。

---

## 2. 怎么跑

```bash
# 在仓库根目录
bash scripts/verify.sh
```

| 行为 | 说明 |
|---|---|
| 退出码 `0` | 无 FAIL，可以发 |
| 退出码 `≠0` | 有 FAIL，先修再发 |
| `SKIP_BUILD=1 bash scripts/verify.sh` | 跳过 `npm run build`（B1 记 EXCEPTION），快速过其余项 |
| `API_BASE=... SITE=... bash scripts/verify.sh` | 临时换环境 / 域名（默认用线上正式地址） |

---

## 3. 检查项（15 项 / 5 组）与通过标准

| 组 | # | 检查项 | 做法 | 通过标准 |
|---|---|---|---|---|
| **A 安全** | A1 | 全仓库无硬编码密钥 | `git grep` 扫 `src/ functions/ db/` 与根配置，匹配 `sk-…` / `AKID…` / `Bearer …` / `postgres://` | 0 条命中 |
| | A2 | API Key 只走环境变量 | 查 `CLOUDBASE_API_KEY` 是否只经 `process.env` 读取 | 云函数均经 `process.env`；无字符串字面量 |
| | A3 | `.env` 被忽略且未跟踪 | `git check-ignore -v .env` + `git ls-files` | 忽略命中；仅 `.env.example` 被跟踪 |
| | A4 | 凭据 / 记忆目录未入库 | `git ls-files` 查 `.tcb-home/`、`.workbuddy/memory|agents/`、`.env` | 均未被跟踪 |
| **B 构建部署** | B1 | 前端构建通过 | `npm run build` | 退出码 0、类型检查无错 |
| | B2a | 线上静态托管可访问 | 拉首页 + 首页引用的主 JS（**量字节数**，不落盘） | 首页含主 JS 引用，且主 JS 可下载（> 1 KB） |
| | B2b | 本地产物与线上一致 | 比对 `dist/assets/index-*.js` 与线上主 JS 名 | 一致 PASS；不一致记 EXCEPTION（多半是"构建了还没部署"/CDN 缓存） |
| **C 公网接口** | C1 | 健康检查 | `GET /api/health` | 200 + `{"ok":true}` |
| | C2 | 食物列表 | `GET /api/foods` | 200 + 非空数组 |
| | C3 | 收藏读取 | `GET /api/favorites` | 200 + JSON 数组（可为 `[]`） |
| | C4 | 评分读取 | `GET /api/ratings` | 200 + JSON 数组（可为 `[]`） |
| **D 契约一致** | D1 | 契约总表「✅ ↔ 实测」**双向**核对（12 接口展开） | 逐接口发**故意非法 / 不存在**的请求 | 标 ✅ 实测却没实现 → **FAIL（虚报，阻断）**；实测已实现却没标 ✅ → EXCEPTION（文档滞后）；两者一致 → PASS |
| | D2 | DB 接口未报「API Key 未配置」 | 复用 C2/C3/C4 响应体 | body 不含 `CLOUDBASE_API_KEY` 相关报错 |
| **E 架构纪律** | E1 | 页面 / 组件不直接读写存储 | `git grep` 扫 `src/pages src/components` 的 `localStorage.getItem/setItem/removeItem` | 0 条（评分读写唯一出口 `src/services/storage.ts`） |
| | E2 | 文件名无中文 / 非 ASCII | `find src` 过滤非 ASCII 路径 | 0 条（防跨工具乱码） |
| | E3 | page 统一命名导出 + 无 XSS 高危写法 | 查 `src/pages/*.tsx` 是否均 `export function XxxPage(`；扫 `dangerouslySetInnerHTML` / `.innerHTML` / `eval(` | 全部命名导出；XSS 命中 0 条 |

> 「15 项」是分组口径；D1 在脚本里会**展开成 12 个接口逐条**，所以实跑输出行数会更多。

---

## 4. 三态判定

| 态 | 含义 | 动作 |
|---|---|---|
| **PASS** | 符合通过标准 | 放行 |
| **FAIL** | 不符合 | **阻断发布**，必须修 |
| **EXCEPTION** | 已知的、**非本次引入**的偏差（登记在册的未实现接口、网关错误体不合契约等） | 单列、不计入 FAIL，但每次要重新确认「还在预期内」 |

**为什么要 EXCEPTION**：老账（已知缺陷）和新问题（本次引入）混在一起，人会麻木；分开列，FAIL 才有威慑力。

**「虚报」与「滞后」方向相反，必须分开**（Day 25 调试轮修正）：
- 总表标 ✅、实测没有 → **虚报**（报了不存在的功能）→ **FAIL**，因为调用方会照文档踩空。
- 总表没标、实测已有 → **滞后**（做了没登记）→ **EXCEPTION**，属文档欠账，不影响线上，提示补 ✅ 即可。
- 初版 D1 把两者都记 FAIL，会让真正的虚报淹没在噪音里 —— 故拆成三态。

**当前登记在册的已知项（EXCEPTION 基线）**
1. `#9 DELETE /api/favorites/:foodId` 未实现（favorites 云函数白名单只有 GET/POST）—— 已知 Bug。
2. `#10 GET /api/health/profile` 被 `/api/health` 的前缀路由吃掉 —— 路由问题。
3. `#11 / #12` 健康档案写接口未实现。
4. HTTP 网关「未知路由」的错误体不含 `{"error":{...}}` 包裹、message 为英文 —— 与契约不统一。
5. `#2 POST /api/foods`、`#8 POST /api/favorites` 总表状态列滞后（Day 18 已上线却未标 ✅）—— Day 25 发现。

---

## 5. 失败怎么办

1. 看 FAIL 行的**证据**（原始输出），定位到具体文件 / 接口。
2. 修完只重跑对应的一遍即可（脚本每组独立，无需全跑）。
3. 同一项反复失败：停下报告「试了什么 / 报什么错 / 判断原因」，**不循环重试**。
4. **绝不允许为了让表变绿而放宽通过标准** —— 那正是「虚报通过」，本 Skill 存在的全部意义就是防它。

---

## 6. 设计要点（为什么这么做）

- **D 组用「故意非法请求」判断方法是否实现**：对接口发不存在的 id / 非法 body —— 返回 **405** = 该方法根本没实现；返回 **400 / 404(NOT_FOUND)** = 方法已实现（只是数据不对）。全程**只读、不写库、不留测试残留**。
- **契约双向核对**：不只看「标了 ✅ 的能不能用」，也看「能用的有没有标 ✅」—— 防止状态列悄悄滞后（Day 21 已吃过一次亏）。
- **A1 用 `git grep` 扫工作区**：能抓到「改了但还没提交」的文件里的密钥。
- **A1 走路径白名单**（`src/ functions/ db/` + 根配置）：避免把本 Skill、`docs/`、脚本自己的正则文本误当成密钥。
- **B2a 不落盘**：本沙箱里 `curl -o /dev/null` 会以 exit 23 失败，而 `-w '%{http_code}'` 仍会打印状态码，两者与 `|| echo 000` 叠加会得到 `200000` 假值 → 改为直接量取 body 字节数，绕开该坑（Day 25 调试轮修正）。

---

## 调用日志

> 每次真实调用本 Skill，按下面格式**追加**一条（不要覆盖历史）：

```
### YYYY-MM-DD｜调用方：<人 / 任务 ID>
- 场景：（上线前 / 回归 / 交作业）
- 命令与结果：PASS n / FAIL n / EXCEPTION n
- 发现的问题：
- 结果：通过 / 部分通过 / 未通过
- 备注：
```

### 2026-10-13｜调用方：Day 25 实跑验证（首跑）
- 场景：Skill 落地后首跑（调试轮 + 确认轮 + 故意破坏）
- 命令与结果：`bash scripts/verify.sh`
  - 第 1 遍（调试轮，未修脚本）：**PASS 23 / FAIL 3 / EXCEPTION 1** —— 暴露 1 个误报（B2a 假值 `200000`）+ 2 个真实发现（#2/#8 契约滞后）+ 1 个粒度缺陷（虚报与滞后未分）
  - 第 2 遍（修 B2a + D1 拆三态后）：**PASS 24 / FAIL 0 / EXCEPTION 3**
  - 第 3 遍（植入假密钥 canary）：**PASS 22 / FAIL 2 / EXCEPTION 3** —— A1/A2 精准命中 `src/services/api.ts:2`，退出码 1 阻断 ✅
  - 第 4 遍（撤除 canary）：**PASS 24 / FAIL 0 / EXCEPTION 3**
- 发现的问题：B2a 误报（沙箱 `curl -o /dev/null`）；#2/#8 契约总表滞后（Day 21 待办，本次未修，记 EXCEPTION）
- 结果：**通过**（故意破坏能查出、无误报残留）
- 备注：canary「植入 → 检出 → 移除 → 复绿」四遍闭环；EXCEPTION 基线 3 条与文档一致。
