// 云函数：foods —— GET /api/foods + POST /api/foods
// 对应 api-contract.md 接口 #1（GET，Day 17 实现）与 #2（POST，Day 18 实现）
//
// Day 19 分层重构：foods 表的数据库操作全部移到同目录 foodsRepository.js（数据访问层），
// 本文件只剩接口层职责：接请求 → 校验 → 调 repository → 包 HTTP 响应。
// 接口路径、字段、响应形状、错误文案与重构前完全一致（契约 v1.2 不动）。
// 为什么拆：将来换数据库（如正式版 PG 直连）只改 repository 文件，本文件一行不动；
// 与前端「评分读写只走 storage.ts」是同一个架构纪律。
//
// 返回形状（契约 v1.2）：
// - GET  成功：HTTP 200 + Food[]（直接是业务数据数组，与前端 mockApi 返回一致）
// - POST 成功：HTTP 201 + 完整 Food（带后端生成的 id，形如 user-xxxxxxxxxxxx）
// - 失败：HTTP 4xx/5xx + { error: { code, message } }
//
// POST 校验规则（错误提示全部中文，Day 18）：
// - name / emoji / description 非空且不超长（对应表列 VARCHAR 上限）
// - mealPeriod 四选一；spicy 布尔；tags 字符串数组（缺省 []）；cuisine 八大菜系或留空
// - 防重复（Day 18 拍板）：库里已有同名食物 → 409 拒绝

const repository = require('./foodsRepository');

// 合法值清单：与 schema.sql 的 CHECK 约束、src/types/food.ts 逐项对齐
const MEAL_PERIODS = ['breakfast', 'lunch', 'dinner', 'snack'];
const CUISINES = ['川', '粤', '鲁', '苏', '浙', '闽', '湘', '徽'];

// HTTP 网关的标准返回格式（Day 15 health 函数已验证：网关认这个格式）
function httpJson(statusCode, payload) {
  return {
    statusCode,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  };
}

// 仓库层错误 → HTTP 响应的统一出口：repo 抛什么（状态码/错误码/文案），接口原样回什么
function repoErrorToResponse(err) {
  if (err instanceof repository.RepoError) {
    return httpJson(err.status, { error: { code: err.code, message: err.message } });
  }
  // 理论上到不了这里（仓库层已把非预期错误包成 RepoError），留作保险
  console.error('[foods] 未预期的错误:', err && err.message);
  return httpJson(500, { error: { code: 'INTERNAL', message: '服务器内部错误' } });
}

// 解析 POST 请求体。返回值三种：undefined（没有请求体）/ 对象 / null（不是合法 JSON）
function parseBody(event) {
  const raw = event && event.body;
  if (raw === undefined || raw === null || raw === '') return undefined;
  if (typeof raw === 'object') return raw; // 控制台直接调用可能已传对象
  if (typeof raw !== 'string') return null;
  try {
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : null;
  } catch (e) {
    return null;
  }
}

// 校验新增食物的请求体。通过返回 { value }，不通过返回 { error: '中文提示' }
function validateFoodInput(input) {
  if (!input || typeof input !== 'object') {
    return { error: '请求体不能为空，需要 JSON 对象' };
  }

  const name = typeof input.name === 'string' ? input.name.trim() : '';
  if (!name) return { error: 'name 不能为空' };
  if (name.length > 50) return { error: 'name 不能超过 50 个字符' };

  const emoji = typeof input.emoji === 'string' ? input.emoji.trim() : '';
  if (!emoji) return { error: 'emoji 不能为空' };
  if (emoji.length > 16) return { error: 'emoji 不能超过 16 个字符' };

  const description = typeof input.description === 'string' ? input.description.trim() : '';
  if (!description) return { error: 'description 不能为空' };
  if (description.length > 200) return { error: 'description 不能超过 200 个字符' };

  if (typeof input.mealPeriod !== 'string' || MEAL_PERIODS.indexOf(input.mealPeriod) === -1) {
    return { error: 'mealPeriod 非法，只能是 breakfast / lunch / dinner / snack 之一' };
  }

  const tags = input.tags === undefined ? [] : input.tags;
  if (!Array.isArray(tags) || tags.some(function (t) { return typeof t !== 'string'; })) {
    return { error: 'tags 必须是字符串数组' };
  }

  const spicy = input.spicy === undefined ? false : input.spicy;
  if (typeof spicy !== 'boolean') return { error: 'spicy 必须是布尔值' };

  let cuisine = input.cuisine === undefined || input.cuisine === '' ? null : input.cuisine;
  if (cuisine !== null && (typeof cuisine !== 'string' || CUISINES.indexOf(cuisine) === -1)) {
    return { error: 'cuisine 非法，只能是八大菜系（川/粤/鲁/苏/浙/闽/湘/徽）之一或留空' };
  }

  return {
    value: {
      name: name,
      emoji: emoji,
      description: description,
      mealPeriod: input.mealPeriod,
      tags: tags,
      spicy: spicy,
      cuisine: cuisine,
    },
  };
}

exports.main = async function (event, context) {
  const isHttpCall = Boolean(event && event.httpMethod);
  const method = isHttpCall
    ? String(event.httpMethod).toUpperCase()
    : event && typeof event.name === 'string'
      ? 'POST'
      : 'GET';

  if (isHttpCall && method !== 'GET' && method !== 'POST') {
    return httpJson(405, { error: { code: 'METHOD_NOT_ALLOWED', message: '本接口只支持 GET 和 POST' } });
  }

  // 数据库凭据自检（API Key 在仓库层环境变量里读）。放在请求体校验之前，
  // 保持与重构前相同的报错时序：Key 没配时先报 500，不去解析请求体。
  try {
    repository.assertConfigured();
  } catch (err) {
    return repoErrorToResponse(err);
  }

  // ---------- GET：食物库全量（Day 17 逻辑，行为不变） ----------
  if (method === 'GET') {
    try {
      const data = await repository.listFoods();
      return isHttpCall ? httpJson(200, data) : data;
    } catch (err) {
      return repoErrorToResponse(err);
    }
  }

  // ---------- POST：新增一道菜（Day 18 逻辑，行为不变） ----------
  const body = isHttpCall ? parseBody(event) : event;
  if (body === null) {
    return httpJson(400, { error: { code: 'BAD_REQUEST', message: '请求体不是合法的 JSON' } });
  }

  const validated = validateFoodInput(body);
  if (validated.error) {
    console.log('[foods] POST 拒绝：' + validated.error);
    return httpJson(400, { error: { code: 'BAD_REQUEST', message: validated.error } });
  }
  const food = validated.value;

  try {
    // 第 1 步：防重复（Day 18 拍板）——同名食物已存在直接拒绝
    const dupRows = await repository.findFoodIdsByName(food.name);
    if (dupRows.length > 0) {
      console.log('[foods] POST 拒绝：name=' + food.name + '（同名已存在，id=' + dupRows[0].id + '）');
      return httpJson(409, { error: { code: 'CONFLICT', message: '已有同名食物：' + food.name } });
    }

    // 第 2 步：插入。id 由仓库层生成并处理撞号重试，这里只拿落库结果
    const row = await repository.insertFood(food);
    console.log('[foods] POST 成功：name=' + food.name + ' id=' + row.id);
    return isHttpCall ? httpJson(201, row) : row;
  } catch (err) {
    return repoErrorToResponse(err);
  }
};
