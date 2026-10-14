# 发布清单（v1.0）— do you eat

> 用途：每次正式发版的操作手册。按顺序执行，任何一步不过就停下，不带病上线。
> 首次使用：2026-10-14（Day 26，v1.0 发布）。

## 一、版本标记

| 项 | 值 |
|---|---|
| 版本号 | `v1.0` |
| 标记方式 | git 附注标签（annotated tag） |
| 对应提交 | `78f7403`（Day 25） |
| 远端状态 | 已推送 GitHub（`git ls-remote --tags origin` 可验证） |

操作命令（以后每次发版照抄，换版本号即可）：

```bash
git tag -a v1.0 -m "一句话说明这版有什么"
git push origin v1.0          # 推送需在沙箱外放行
```

为什么用 tag 不用记 commit 号：tag 是人类可读的锚点，回滚时 `git checkout v1.0` 一秒到位，commit 号要翻手册。

## 二、发布前验证项

1. **全量检查**：`bash scripts/verify.sh`，退出码必须为 0（无 FAIL）。
   - EXCEPTION 不阻断，但要逐条确认都是已知登记项。
   - 注（Day 26 教训）：脚本对 curl 失败自动重试 1 次，防网关抖动误报。
2. **构建通过**：`npm run build` 零报错（verify.sh 内部已含）。
3. **工作区干净**：`git status` 无未提交改动，发布的必须是仓库里的代码。

## 三、发布步骤（静态托管）

```bash
npm run build        # 产出 dist/
# 部署（沙箱内需加 HOME/.tcb-home 前缀，见 RUNBOOK）
tcb hosting deploy dist -e doyoueat-d5g36rg7ia785b553
```

部署后立刻记下本地产物文件名：

```bash
ls dist/assets/index-*.js    # 形如 index-AbCd1234.js
```

## 四、发布后验证

1. **首页可访问**：打开 `https://doyoueat-d5g36rg7ia785b553-1496350653.tcloudbaseapp.com/`，页面正常渲染。
2. **hash 比对（防 CDN 旧缓存）**：比对本地 `dist/assets/index-<hash>.js` 与线上页面实际加载的 `<script src>` hash 是否一致。
   - CDN 可能几分钟内还返回旧 index.html，不一致就等 2 分钟再刷。
3. **核心流程抽查**：抽卡出图 → 收藏一颗星 → 评分写入 → 刷新后评分还在。

## 五、代码与数据备份方式

| 对象 | 备份方式 | 恢复方式 |
|---|---|---|
| 源代码 | `git push` + tag 推到 GitHub（远端即异地备份） | `git checkout <tag>` |
| 构建产物 dist | 不入 git；需要时从对应 tag 重新 `npm run build` | 同左 |
| 表结构与种子数据 | `db/schema.sql` + `db/seed.sql`（仓库内，可重复执行） | 控制台执行 SQL |
| 线上业务数据（ratings/favorites/health_profiles） | 控制台「SQL 型数据库」导出，或 PostgREST 全量拉取存 JSON（备查，暂未实操） | 按契约字段写回或 seed |

## 六、发布记录

| 日期 | 版本 | 提交 | 验证结果 | 备注 |
|---|---|---|---|---|
| 2026-10-14 | v1.0 | `78f7403` | verify 24 PASS / 0 FAIL / 3 EXCEPTION（已知待办） | 首次正式发版；当晚网关间歇抖动约 1/6，已在 verify.sh 加重试 |
