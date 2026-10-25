-- =============================================================
-- db/migrate-add-canteen-fields.sql — Day 30 增量迁移：foods 表加 3 列
-- 执行位置：CloudBase 控制台 → SQL 型数据库 → SQL 编辑器
--
-- 为什么单独一份：db/schema.sql 是「表结构契约」，开头 DROP 全部 5 张表。
-- 线上 foods 里有真实数据（seed 8 条 + 用户自建），直接跑那份会清空。
-- 这份脚本只 ADD COLUMN、不 DROP 任何东西，可以重复执行。
--
-- 加的 3 列（浙大紫金港食堂真实菜品采集字段，全部可空）：
--   price        NUMERIC(5,2)  价格（元），如 9.8 / 14.5
--   location     VARCHAR(20)   食堂位置：大食堂 / 二楼西区食堂 / 二楼东区食堂
--   "canteenType" VARCHAR(10)  档口类型：风味餐厅 / 休闲餐厅 / 民族餐厅
--
-- 为什么用 DO $$ 包起来：CloudBase 的 PG 版本不一定支持
-- ADD COLUMN IF NOT EXISTS，用 information_schema 先查再改最稳，跑几遍都一样。
-- =============================================================

-- ① 加三列（已有则跳过）
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
     WHERE table_schema = 'public' AND table_name = 'foods' AND column_name = 'price'
  ) THEN
    ALTER TABLE foods ADD COLUMN price NUMERIC(5,2) NULL;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
     WHERE table_schema = 'public' AND table_name = 'foods' AND column_name = 'location'
  ) THEN
    ALTER TABLE foods ADD COLUMN location VARCHAR(20) NULL;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
     WHERE table_schema = 'public' AND table_name = 'foods' AND column_name = 'canteenType'
  ) THEN
    ALTER TABLE foods ADD COLUMN "canteenType" VARCHAR(10) NULL;
  END IF;
END $$;

-- ② 加三个 CHECK 约束（已有同名约束则跳过）
--    全部写成「为 NULL 或 在白名单内」，保证老数据（没有这三项）不会被约束挡住
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'chk_price') THEN
    ALTER TABLE foods ADD CONSTRAINT chk_price CHECK (price IS NULL OR price >= 0);
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'chk_location') THEN
    ALTER TABLE foods ADD CONSTRAINT chk_location
      CHECK (location IS NULL OR location IN ('大食堂','二楼西区食堂','二楼东区食堂'));
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'chk_canteen_type') THEN
    ALTER TABLE foods ADD CONSTRAINT chk_canteen_type
      CHECK ("canteenType" IS NULL OR "canteenType" IN ('风味餐厅','休闲餐厅','民族餐厅'));
  END IF;
END $$;

-- -------------------------------------------------------------
-- 验证：foods 的字段名 / 类型 / 可空性
-- 重点看三件事：
--   1) price / location / canteenType 三列都在
--   2) is_nullable 全是 YES（老数据没有这三项，必须允许为空）
--   3) canteenType 保住了驼峰（没被折叠成 canteentype）
-- 注意：控制台 SQL 编辑器一次贴多条 SELECT 只显示最后一条的结果，
--       要逐条单独执行、逐条看结果。
-- -------------------------------------------------------------
SELECT column_name, data_type, is_nullable
  FROM information_schema.columns
 WHERE table_schema = 'public'
   AND table_name = 'foods'
 ORDER BY ordinal_position;
