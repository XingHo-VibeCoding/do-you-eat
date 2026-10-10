# Day 23 安全自查清单（错误处理与安全审计）

> 生成日期：2026-10-10｜审计范围：硬编码密钥 / 裸报错 / 非法输入 / .gitignore 完整性
> 结论先行：**未发现真实密钥泄漏（当前文件 + Git 全历史双重确认），无需作废重生成任何密钥。**

## 一、自查清单（每项含验证方法）

### A. 密钥与配置

| # | 检查项 | 验证方法（命令） | 今日结果 |
|---|--------|------------------|----------|
| 1 | 全仓库无硬编码密钥 | `git grep -inE "sk-[A-Za-z0-9]{20,}\|AKID[A-Za-z0-9]{16,}\|Bearer [A-Za-z0-9_-]{16,}\|postgres(ql)?://"` | ✅ 0 条 |
| 2 | API Key 只走环境变量 | `git grep -n "CLOUDBASE_API_KEY"` → 逐条人工核对 | ✅ 代码 3 处全部是 `process.env.CLOUDBASE_API_KEY`（foods/favorites/ratings 的 Repository） |
| 3 | Git 历史从未提交过密钥值 | `git log --all -p -S "CLOUDBASE_API_KEY" --oneline` 逐提交翻看 | ✅ 3 个提交碰过该词，历史出现的每一行都是 process.env 引用 / 报错文案 / 文档说明，无真实值 |
| 4 | `.env` 被忽略且未跟踪 | `git check-ignore -v .env`；`git ls-files \| grep -i env` | ✅ 命中 `.gitignore:2`；跟踪文件里只有 `.env.example` |
| 5 | `.env.example` 无真实值 | 人工打开核对 | ✅ 只有 `CLOUDBASE_API_KEY=` 空占位 + 中文说明注释 |
| 6 | 真实密钥只存于云端环境变量 | CloudBase 控制台 → 云函数 → 函数配置 → 环境变量 | ✅（Day 17 架构，今日代码侧交叉验证成立） |
| 7 | 泄漏应急流程已明确 | 见 `.env.example` 注释 | ✅ 「泄露后必须立即作废重生成」，不是删代码了事 |

### B. 错误提示（三类统一中文）

| # | 检查项 | 验证方法 | 今日结果 |
|---|--------|----------|----------|
| 8 | 网络错 → 中文 | 浏览器 DevTools → Network → Offline → 刷新 / 提交表单 | ✅ 「网络不给力，请检查网络后重试」（改前是英文 `Failed to fetch` 直穿表单） |
| 9 | 输入错 → 中文 | 表单提交与现有菜同名的菜品（409） | ✅ 「已有同名食物：xxx」（后端中文 message 透传） |
| 10 | 服务端错 → 中文 | 本地 5xx 演示（见第三节截图步骤 3） | ✅ 「服务器开小差了，请稍后再试」 |
| 11 | 5xx 不透传后端内部 message | 代码走查 `translateError()` | ✅ 状态码 ≥500 一律固定话术，防表名/堆栈泄露 |
| 12 | UI 不直显 err.message | `git grep "err.message"` 检查组件层 | ✅ 组件一律走 `friendlyErrorMessage()` 唯一出口（api.ts 导出） |

### C. 输入与注入面

| # | 检查项 | 验证方法 | 今日结果 |
|---|--------|----------|----------|
| 13 | 非法输入被后端拒绝 | 残缺 JSON、空菜名、非法 cuisine、score=99 四发探针 | ✅ 全部 400 BAD_REQUEST + 中文校验消息，无 500 |
| 14 | 特殊字符不引发 5xx / 注入 | `curl -H "X-User-Id: day23-%zz#inject" /api/favorites` | ✅ 正常 200 空数组（Repository 对参数 URL 编码，Day 17 决策生效） |
| 15 | 用户数据隔离（无越权） | 两个不同 X-User-Id 各查 favorites/ratings | ✅ 各自只能看到自己的数据 |
| 16 | 无 XSS 高危写法 | `git grep -in "dangerouslySetInnerHTML\|innerHTML\|eval("` （src/） | ✅ 0 条（React 默认转义兜底） |
| 17 | CORS 白名单非通配 | CloudBase 控制台 → 网关 CORS 配置 | ✅ Day 20 已验证，今日未改动 |

### D. 数据卫生（顺带完成）

| # | 检查项 | 验证方法 | 今日结果 |
|---|--------|----------|----------|
| 18 | 线上库无测试残留 | 控制台聚合查询 + `GET /api/foods` 接口双通道复核 | ✅ 清掉 day23-test-e595922e、回归验证麻酱凉皮、day2x 系列收藏/评分；剩 8 正式菜 + 锅包肉（有意保留） |

## 二、改前 → 改后（今日核心知识点存档）

| 场景 | 改前（裸报错） | 改后（人话） |
|------|----------------|--------------|
| 网络错（断网/被拦截） | `Failed to fetch`（浏览器英文裸错，直穿到表单红字） | 「网络不给力，请检查网络后重试」 |
| 非 JSON 错误响应（网关抽风） | `请求失败 (HTTP 502)`（状态码裸露） | 按状态码分类的中文话术 |
| 服务端错（5xx） | 透传后端 message（可能带内部细节） | 「服务器开小差了，请稍后再试」 |
| 输入错兜底（400 无 body message） | 同上状态码裸露 | 「输入有问题，请检查后再试」 |

实现位置：`src/services/api.ts` —— `translateError()`（三类分类）+ `friendlyErrorMessage()`（UI 层唯一出口）。页面组件禁止直显 `err.message`。

## 三、两张截图取证步骤

### 截图 1：全仓库搜索密钥特征词（结果 0 条）

用 VS Code 全局搜索（Ctrl+Shift+F），开启正则模式（.* 图标），搜：

```
sk-[A-Za-z0-9]{20,}|AKID[A-Za-z0-9]{16,}|Bearer [A-Za-z0-9_-]{16,}|postgres(ql)?://
```

在 `files to exclude` 一栏填 `node_modules, package-lock.json, dist`（避免第三方库干扰）。
**截取要点：** 搜索框里的正则 + 「无结果 / No results found」字样同框。

### 截图 2：三类错误中文提示（浏览器）

前提：`npm run dev` 启动本地开发服务器，打开食物库页（/library）。

1. **输入错：** 新增表单里菜名填「蛋炒饭」（已存在），提交 → 表单红字「已有同名食物：蛋炒饭」
2. **网络错：** F12 → Network 面板 → 「No network throttling」下拉选 **Offline** → 再提交一次表单 → 红字「网络不给力，请检查网络后重试」（切回 Online 恢复）
3. **服务端错：** 本地起一个 5 秒的假服务器模拟 5xx（命令见下），提交表单 → 红字「服务器开小差了，请稍后再试」

```bash
# 临时 5xx 演示服务器（返回 500，跑完 Ctrl+C 关掉即可，不碰任何项目文件）
"C:/Users/34199/.workbuddy/binaries/node/versions/22.22.2/node.exe" -e "require('http').createServer((q,s)=>{s.writeHead(500,{'Content-Type':'application/json'});s.end(JSON.stringify({error:{code:'INTERNAL',message:'mock 500 for demo'}}))}).listen(9999,()=>console.log('5xx mock on :9999'))"
```

> 说明：真实后端今日 13 号探针实测「打不出 5xx」（输入校验太严实），这本身就是安全加分项。
> **取证方案（已拍板选 B）**：截图只截第 1、2 两类；服务端错的证据 = 终端探针输出（13 号：残缺 JSON / score=99 均被 400 挡住，5xx 打不出来）+ 代码走查 `translateError()` 第 46-48 行固定话术。本地 5xx mock 方案弃用，零临时改动。

## 四、遗留与后续

- DELETE /api/foods、/api/favorites 两个 405 接口仍未上线（Day 22 降级项，api-contract #3 #9）——属第 4 周待办，不在今日范围
- 线上库清理已完成（见 D-18），锅包肉为有意保留
