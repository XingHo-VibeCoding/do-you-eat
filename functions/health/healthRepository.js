// health_profiles + daily_logs 两张表的数据访问层（Repository）—— Day 29 新建
//
// 职责边界：只负责「怎么查 / 怎么写这两张表」；
// 接口层（index.js）只管接请求、校验、包 HTTP 响应，不认识 PostgREST。
// 与 favorites/ratings/foods 是同一套模式（RepoError 每个函数目录各有一份：
// CloudBase 每个函数目录独立打包，公共文件部署后 require 不到，不能共享）。
//
// 本仓库管两张表：
// - health_profiles（一人一份档案）：getProfile / upsertProfile / deleteProfile
// - daily_logs（一人一天一条记录）：listLogs / findLog / upsertLog / deleteLog
//
// 数据链路：云函数 → PostgREST REST API → CloudBase PG。
// API Key（service_role）只从环境变量读，绝不进代码、不进提交。

const ENV_ID = 'doyoueat-d5g36rg7ia785b553';
const REST_BASE = 'https://' + ENV_ID + '.api.tcloudbasegateway.com/v1/rdb/rest';

// 仓库层错误：带 HTTP 状态码 + 契约错误码，接口层接住后原样转成 HTTP 响应
class RepoError extends Error {
  constructor(status, code, message) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

function authHeaders() {
  const apiKey = process.env.CLOUDBASE_API_KEY;
  if (!apiKey) {
    throw new RepoError(500, 'INTERNAL', 'CLOUDBASE_API_KEY 未配置，请在控制台函数环境变量中配置');
  }
  return { Authorization: 'Bearer ' + apiKey, Accept: 'application/json' };
}

function assertConfigured() {
  authHeaders();
}

async function toRepoError(res, fallbackMessage) {
  console.error('[healthRepository] REST API 状态码 ' + res.status + '：' + (await res.text()).slice(0, 300));
  const message = res.status === 401 || res.status === 403 ? 'API Key 无效或未授权' : fallbackMessage;
  return new RepoError(500, 'INTERNAL', message);
}

function wrapUnexpected(err, message) {
  if (err instanceof RepoError) return err;
  console.error('[healthRepository] 请求失败:', err.message);
  return new RepoError(500, 'INTERNAL', message);
}

// ---------------------------------------------------------------
// health_profiles（档案，一人一份）
// ---------------------------------------------------------------

// 读取档案（GET /api/health/profile 用）。
// 返回档案对象或 null（没填过 → null，接口层据此返回 200 + null，不是 404）
async function getProfile(userId) {
  try {
    const url =
      REST_BASE +
      '/health_profiles?select=*&userId=eq.' +
      encodeURIComponent(userId);
    const res = await fetch(url, { headers: authHeaders() });
    if (!res.ok) throw await toRepoError(res, '数据库查询失败');
    const rows = await res.json();
    return rows.length > 0 ? rows[0] : null;
  } catch (err) {
    throw wrapUnexpected(err, '数据库查询失败');
  }
}

// 写入 / 覆盖档案（PUT 用）。档案是整体替换，不做字段级合并。
// 返回落库后的完整档案（updatedAt 由后端时钟写）
async function upsertProfile(userId, input) {
  const nowIso = new Date().toISOString();
  const headers = Object.assign({}, authHeaders(), {
    'Content-Type': 'application/json',
    Prefer: 'return=representation',
  });
  const payload = {
    userId: userId,
    heightCm: input.heightCm,
    weightKg: input.weightKg,
    age: input.age,
    updatedAt: nowIso,
  };

  try {
    const existing = await getProfile(userId);

    if (existing === null) {
      const res = await fetch(REST_BASE + '/health_profiles', {
        method: 'POST',
        headers: headers,
        body: JSON.stringify(payload),
      });
      if (!res.ok) throw await toRepoError(res, '数据库写入失败');
      const rows = await res.json();
      return { record: rows[0], created: true };
    }

    const url =
      REST_BASE + '/health_profiles?userId=eq.' + encodeURIComponent(userId);
    const res = await fetch(url, {
      method: 'PATCH',
      headers: headers,
      // updatedAt 也要更新（档案被改过）；userId 是过滤条件不能再写
      body: JSON.stringify({
        heightCm: input.heightCm,
        weightKg: input.weightKg,
        age: input.age,
        updatedAt: nowIso,
      }),
    });
    if (!res.ok) throw await toRepoError(res, '数据库写入失败');
    const rows = await res.json();
    return { record: rows[0], created: false };
  } catch (err) {
    throw wrapUnexpected(err, '数据库写入失败');
  }
}

// 删除档案（DELETE 用）。返回 true 删到 / false 本来就没有。
// 接口层对两种情况都返回 204（契约 #12 幂等）
async function deleteProfile(userId) {
  try {
    const url =
      REST_BASE + '/health_profiles?userId=eq.' + encodeURIComponent(userId);
    const res = await fetch(url, {
      method: 'DELETE',
      headers: Object.assign({}, authHeaders(), { Prefer: 'return=representation' }),
    });
    if (!res.ok) throw await toRepoError(res, '数据库删除失败');
    const rows = await res.json();
    return Array.isArray(rows) && rows.length > 0;
  } catch (err) {
    throw wrapUnexpected(err, '数据库删除失败');
  }
}

// ---------------------------------------------------------------
// daily_logs（每日记录，一人一天一条）
// ---------------------------------------------------------------

// 取最近 N 天（GET /api/health/logs?days=30 用）。
// date 是 'YYYY-MM-DD' 字符串，字典序 = 时间序，可以直接用 gte 比较。
async function listLogs(userId, days) {
  const since = new Date(Date.now() - (days - 1) * 86400000).toISOString().slice(0, 10);
  try {
    const url =
      REST_BASE +
      '/daily_logs?select=*&userId=eq.' +
      encodeURIComponent(userId) +
      '&date=gte.' +
      encodeURIComponent(since) +
      '&order=date.asc';
    const res = await fetch(url, { headers: authHeaders() });
    if (!res.ok) throw await toRepoError(res, '数据库查询失败');
    return await res.json();
  } catch (err) {
    throw wrapUnexpected(err, '数据库查询失败');
  }
}

// 查某一天的记录（PUT 前判断是新建还是更新）。
// 返回行数组（长度 0 或 1），不在仓库层做空判断
async function findLog(userId, date) {
  try {
    const url =
      REST_BASE +
      '/daily_logs?select=*&userId=eq.' +
      encodeURIComponent(userId) +
      '&date=eq.' +
      encodeURIComponent(date);
    const res = await fetch(url, { headers: authHeaders() });
    if (!res.ok) throw await toRepoError(res, '数据库查询失败');
    return await res.json();
  } catch (err) {
    throw wrapUnexpected(err, '数据库查询失败');
  }
}

// 写某一天的记录（PUT /api/health/logs/:date 用）。
// 语义是「字段级 upsert」：patch 里有的字段覆盖，没有的保留原值。
// 这是刻意与档案的整体覆盖不同的——用户早上记体重、晚上补饮食是正常用法，
// 整体覆盖会把早上的体重抹掉。
// createdAt 只在新建时写，更新时不动（它是「这条记录什么时候建的」）
async function upsertLog(userId, date, patch) {
  const nowIso = new Date().toISOString();
  const headers = Object.assign({}, authHeaders(), {
    'Content-Type': 'application/json',
    Prefer: 'return=representation',
  });

  try {
    const existRows = await findLog(userId, date);

    if (existRows.length === 0) {
      const res = await fetch(REST_BASE + '/daily_logs', {
        method: 'POST',
        headers: headers,
        body: JSON.stringify(
          Object.assign({ userId: userId, date: date, createdAt: nowIso }, patch),
        ),
      });
      if (!res.ok) throw await toRepoError(res, '数据库写入失败');
      const rows = await res.json();
      return { record: rows[0], created: true };
    }

    const url =
      REST_BASE +
      '/daily_logs?userId=eq.' +
      encodeURIComponent(userId) +
      '&date=eq.' +
      encodeURIComponent(date);
    const res = await fetch(url, {
      method: 'PATCH',
      headers: headers,
      body: JSON.stringify(patch),
    });
    if (!res.ok) throw await toRepoError(res, '数据库写入失败');
    const rows = await res.json();
    return { record: rows[0], created: false };
  } catch (err) {
    throw wrapUnexpected(err, '数据库写入失败');
  }
}

// 删某一天的记录。返回 true 删到 / false 本来就没有（接口层据此 204/404）
async function deleteLog(userId, date) {
  try {
    const url =
      REST_BASE +
      '/daily_logs?userId=eq.' +
      encodeURIComponent(userId) +
      '&date=eq.' +
      encodeURIComponent(date);
    const res = await fetch(url, {
      method: 'DELETE',
      headers: Object.assign({}, authHeaders(), { Prefer: 'return=representation' }),
    });
    if (!res.ok) throw await toRepoError(res, '数据库删除失败');
    const rows = await res.json();
    return Array.isArray(rows) && rows.length > 0;
  } catch (err) {
    throw wrapUnexpected(err, '数据库删除失败');
  }
}

module.exports = {
  RepoError,
  assertConfigured,
  getProfile,
  upsertProfile,
  deleteProfile,
  listLogs,
  findLog,
  upsertLog,
  deleteLog,
};
