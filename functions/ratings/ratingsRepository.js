// ratings 表的数据访问层（Repository）—— Day 22 从零新建
// 职责边界：本文件只负责「怎么查 / 怎么写 ratings 表」；
// 接口层（index.js）只管接请求、校验、包 HTTP 响应，不认识 PostgREST。
// 与 favorites/favoritesRepository.js 是同一个模式（RepoError 在每个函数里各有一份：
// CloudBase 每个函数目录独立打包，公共文件部署后 require 不到，不能共享）。
//
// 本仓库管的表：
// - ratings：按用户查全部、按 (userId, foodId) 查单条、upsert（写入/修改）、删一条
// - foods（只读一条）：外键预查用。ratings.foodId 外键指向 foods.id，
//   PUT 时提前查一下能返回更准确的 404，而不是让 INSERT 撞外键报 500。
//
// 数据链路（Day 17 定稿）：云函数 → PostgREST 风格 REST API → CloudBase PG。
// 体验版共享集群不给 PG 直连地址，所以走 HTTP 而不是 pg 库。
// API Key（service_role）只从环境变量读，绝不进代码、不进提交。
//
// 对外暴露六个成员（查询/写函数返回业务数据，失败抛 RepoError）：
// - assertConfigured()      环境自检：API Key 没配直接报错
// - listByUser()            查某用户的全部评分 UserRating[]（升序）
// - findOne()               查某用户对某道菜的评分（没有返 null）
// - upsert()                写入/修改一条评分（先查后写，覆盖语义）
//   返回 { record, created }：record=落库后的 UserRating，
//   created=true 表示新建、false 表示更新（接口层据此决定 201/200）
// - deleteOne()             删除一条；返回 true 表示删了，false 表示没找到
// - foodExists()            foods 表里有没有这道菜（外键预查）

// 环境资源地址：REST API 网关域名 = 环境ID + 固定后缀（非机密，官网地址里本来就带）
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

// 认证头。Key 没配属于环境问题（500），在这里就报出来
function authHeaders() {
  const apiKey = process.env.CLOUDBASE_API_KEY;
  if (!apiKey) {
    throw new RepoError(500, 'INTERNAL', 'CLOUDBASE_API_KEY 未配置，请在控制台函数环境变量中配置');
  }
  return { Authorization: 'Bearer ' + apiKey, Accept: 'application/json' };
}

// 环境自检：让接口层在校验完请求之后、查库之前发现 Key 没配（与 favorites/foods 保持一致）
function assertConfigured() {
  authHeaders();
}

// 把 PostgREST 的非 2xx 响应统一翻译成 RepoError
async function toRepoError(res, fallbackMessage) {
  console.error('[ratingsRepository] REST API 状态码 ' + res.status + '：' + (await res.text()).slice(0, 300));
  const message = res.status === 401 || res.status === 403 ? 'API Key 无效或未授权' : fallbackMessage;
  return new RepoError(500, 'INTERNAL', message);
}

// 仓库层的兜底包装：网络异常等非预期错误统一转成 RepoError，不让原始异常漏到接口层
function wrapUnexpected(err, message) {
  if (err instanceof RepoError) return err;
  console.error('[ratingsRepository] 请求失败:', err.message);
  return new RepoError(500, 'INTERNAL', message);
}

// 查某用户的全部评分（GET /api/ratings 用）。
// PostgREST 过滤：userId=eq.<值>。值先 encodeURIComponent 再拼 URL；
// PostgREST 内部会把过滤条件转成参数化 SQL 执行——值永远只当数据，不当 SQL 代码（防注入）。
// REST 返回 UserRating 行数组
async function listByUser(userId) {
  try {
    const url =
      REST_BASE +
      '/ratings?select=*&userId=eq.' +
      encodeURIComponent(userId) +
      '&order=foodId.asc';

    const res = await fetch(url, { headers: authHeaders() });
    if (!res.ok) throw await toRepoError(res, '数据库查询失败');
    return await res.json();
  } catch (err) {
    throw wrapUnexpected(err, '数据库查询失败');
  }
}

// 查某用户对某道菜的评分（PUT upsert 前用）。
// 返回单条行数组（长度 0 或 1），不要在仓库层做空判断，交给接口层
async function findOne(userId, foodId) {
  try {
    const url =
      REST_BASE +
      '/ratings?select=*&userId=eq.' +
      encodeURIComponent(userId) +
      '&foodId=eq.' +
      encodeURIComponent(foodId);

    const res = await fetch(url, { headers: authHeaders() });
    if (!res.ok) throw await toRepoError(res, '数据库查询失败');
    return await res.json();
  } catch (err) {
    throw wrapUnexpected(err, '数据库查询失败');
  }
}

// 写入 / 修改一条评分（PUT /api/ratings/:foodId 用，覆盖写语义）。
// 流程：先 findOne 判断是新建还是更新。
// 新建走 POST + Prefer: return=representation（拿到落库后的行）；
// 更新走 PATCH（同上 Prefer），过滤条件 (userId, foodId) 复合主键。
// 返回 { record, created }，接口层据此选 201/200 + 决定要不要打日志。
async function upsert(userId, foodId, score) {
  const nowIso = new Date().toISOString();
  const headers = Object.assign({}, authHeaders(), {
    'Content-Type': 'application/json',
    Prefer: 'return=representation',
  });

  try {
    const existRows = await findOne(userId, foodId);

    if (existRows.length === 0) {
      // 新建
      const res = await fetch(REST_BASE + '/ratings', {
        method: 'POST',
        headers: headers,
        body: JSON.stringify({ userId: userId, foodId: foodId, score: score, updatedAt: nowIso }),
      });
      if (!res.ok) throw await toRepoError(res, '数据库写入失败');
      const rows = await res.json();
      return { record: rows[0], created: true };
    }

    // 更新（覆盖写，更新 updatedAt 由后端时钟）
    const url =
      REST_BASE +
      '/ratings?userId=eq.' +
      encodeURIComponent(userId) +
      '&foodId=eq.' +
      encodeURIComponent(foodId);
    const res = await fetch(url, {
      method: 'PATCH',
      headers: headers,
      body: JSON.stringify({ score: score, updatedAt: nowIso }),
    });
    if (!res.ok) throw await toRepoError(res, '数据库写入失败');
    const rows = await res.json();
    return { record: rows[0], created: false };
  } catch (err) {
    throw wrapUnexpected(err, '数据库写入失败');
  }
}

// 删除一条评分（DELETE /api/ratings/:foodId 用）。
// 返回 true 表示删了，false 表示本来就没这条（接口层据此选 204/404）
async function deleteOne(userId, foodId) {
  try {
    const url =
      REST_BASE +
      '/ratings?userId=eq.' +
      encodeURIComponent(userId) +
      '&foodId=eq.' +
      encodeURIComponent(foodId);

    const res = await fetch(url, {
      method: 'DELETE',
      headers: Object.assign({}, authHeaders(), { Prefer: 'return=representation' }),
    });
    if (!res.ok) throw await toRepoError(res, '数据库删除失败');

    // return=representation 会返回被删的行数组；空数组 = 没删到任何东西
    const rows = await res.json();
    return Array.isArray(rows) && rows.length > 0;
  } catch (err) {
    throw wrapUnexpected(err, '数据库删除失败');
  }
}

// foods 表外键预查：这道菜存不存在（PUT /api/ratings/:foodId 用）。
// 提前查一下能返回更准确的 404，而不是让 INSERT 撞外键报 500。
async function foodExists(foodId) {
  try {
    const res = await fetch(REST_BASE + '/foods?select=id&id=eq.' + encodeURIComponent(foodId), {
      headers: authHeaders(),
    });
    if (!res.ok) throw await toRepoError(res, '数据库查询失败');
    const rows = await res.json();
    return rows.length > 0;
  } catch (err) {
    throw wrapUnexpected(err, '数据库查询失败');
  }
}

module.exports = {
  RepoError,
  assertConfigured,
  listByUser,
  findOne,
  upsert,
  deleteOne,
  foodExists,
};