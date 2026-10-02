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

-- 删除顺序：先删子表（引用别人的），再删父表（被引用的）。
-- 顺序反了，外键会挡住 DROP（还有表引用着 foods 时不许删 foods）。
DROP TABLE IF EXISTS health_profiles;
DROP TABLE IF EXISTS favorites;
DROP TABLE IF EXISTS ratings;
DROP TABLE IF EXISTS foods;

-- ① foods（食物库，全局共享）—— 对应接口 1/2/3
CREATE TABLE foods (
  id          VARCHAR(64)  NOT NULL,
  name        VARCHAR(50)  NOT NULL,
  emoji       VARCHAR(16)  NOT NULL,
  description VARCHAR(200) NOT NULL,
  "mealPeriod" VARCHAR(10) NOT NULL,
  spicy       BOOLEAN      NOT NULL DEFAULT FALSE,
  tags        JSONB        NOT NULL,
  cuisine     VARCHAR(4)   NULL,
  PRIMARY KEY (id),
  CONSTRAINT chk_meal_period CHECK ("mealPeriod" IN ('breakfast','lunch','dinner','snack'))
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

-- =============================================================
-- 验证（板块④执行；数据层面的验证见 seed.sql 末尾）
-- =============================================================
-- 应列出 4 张表：foods / ratings / favorites / health_profiles
SELECT table_name
  FROM information_schema.tables
 WHERE table_schema = 'public'
 ORDER BY table_name;

-- 逐表核对字段名 / 类型 / 可空性（重点看 camelCase 是否保住了）
SELECT table_name, column_name, data_type, is_nullable
  FROM information_schema.columns
 WHERE table_schema = 'public'
 ORDER BY table_name, ordinal_position;
