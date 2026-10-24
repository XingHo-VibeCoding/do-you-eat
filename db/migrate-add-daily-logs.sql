-- =============================================================
-- db/migrate-add-daily-logs.sql — Day 29 增量迁移：追加 daily_logs 表
-- 执行位置：CloudBase 控制台 → SQL 型数据库 → SQL 编辑器
--
-- 为什么单独一份：db/schema.sql 是「表结构契约」，开头会 DROP 全部 5 张表。
-- 线上已经跑着 foods/ratings/favorites/health_profiles 的真实数据，
-- 直接跑那份会把数据清空。这份脚本用 CREATE TABLE IF NOT EXISTS，
-- 只加新表、不碰任何现有表，可以重复执行。
--
-- 依据：api-contract.md v1.7 接口 #13 / #14 / #15
-- =============================================================

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

-- -------------------------------------------------------------
-- 验证 1：应列出 5 张表（foods / ratings / favorites / health_profiles / daily_logs）
-- 注意：控制台 SQL 编辑器一次贴多条 SELECT 只显示最后一条的结果，
--       要逐条单独执行、逐条看结果。
-- -------------------------------------------------------------
SELECT table_name
  FROM information_schema.tables
 WHERE table_schema = 'public'
 ORDER BY table_name;

-- -------------------------------------------------------------
-- 验证 2：daily_logs 的字段名 / 类型 / 可空性
-- 重点看 camelCase 列（"userId" "weightKg"）是否带引号保住了驼峰，
-- 以及 6 个业务字段是否都是 YES（可空）。
-- -------------------------------------------------------------
SELECT column_name, data_type, is_nullable
  FROM information_schema.columns
 WHERE table_schema = 'public'
   AND table_name = 'daily_logs'
 ORDER BY ordinal_position;
