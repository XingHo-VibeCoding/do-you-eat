// 云函数：health —— 健康检查 + 健康档案（#10-#12）+ 每日记录（#13-#15）
//
// Day 15 建本函数时只有健康检查一个分支（GET /api/health）。
// Day 29 起这里变成三合一的路由分派器。
//
// 【为什么三个功能挤在一个函数里】
// 2026-10-24 实测：HTTP 网关的 /api/health 是**前缀路由**——
//   GET /api/health/profile → 200 {"ok":true,"service":"do you eat"}
// 说明 /api/health/<任意子路径> 都会被送进本函数。既然入口已经在这里，
// 就把档案和每日记录也接进来，用户**不用再去控制台绑任何新路由**。
// 代价是一个函数承担三件事，所以本文件必须严格按子路径分派、每个分支独立。
//
// 【网关剥前缀】（沿用 Day 18 在 ratings/favorites 上验证过的行为）
// 绑 /api/health 后，event.path 只剩子路径：
//   /api/health            → '/' 或 ''
//   /api/health/profile    → '/profile'
//   /api/health/logs       → '/logs'
//   /api/health/logs/2026-10-24 → '/logs/2026-10-24'
// 下面 parseSegments() 做一次剥前缀 + 分段，后面全部按段走。
//
// 返回形状（契约 v1.7）：
// - 健康检查：200 { ok, service }（不需要 X-User-Id，用于探活）
// - #10 GET  profile：200 + 档案 或 200 + null
// - #11 PUT  profile：200 + 档案
// - #12 DELETE profile：204（没档案也 204，幂等）
// - #13 GET  logs：200 + DailyLog[]
// - #14 PUT  logs/:date：200 + 完整记录
// - #15 DELETE logs/:date：204 / 404
// - 失败：4xx/5xx + { error: { code, message } }

const repository = require('./healthRepository');

const HEALTH_PAYLOAD = { ok: true, service: 'do you eat' };

// 契约里登记的各接口允许的方法。本函数不支持 POST（写一律用 PUT 的 upsert 语义）
const ALLOWED_METHODS = ['GET', 'PUT', 'DELETE'];

function httpJson(statusCode, payload) {
  return {
    statusCode,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  };
}

function repoErrorToResponse(err) {
  if (err instanceof repository.RepoError) {
    return httpJson(err.status, { error: { code: err.code, message: err.message } });
  }
  console.error('[health] 未预期的错误:', err && err.message);
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

// 把 event.path 拆成干净的段。
// 1) 先切掉 '?' 后面的查询串（查询串单独用 getQuery 解析）
// 2) 去掉可能残留的前缀段（api / health），兼容不同网关版本
function parseSegments(event) {
  const rawPath = (event && typeof event.path === 'string' && event.path) || '';
  const pathOnly = rawPath.split('?')[0];
  const all = pathOnly.split('/').filter(function (s) { return s.length > 0; });
  const start = all.findIndex(function (s) { return s !== 'api' && s !== 'health'; });
  return start === -1 ? [] : all.slice(start);
}

// 取查询参数（?days=30）。三种来源都兼容：
// 网关的 queryStringParameters / query 对象，以及 path 里残留的 '?days=30'
function getQuery(event) {
  const out = {};
  const direct = (event && event.queryStringParameters) || (event && event.query);
  if (direct && typeof direct === 'object') {
    Object.keys(direct).forEach(function (k) { out[k] = direct[k]; });
  }
  const rawPath = (event && typeof event.path === 'string' && event.path) || '';
  const qs = rawPath.split('?')[1];
  if (qs) {
    new URLSearchParams(qs).forEach(function (v, k) { out[k] = v; });
  }
  return out;
}

// 解析请求体。返回 undefined（没有）/ 对象（成功）/ null（不是合法 JSON 对象）
function parseBody(event) {
  const raw = event && event.body;
  if (raw === undefined || raw === null || raw === '') return undefined;
  if (typeof raw === 'object') return raw;
  if (typeof raw !== 'string') return null;
  try {
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : null;
  } catch (e) {
    return null;
  }
}

// 数字校验：必须是有限数字且在区间内
function readNumber(value, min, max, allowFloat) {
  if (typeof value !== 'number' || !Number.isFinite(value)) return null;
  if (!allowFloat && !Number.isInteger(value)) return null;
  if (value < min || value > max) return null;
  return value;
}

// 控制台直接调用时没有 httpMethod，用 op 字段分派。
// 没给 op 就当健康检查（保持 Day 15 起的行为，控制台点一下就能看函数活着）
function consoleOp(event) {
  if (event && typeof event.op === 'string') return event.op;
  return 'health.check';
}

exports.main = async function (event, context) {
  const isHttpCall = Boolean(event && event.httpMethod);

  // ---------- 0. 健康检查分支（不需要 X-User-Id，最先处理） ----------
  // 探活要能在没有身份头的情况下工作，否则 scripts/verify.sh 的第一步就红
  const op = isHttpCall ? null : consoleOp(event);
  if (!isHttpCall && op === 'health.check') {
    return HEALTH_PAYLOAD;
  }

  const method = isHttpCall ? String(event.httpMethod).toUpperCase() : null;
  if (isHttpCall && ALLOWED_METHODS.indexOf(method) === -1) {
    return httpJson(405, {
      error: { code: 'METHOD_NOT_ALLOWED', message: '本接口只支持 GET / PUT / DELETE' },
    });
  }

  const segments = isHttpCall ? parseSegments(event) : (String(op).split('.')[0] === 'logs' ? ['logs'] : ['profile']);
  const resource = segments.length === 0 ? 'health' : segments[0];

  // ---------- 1. 健康检查（路径为空） ----------
  if (resource === 'health') {
    if (method !== null && method !== 'GET') {
      return httpJson(405, { error: { code: 'METHOD_NOT_ALLOWED', message: '健康检查只支持 GET' } });
    }
    return httpJson(200, HEALTH_PAYLOAD);
  }

  // 走到这里说明要动用户数据，必须有身份
  const userId = isHttpCall ? getHeader(event, 'X-User-Id') : event.userId;
  if (typeof userId !== 'string' || userId.length === 0 || userId.length > 64) {
    return httpJson(400, { error: { code: 'BAD_REQUEST', message: '缺少有效的 X-User-Id 请求头' } });
  }

  if (resource !== 'profile' && resource !== 'logs') {
    return httpJson(404, { error: { code: 'NOT_FOUND', message: '未知的资源：' + resource } });
  }

  // 数据库凭据自检（API Key 在仓库层环境变量里读）
  try {
    repository.assertConfigured();
  } catch (err) {
    return repoErrorToResponse(err);
  }

  const body = isHttpCall ? parseBody(event) : event;
  if (isHttpCall && body === null) {
    return httpJson(400, { error: { code: 'BAD_REQUEST', message: '请求体不是合法的 JSON' } });
  }

  // ===============================================================
  // 档案 health_profiles（#10 / #11 / #12）
  // ===============================================================
  if (resource === 'profile') {
    // ---- #10 GET：读取档案 ----
    if (method === 'GET' || op === 'profile.get') {
      try {
        const profile = await repository.getProfile(userId);
        // 没填过 → 200 + null（与前端 getHealth 返回 null 的约定一致，不是 404）
        return isHttpCall ? httpJson(200, profile) : profile;
      } catch (err) {
        return repoErrorToResponse(err);
      }
    }

    // ---- #12 DELETE：清空档案（幂等 204） ----
    if (method === 'DELETE' || op === 'profile.delete') {
      try {
        await repository.deleteProfile(userId);
        return isHttpCall ? httpJson(204, '') : { deleted: true };
      } catch (err) {
        return repoErrorToResponse(err);
      }
    }

    // ---- #11 PUT：保存档案（三个字段必须给全，整体覆盖） ----
    if (isHttpCall && body === undefined) {
      return httpJson(400, {
        error: { code: 'BAD_REQUEST', message: 'PUT 请求需要 JSON 请求体，包含身高、体重、年龄' },
      });
    }

    const heightCm = readNumber(body && body.heightCm, 50, 250, false);
    const weightKg = readNumber(body && body.weightKg, 10, 300, true);
    const age = readNumber(body && body.age, 1, 150, false);

    if (heightCm === null) {
      return httpJson(400, { error: { code: 'BAD_REQUEST', message: '身高请填 50~250 之间的数字（cm）' } });
    }
    if (weightKg === null) {
      return httpJson(400, { error: { code: 'BAD_REQUEST', message: '体重请填 10~300 之间的数字（kg）' } });
    }
    if (age === null) {
      return httpJson(400, { error: { code: 'BAD_REQUEST', message: '年龄请填 1~150 之间的数字' } });
    }

    try {
      const result = await repository.upsertProfile(userId, { heightCm, weightKg, age });
      console.log(
        '[health] 档案' +
          (result.created ? '新建' : '更新') +
          '：userId=' + userId +
          ' h=' + heightCm + ' w=' + weightKg + ' age=' + age,
      );
      return isHttpCall ? httpJson(200, result.record) : result.record;
    } catch (err) {
      return repoErrorToResponse(err);
    }
  }

  // ===============================================================
  // 每日记录 daily_logs（#13 / #14 / #15）
  // ===============================================================

  // ---- #13 GET：读最近 N 天 ----
  if (method === 'GET' || op === 'logs.get') {
    const query = getQuery(event);
    let days = 30;
    if (query.days !== undefined && query.days !== '') {
      const parsed = Number.parseInt(String(query.days), 10);
      if (!Number.isInteger(parsed) || parsed < 1) {
        return httpJson(400, { error: { code: 'BAD_REQUEST', message: 'days 必须是 1~365 的整数' } });
      }
      days = Math.min(parsed, 365);
    }
    try {
      const rows = await repository.listLogs(userId, days);
      return isHttpCall ? httpJson(200, rows) : rows;
    } catch (err) {
      return repoErrorToResponse(err);
    }
  }

  // PUT / DELETE 都要日期。来源：路径第二优先，其次请求体
  let date = segments.length > 1 ? decodeURIComponent(segments[1]) : null;
  if (date === null && body && typeof body.date === 'string' && body.date.length > 0) {
    date = body.date;
  }
  if (typeof date !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return httpJson(400, { error: { code: 'BAD_REQUEST', message: '日期格式应为 YYYY-MM-DD' } });
  }

  // ---- #15 DELETE：删某一天（删不到 → 404） ----
  if (method === 'DELETE' || op === 'logs.delete') {
    try {
      const deleted = await repository.deleteLog(userId, date);
      if (!deleted) {
        return httpJson(404, { error: { code: 'NOT_FOUND', message: '无此记录：' + date } });
      }
      return isHttpCall ? httpJson(204, '') : { deleted: true };
    } catch (err) {
      return repoErrorToResponse(err);
    }
  }

  // ---- #14 PUT：写某一天（字段级 upsert，只覆盖请求体里出现的字段） ----
  if (isHttpCall && body === undefined) {
    return httpJson(400, { error: { code: 'BAD_REQUEST', message: 'PUT 请求需要 JSON 请求体，至少包含一项数据' } });
  }

  const patch = {};

  if (body.weightKg !== undefined && body.weightKg !== null) {
    const v = readNumber(body.weightKg, 10, 300, true);
    if (v === null) {
      return httpJson(400, { error: { code: 'BAD_REQUEST', message: '体重请填 10~300 之间的数字（kg）' } });
    }
    patch.weightKg = v;
  }
  if (body.sleepHours !== undefined && body.sleepHours !== null) {
    const v = readNumber(body.sleepHours, 0, 24, true);
    if (v === null) {
      return httpJson(400, { error: { code: 'BAD_REQUEST', message: '睡眠时长请填 0~24 之间的数字（小时）' } });
    }
    patch.sleepHours = v;
  }
  if (body.waterMl !== undefined && body.waterMl !== null) {
    const v = readNumber(body.waterMl, 0, 10000, false);
    if (v === null) {
      return httpJson(400, { error: { code: 'BAD_REQUEST', message: '饮水请填 0~10000 之间的整数（ml）' } });
    }
    patch.waterMl = v;
  }
  if (body.mood !== undefined && body.mood !== null) {
    const v = readNumber(body.mood, 1, 5, false);
    if (v === null) {
      return httpJson(400, { error: { code: 'BAD_REQUEST', message: '心情请填 1~5 之间的整数' } });
    }
    patch.mood = v;
  }
  if (body.meals !== undefined && body.meals !== null) {
    if (!Array.isArray(body.meals) || body.meals.length > 20) {
      return httpJson(400, { error: { code: 'BAD_REQUEST', message: '饮食记录需要是不超过 20 项的数组' } });
    }
    const cleaned = body.meals
      .filter(function (m) { return typeof m === 'string' && m.trim().length > 0; })
      .map(function (m) { return m.trim().slice(0, 30); });
    if (cleaned.length > 0) patch.meals = cleaned;
  }
  if (body.note !== undefined && body.note !== null && typeof body.note === 'string') {
    const text = body.note.trim();
    if (text.length > 200) {
      return httpJson(400, { error: { code: 'BAD_REQUEST', message: '备注不能超过 200 个字' } });
    }
    if (text.length > 0) patch.note = text;
  }

  if (Object.keys(patch).length === 0) {
    return httpJson(400, { error: { code: 'BAD_REQUEST', message: '至少要填一项数据' } });
  }

  try {
    const result = await repository.upsertLog(userId, date, patch);
    console.log(
      '[health] 记录' +
        (result.created ? '新建' : '更新') +
        '：userId=' + userId + ' date=' + date +
        ' fields=' + Object.keys(patch).join(','),
    );
    return isHttpCall ? httpJson(200, result.record) : result.record;
  } catch (err) {
    return repoErrorToResponse(err);
  }
};
