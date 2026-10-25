# Day 30 食堂数据上云 — 控制台操作清单

> 为什么有这份清单：CloudBase 的 SQL 型数据库**只能从控制台执行 DDL/DML**，
> CLI 和云函数都做不了（PostgREST 不支持 DDL；云函数拿到的 API Key 是数据平面凭据）。
> 所以这三步必须人工在控制台点一遍。

环境：`doyoueat-d5g36rg7ia785b553`
入口：CloudBase 控制台 → SQL 型数据库 → SQL 编辑器

---

## 第 1 步：加 3 列

复制 `db/migrate-add-canteen-fields.sql` 全文，贴进 SQL 编辑器执行。

用途：给 `foods` 表加 `price` / `"location"` / `"canteenType"` 三列 + 三个 CHECK 约束。
脚本用 `DO $$ ... IF NOT EXISTS` 包着，**跑几遍都一样**，不会报错、不会重复加列。

执行后单跑这条验证（一次只贴一条，控制台只显示最后一条 SELECT 的结果）：

```sql
SELECT column_name, data_type, is_nullable
  FROM information_schema.columns
 WHERE table_schema = 'public' AND table_name = 'foods'
 ORDER BY ordinal_position;
```

**看三件事**：
1. `price` / `location` / `canteenType` 三列都在
2. `is_nullable` 全是 `YES`（老数据没有这三项，必须允许为空，否则下一步灌库会炸）
3. `canteenType` 保住了驼峰（不能变成 `canteentype`）

---

## 第 2 步：灌 120 条食堂菜品

复制 `db/seed-canteen-foods.sql` 全文，执行。

⚠️ **执行前先看一眼**：这个脚本开头有一段

```sql
DELETE FROM foods WHERE id IN ('f002', 'f026');
```

删的是 f002 小笼包、f026 麻婆豆腐（老 seed 数据）——本地 `src/data/foods.ts` 已经把这两条
删掉、改由食堂采集版 f171 / f173 承载。云端不删就会在 App 里看到**两张小笼包**。

代价（外键 `ON DELETE CASCADE`）：挂在这两条上的评分 / 收藏会连带着被清掉。
不想删就把这行注释掉，代价是 App 里出现重名卡片。

想补回种子评分的话，删完再跑一遍新版 `db/seed.sql`（它已经把引用改到 f171 / f173）。
注意 `db/seed.sql` 开头会 `DELETE FROM foods`，**跑完必须再跑一次本脚本**把 120 条补回来。

执行后单跑这条验证：

```sql
SELECT count(*) AS canteen_rows FROM foods WHERE price IS NOT NULL;
```

**期望：120**。再看总数：

```sql
SELECT count(*) AS total_rows FROM foods;
```

---

## 第 3 步：接口验证

浏览器直接打开（或用 curl）：

```
https://doyoueat-d5g36rg7ia785b553-1496350653.ap-shanghai.app.tcloudbase.com/api/foods
```

**看两件事**：
1. 数组里有 `f055` 毛血旺、`f174` 水煮鱼
2. 食堂条目带 `"price": 7, "location": "大食堂", "canteenType": "风味餐厅"`；
   老条目（如 f001 豆浆油条）这三个字段是 `null`

---

## 第 4 步（可选）：发布前端

数据上云后，抽卡结果卡才会显示「¥7 · 大食堂 · 风味餐厅」。
前端静态托管需要重新部署（这次改了 `ResultCard.tsx` / `foodMeta.ts` / `app.css`）。

---

## 实际执行结果（2026-10-25 补记）

### 第 1 步：加列 —— 控制台执行 ✅

`db/migrate-add-canteen-fields.sql` 贴进 SQL 编辑器执行成功。

> ⚠️ 第一次踩的坑：贴进去的是**文件路径文本** `db/migrate-add-canteen-fields.sql`，
> 数据库报 `syntax error at or near "db"`。SQL 编辑器只认 SQL 语句本身，
> **必须打开文件复制里面的内容**，不是路径。

### 第 2 步：灌 120 条 —— 改用 PostgREST，没走控制台 ✅

控制台要贴 120 行 SQL 既慢又容易复制不全。实际用 service_role Key 直连 PostgREST 完成：

```bash
# 批量 upsert（120 条一次过，HTTP 201）
POST https://{envId}.api.tcloudbasegateway.com/v1/rdb/rest/foods
Authorization: Bearer <CLOUDBASE_API_KEY>
Content-Type: application/json
Prefer: resolution=merge-duplicates, return=minimal
body: 120 条对象的 JSON 数组
```

结果：`foods` 总数 **127**（老 9 − 删 2 + 新增 120），带 `price` 的 **120**，
老数据 7 条三列为 `null`。f055 毛血旺、f174 水煮鱼字段完整。

### 第 3 步：删 f002 / f026 —— 无损迁移 ✅

删之前先查影响面：**3 条评分 + 2 条收藏**（全是种子 / 测试账号，无真实用户数据）。
做法：先把这 5 条引用 upsert 到 `f171` / `f173`，再删旧 `foods` 行——评分收藏一条没丢。

### 第 4 步：前端发布 + 验收 ✅

`npm run build` → `tcb hosting deploy dist -e doyoueat-d5g36rg7ia785b553`
线上 `assets/index-BurQXdxS.js` 与本地一致。

`bash scripts/verify.sh` → **PASS 32 / FAIL 0 / EXCEPTION 0**。

### 结论

三步里只有**第 1 步（加列）必须走控制台**——ALTER TABLE 需要 SQL 编辑器权限。
第 2、3 步（灌数据 / 删行）都可以用 PostgREST 完成，比控制台贴脚本快且不会复制漏行。
以后再要改线上数据，优先走这条路。
