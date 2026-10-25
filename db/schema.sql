-- =============================================================
-- db/schema.sql —「do you eat」建表脚本（Day 16 · PostgreSQL 版）
-- 执行位置：CloudBase 控制台 → SQL 型数据库 → SQL 编辑器
-- 依据：api-contract.md v1.0（12 接口 / 4 张表）
-- 可重复执行：先 DROP 再 CREATE，跑任意遍结果一致。
-- 命名：列名 camelCase 且带双引号——PostgreSQL 里不加引号的标识符
--       会被折叠成全小写，双引号才能保住 userId 这样的驼峰拼写
--       （契约约定与前端 TS 类型逐字段一致，好处是查询结果直接
--       就是接口要的 JSON 形状）。
-- =============================================================

-- ⚠️ 本文件是「表结构唯一设计契约」，会先 DROP 再 CREATE。
-- 往线上已跑起来的库追加表时，不要直接跑本文件——用
-- db/migrate-add-daily-logs.sql（只 CREATE TABLE IF NOT EXISTS，不动现有表）。
--
-- 删除顺序：先删子表（引用别人的），再删父表（被引用的）。
-- 顺序反了，外键会挡住 DROP（还有表引用着 foods 时不许删 foods）。
DROP TABLE IF EXISTS daily_logs;
DROP TABLE IF EXISTS health_profiles;
DROP TABLE IF EXISTS favorites;
DROP TABLE IF EXISTS ratings;
DROP TABLE IF EXISTS foods;

-- ① foods（食物库，全局共享）—— 对应接口 1/2/3
--    Day 30 加 3 列：price / location / "canteenType"（浙大紫金港食堂真实菜品采集字段，
--    全部可空——老数据与用户自建菜没有价格档口）。列名与前端 Food 类型同名，
--    PostgREST select=* 返回的 JSON 直接就是前端要的形状，无需再做字段映射。
CREATE TABLE foods (
  id          VARCHAR(64)  NOT NULL,
  name        VARCHAR(50)  NOT NULL,
  emoji       VARCHAR(16)  NOT NULL,
  description VARCHAR(200) NOT NULL,
  "mealPeriod" VARCHAR(10) NOT NULL,
  spicy       BOOLEAN      NOT NULL DEFAULT FALSE,
  tags        JSONB        NOT NULL,
  cuisine     VARCHAR(4)   NULL,
  price       NUMERIC(5,2) NULL,
  location    VARCHAR(20)  NULL,
  "canteenType" VARCHAR(10) NULL,
  PRIMARY KEY (id),
  CONSTRAINT chk_meal_period CHECK ("mealPeriod" IN ('breakfast','lunch','dinner','snack')),
  CONSTRAINT chk_price CHECK (price IS NULL OR price >= 0),
  CONSTRAINT chk_location CHECK (location IS NULL OR location IN ('大食堂','二楼西区食堂','二楼东区食堂')),
  CONSTRAINT chk_canteen_type CHECK ("canteenType" IS NULL OR "canteenType" IN ('风味餐厅','休闲餐厅','民族餐厅'))
);

-- ② ratings（用户评分，一人一菜一行）—— 对应接口 4/5/6
--    ("userId","foodId") 复合主键 = 业务上的「一人一菜只有一条」
CREATE TABLE ratings (
  "userId"    VARCHAR(64) NOT NULL,
  "foodId"    VARCHAR(64) NOT NULL,
  score       SMALLINT    NOT NULL,
  "updatedAt" VARCHAR(24) NOT NULL,
  PRIMARY KEY ("userId", "foodId"),
  CONSTRAINT chk_score CHECK (score BETWEEN 1 AND 5),
  CONSTRAINT fk_ratings_food FOREIGN KEY ("foodId") REFERENCES foods (id) ON DELETE CASCADE
);

-- ③ favorites（收藏，一人一菜一行）—— 对应接口 7/8/9
CREATE TABLE favorites (
  "userId" VARCHAR(64) NOT NULL,
  "foodId" VARCHAR(64) NOT NULL,
  PRIMARY KEY ("userId", "foodId"),
  CONSTRAINT fk_favorites_food FOREIGN KEY ("foodId") REFERENCES foods (id) ON DELETE CASCADE
);

-- ④ health_profiles（健康档案，一人一份）—— 对应接口 10/11/12
CREATE TABLE health_profiles (
  "userId"    VARCHAR(64)  NOT NULL,
  "heightCm"  SMALLINT     NOT NULL,
  "weightKg"  NUMERIC(5,1) NOT NULL,
  age         SMALLINT     NOT NULL,
  "updatedAt" VARCHAR(24)  NOT NULL,
  PRIMARY KEY ("userId"),
  CONSTRAINT chk_height CHECK ("heightCm" BETWEEN 50 AND 250),
  CONSTRAINT chk_weight CHECK ("weightKg" BETWEEN 10 AND 300),
  CONSTRAINT chk_age    CHECK (age BETWEEN 1 AND 150)
);

-- ⑤ daily_logs（每日健康记录，一人一天一条）—— 对应接口 13/14/15
--   Day 29 新增。业务字段全部可空：用户可能早上只记体重、晚上才补饮食，
--   可空 + 接口 #14 的「字段级 upsert」配合，早上的体重才不会被晚上的提交抹掉。
--   date 用 VARCHAR(10) 存 'YYYY-MM-DD' 字符串，与项目「ISO 字符串直出 JSON」惯例一致。
CREATE TABLE daily_logs (
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

-- =============================================================
-- 验证（板块④执行；数据层面的验证见 seed.sql 末尾）
-- =============================================================
-- 应列出 5 张表（Day 29 起多一张 daily_logs）：
-- foods / ratings / favorites / health_profiles / daily_logs
SELECT table_name
  FROM information_schema.tables
 WHERE table_schema = 'public'
 ORDER BY table_name;

-- 逐表核对字段名 / 类型 / 可空性（重点看 camelCase 是否保住了）
SELECT table_name, column_name, data_type, is_nullable
  FROM information_schema.columns
 WHERE table_schema = 'public'
 ORDER BY table_name, ordinal_position;
