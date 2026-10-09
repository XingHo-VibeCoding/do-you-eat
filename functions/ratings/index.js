// 云函数：ratings —— GET /api/ratings + PUT /api/ratings/:foodId + DELETE /api/ratings/:foodId
// 对应 api-contract.md 接口 #4（GET）、#5（PUT）、#6（DELETE），Day 22 实现
//
// 分层：数据库操作全部移到同目录 ratingsRepository.js（数据访问层），
// 本文件只剩接口层职责：接请求 → 校验 → 调 repository → 包 HTTP 响应。
// 与 favorites/foods 同一套接口层模式。
//
// 数据链路：浏览器 → HTTP 网关(/api/ratings，带 X-User-Id 头) → 本函数
//         → ratingsRepository → PostgREST → CloudBase PG → 原路返回
//
// 返回形状（契约 v1.2 → v1.3，Day 22 实现后升版）：
// - GET    成功：HTTP 200 + UserRating[]（空评分 = []）
// - PUT    成功：HTTP 200 + 落库后的 UserRating（新建/更新都用 200）
// - DELETE 成功：HTTP 204 无 body
// - 失败：HTTP 4xx/5xx + { error: { code, message } }
//
// foodId 的取值（沿用 Day 18 favorites 已验证的模式）：
// 1) 路径参数：PUT /api/ratings/<foodId> —— 网关绑定 /api/ratings 后会把
//    前缀剥掉，事件里 path 只剩 '/f001'，取最后一个非空段即 foodId
// 2) 请求体：PUT /api/ratings + {"foodId":"f001"}（兼容写法）
// 3) 控制台直接调用：{"userId":"...","foodId":"f001"}

const repository = require('./ratingsRepository');

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
  console.error('[ratings] 未预期的错误:', err && err.message);
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

// 解析请求体（PUT 用）。返回值三种：undefined（没请求体，PUT 必须有 score，没有 → 报错）
// / 对象（解析成功）/ null（请求体不是合法 JSON）
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

// 从三种来源里找 foodId（见文件头注释）。
// GET 用不到，但放在这里保持和 favorites 一致
function extractFoodId(event, body) {
  const rawPath = (event && typeof event.path === 'string' && event.path) || '';
  const segments = rawPath.split('/').filter(function (s) { return s.length > 0; });
  const lastSeg = segments[segments.length - 1];
  if (lastSeg !== undefined && lastSeg !== 'api' && lastSeg !== 'ratings') {
    return decodeURIComponent(lastSeg);
  }
  if (body && typeof body.foodId === 'string' && body.foodId.length > 0) return body.foodId;
  if (event && typeof event.foodId === 'string' && event.foodId.length > 0) return event.foodId;
  return undefined;
}

// 判断控制台直接调用的方法（公网调用由 httpMethod 决定）。
// 规则：有 score/foodId 字段 → PUT；有 foodId 没 score → DELETE；其他 → GET
function consoleMethod(event) {
  if (event && typeof event.foodId === 'string' && typeof event.score === 'number') return 'PUT';
  if (event && typeof event.foodId === 'string') return 'DELETE';
  return 'GET';
}

exports.main = async function (event, context) {
  const isHttpCall = Boolean(event && event.httpMethod);
  const method = isHttpCall
    ? String(event.httpMethod).toUpperCase()
    : consoleMethod(event);

  if (isHttpCall && method !== 'GET' && method !== 'PUT' && method !== 'DELETE') {
    return httpJson(405, { error: { code: 'METHOD_NOT_ALLOWED', message: '本接口只支持 GET / PUT / DELETE' } });
  }

  // 匿名用户方案（Day 16 拍板）：前端生成 UUID，放在 X-User-Id 请求头里
  const userId = isHttpCall ? getHeader(event, 'X-User-Id') : event.userId;

  if (typeof userId !== 'string' || userId.length === 0 || userId.length > 64) {
    return httpJson(400, { error: { code: 'BAD_REQUEST', message: '缺少有效的 X-User-Id 请求头' } });
  }

  // 数据库凭据自检（API Key 在仓库层环境变量里读），位置与 favorites 一致
  try {
    repository.assertConfigured();
  } catch (err) {
    return repoErrorToResponse(err);
  }

  // ---------- GET：读取当前用户全部评分（接口 #4） ----------
  if (method === 'GET') {
    try {
      const data = await repository.listByUser(userId);
      return isHttpCall ? httpJson(200, data) : data;
    } catch (err) {
      return repoErrorToResponse(err);
    }
  }

  // ---------- 解析路径参数 foodId（PUT 和 DELETE 共用） ----------
  const body = isHttpCall ? parseBody(event) : event;
  if (isHttpCall && body === null) {
    return httpJson(400, { error: { code: 'BAD_REQUEST', message: '请求体不是合法的 JSON' } });
  }

  const foodId = extractFoodId(event, body);
  if (foodId === undefined) {
    return httpJson(400, {
      error: { code: 'BAD_REQUEST', message: '缺少 foodId：请在路径里带（/api/ratings/f001）或在请求体里传 {"foodId":"f001"}' },
    });
  }
  if (foodId.length > 64) {
    return httpJson(400, { error: { code: 'BAD_REQUEST', message: 'foodId 不能超过 64 个字符' } });
  }

  // ---------- DELETE：取消评分（接口 #6） ----------
  if (method === 'DELETE') {
    try {
      // 不预查 foodExists：删一个不存在的评分要返回 404，但「没评过」和「菜不存在」
      // 都属于「无此评分」，404 中文文案统一用「无此评分」即可（与契约一致）。
      const deleted = await repository.deleteOne(userId, foodId);
      if (!deleted) {
        console.log('[ratings] DELETE 拒绝：userId=' + userId + ' foodId=' + foodId + '（无此评分）');
        return httpJson(404, { error: { code: 'NOT_FOUND', message: '无此评分：' + foodId } });
      }
      console.log('[ratings] DELETE 成功：userId=' + userId + ' foodId=' + foodId);
      return isHttpCall ? httpJson(204, '') : { deleted: true };
    } catch (err) {
      return repoErrorToResponse(err);
    }
  }

  // ---------- PUT：写入 / 修改一条评分（接口 #5） ----------
  if (isHttpCall && body === undefined) {
    return httpJson(400, { error: { code: 'BAD_REQUEST', message: 'PUT 请求需要 JSON 请求体，至少包含 score 字段' } });
  }

  const score = body && body.score;
  if (typeof score !== 'number' || !Number.isInteger(score) || score < 1 || score > 5) {
    return httpJson(400, { error: { code: 'BAD_REQUEST', message: 'score 必须是 1~5 的整数' } });
  }

  try {
    // 第 1 步：校验这道菜存在（外键预查，提前查出能返回更准确的 404）
    if (!(await repository.foodExists(foodId))) {
      console.log('[ratings] PUT 拒绝：userId=' + userId + ' foodId=' + foodId + '（食物不存在）');
      return httpJson(404, { error: { code: 'NOT_FOUND', message: '食物不存在：' + foodId } });
    }

    // 第 2 步：upsert（覆盖写语义，新建/更新都用 200）
    const result = await repository.upsert(userId, foodId, score);
    console.log(
      result.created
        ? '[ratings] PUT 成功(新建)：userId=' + userId + ' foodId=' + foodId + ' score=' + score
        : '[ratings] PUT 成功(更新)：userId=' + userId + ' foodId=' + foodId + ' score=' + score
    );
    return isHttpCall ? httpJson(200, result.record) : result.record;
  } catch (err) {
    return repoErrorToResponse(err);
  }
};