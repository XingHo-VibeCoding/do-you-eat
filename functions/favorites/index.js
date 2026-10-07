// 云函数：favorites —— GET /api/favorites + POST /api/favorites/:foodId
// 对应 api-contract.md 接口 #7（GET，Day 17 实现）与 #8（POST，Day 18 实现）
//
// Day 19 分层重构：favorites 表的数据库操作全部移到同目录 favoritesRepository.js
// （数据访问层），本文件只剩接口层职责：接请求 → 校验 → 调 repository → 包 HTTP 响应。
// 接口路径、字段、响应形状、错误文案与重构前完全一致（契约 v1.2 不动）。
//
// 数据链路：浏览器 → HTTP 网关(/api/favorites，带 X-User-Id 头) → 本函数
//         → favoritesRepository → PostgREST → CloudBase PG → 原路返回
//
// 返回形状（契约 v1.2）：
// - GET  成功：HTTP 200 + foodId 字符串数组（如 ["f001","f025"]，空收藏是 []）
// - POST 成功：HTTP 201 + {"foodId":"f001"}（重复收藏幂等返回 201，Day 16 拍板）
// - 失败：HTTP 4xx/5xx + { error: { code, message } }
//
// foodId 的取值顺序（Day 18 实测网关后定稿）：
// 1) 路径参数：POST /api/favorites/<foodId>——网关绑定 /api/favorites 后会把
//    前缀剥掉，事件里 path 只剩 '/f001'，取最后一个非空段即 foodId
// 2) 请求体：POST /api/favorites + {"foodId":"f001"}（兼容写法）
// 3) 控制台直接调用：{"userId":"...","foodId":"f001"}

const repository = require('./favoritesRepository');

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
  console.error('[favorites] 未预期的错误:', err && err.message);
  return httpJson(500, { error: { code: 'INTERNAL', message: '服务器内部错误' } });
}

// 网关传来的 headers 大小写不保证统一，全部转小写再比对
function getHeader(event, name) {
  const headers = (event && event.headers) || {};
  const lower = name.toLowerCase();
  for (const key of Object.keys(headers)) {
    if (key.toLowerCase() === lower) return headers[key];
  }
  return undefined;
}

// 解析 POST 请求体。返回值三种：undefined（没有请求体，合法，POST 收藏允许空体）
// / 对象（解析成功）/ null（请求体不是合法 JSON，非法）
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

// 从三种来源里找 foodId（见文件头注释）
// 网关实测（Day 18）：绑定路由 /api/favorites 后，事件里的 path 只剩后缀
// （请求 /api/favorites/f001 → event.path = '/f001'），所以取最后一个非空段。
function extractFoodId(event, body) {
  const rawPath = (event && typeof event.path === 'string' && event.path) || '';
  const segments = rawPath.split('/').filter(function (s) { return s.length > 0; });
  const lastSeg = segments[segments.length - 1];
  if (lastSeg !== undefined && lastSeg !== 'api' && lastSeg !== 'favorites') {
    return decodeURIComponent(lastSeg);
  }
  if (body && typeof body.foodId === 'string' && body.foodId.length > 0) return body.foodId;
  if (event && typeof event.foodId === 'string' && event.foodId.length > 0) return event.foodId;
  return undefined;
}

exports.main = async function (event, context) {
  const isHttpCall = Boolean(event && event.httpMethod);
  const method = isHttpCall ? String(event.httpMethod).toUpperCase() : event && typeof event.foodId === 'string' ? 'POST' : 'GET';

  if (isHttpCall && method !== 'GET' && method !== 'POST') {
    return httpJson(405, { error: { code: 'METHOD_NOT_ALLOWED', message: '本接口只支持 GET 和 POST' } });
  }

  // 匿名用户方案（Day 16 拍板）：前端生成 UUID，放在 X-User-Id 请求头里
  const userId = isHttpCall ? getHeader(event, 'X-User-Id') : event.userId;

  if (typeof userId !== 'string' || userId.length === 0 || userId.length > 64) {
    return httpJson(400, { error: { code: 'BAD_REQUEST', message: '缺少有效的 X-User-Id 请求头' } });
  }

  // 数据库凭据自检（API Key 在仓库层环境变量里读），位置与重构前一致
  try {
    repository.assertConfigured();
  } catch (err) {
    return repoErrorToResponse(err);
  }

  // ---------- GET：读取收藏列表（Day 17 逻辑，行为不变） ----------
  if (method === 'GET') {
    try {
      const data = await repository.listFoodIdsByUser(userId);
      return isHttpCall ? httpJson(200, data) : data;
    } catch (err) {
      return repoErrorToResponse(err);
    }
  }

  // ---------- POST：收藏一道菜（Day 18 逻辑，行为不变） ----------
  const body = isHttpCall ? parseBody(event) : event;
  if (body === null) {
    return httpJson(400, { error: { code: 'BAD_REQUEST', message: '请求体不是合法的 JSON' } });
  }

  const foodId = extractFoodId(event, body);
  if (foodId === undefined) {
    return httpJson(400, {
      error: { code: 'BAD_REQUEST', message: '缺少 foodId：请在路径里带（/api/favorites/f001）或在请求体里传 {"foodId":"f001"}' },
    });
  }
  if (foodId.length > 64) {
    return httpJson(400, { error: { code: 'BAD_REQUEST', message: 'foodId 不能超过 64 个字符' } });
  }

  try {
    // 第 1 步：校验这道菜存在（外键预查，提前查出能返回更准确的 404）
    if (!(await repository.foodExists(foodId))) {
      console.log('[favorites] POST 拒绝：userId=' + userId + ' foodId=' + foodId + '（食物不存在）');
      return httpJson(404, { error: { code: 'NOT_FOUND', message: '食物不存在：' + foodId } });
    }

    // 第 2 步：幂等约定（Day 16 拍板）——已收藏的直接返回 201，不报错
    const existRows = await repository.findFavorite(userId, foodId);
    if (existRows.length > 0) {
      console.log('[favorites] POST 幂等：userId=' + userId + ' foodId=' + foodId + '（已收藏，返回 201）');
      return isHttpCall ? httpJson(201, { foodId: foodId }) : { foodId: foodId };
    }

    // 第 3 步：插入。并发撞主键时仓库层报 'duplicate'，同样按幂等 201 处理
    const result = await repository.insertFavorite(userId, foodId);
    console.log(
      result === 'duplicate'
        ? '[favorites] POST 幂等(并发)：userId=' + userId + ' foodId=' + foodId
        : '[favorites] POST 成功：userId=' + userId + ' foodId=' + foodId
    );
    return isHttpCall ? httpJson(201, { foodId: foodId }) : { foodId: foodId };
  } catch (err) {
    return repoErrorToResponse(err);
  }
};
