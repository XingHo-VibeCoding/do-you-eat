// favorites 表的数据访问层（Repository）—— Day 19 从 index.js 拆出
// 职责边界：本文件只负责「怎么查 / 怎么写 favorites 表」；
// 接口层（index.js）只管接请求、校验、包 HTTP 响应，不认识 PostgREST。
// 与 foods/foodsRepository.js 是同一个模式（RepoError 在两个函数里各有一份：
// CloudBase 每个函数目录独立打包，公共文件部署后 require 不到，不能共享）。
//
// 本仓库管的表：
// - favorites：按用户查收藏、查单条、插入
// - foods（只读一条）：外键预查用。favorites.foodId 外键指向 foods.id，
//   提前查一下能返回更准确的 404，而不是让插入撞外键报 500。
//
// 数据链路（Day 17 定稿）：云函数 → PostgREST 风格 REST API → CloudBase PG。
// 体验版共享集群不给 PG 直连地址，所以走 HTTP 而不是 pg 库。
// API Key（service_role）只从环境变量读，绝不进代码、不进提交。
//
// 对外暴露五个成员（查询函数返回业务数据，失败抛 RepoError）：
// - assertConfigured()      环境自检：API Key 没配直接报错
// - listFoodIdsByUser()     查某用户的全部收藏 foodId（升序，已剥壳成字符串数组）
// - foodExists()            foods 表里有没有这道菜（外键预查）
// - findFavorite()          查某用户是否已收藏某道菜
// - insertFavorite()        插入一条收藏。返回 'inserted'（新插入）
//                           或 'duplicate'（并发撞复合主键），怎么响应由接口层定

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

// 环境自检：让接口层在校验完请求之后、查库之前发现 Key 没配（保持重构前的报错时序）
function assertConfigured() {
  authHeaders();
}

// 把 PostgREST 的非 2xx 响应统一翻译成 RepoError（Day 17/18 的报错文案原样保留）
async function toRepoError(res, fallbackMessage) {
  console.error('[favoritesRepository] REST API 状态码 ' + res.status + '：' + (await res.text()).slice(0, 300));
  const message = res.status === 401 || res.status === 403 ? 'API Key 无效或未授权' : fallbackMessage;
  return new RepoError(500, 'INTERNAL', message);
}

// 仓库层的兜底包装：网络异常等非预期错误统一转成 RepoError，不让原始异常漏到接口层
function wrapUnexpected(err, message) {
  if (err instanceof RepoError) return err;
  console.error('[favoritesRepository] 请求失败:', err.message);
  return new RepoError(500, 'INTERNAL', message);
}

// 查某用户的全部收藏（GET /api/favorites 用）。
// PostgREST 过滤：userId=eq.<值>。值先 encodeURIComponent 再拼 URL；
// PostgREST 内部会把过滤条件转成参数化 SQL 执行——值永远只当数据，不当 SQL 代码（防注入）。
// REST 返回 [{ foodId: 'f001' }, ...]，在这里剥壳成 ['f001', ...]
async function listFoodIdsByUser(userId) {
  try {
    const url =
      REST_BASE +
      '/favorites?select=foodId&userId=eq.' +
      encodeURIComponent(userId) +
      '&order=foodId.asc';

    const res = await fetch(url, { headers: authHeaders() });
    if (!res.ok) throw await toRepoError(res, '数据库查询失败');
    const rows = await res.json();
    return rows.map((row) => row.foodId);
  } catch (err) {
    throw wrapUnexpected(err, '数据库查询失败');
  }
}

// foods 表外键预查：这道菜存不存在（POST /api/favorites 用）
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

// 查某用户是否已收藏某道菜。返回行数组；「已收藏算不算重复」的判断留在接口层
async function findFavorite(userId, foodId) {
  try {
    const url =
      REST_BASE +
      '/favorites?select=foodId&userId=eq.' +
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

// 插入一条收藏（POST /api/favorites 用）。Prefer: return=representation 返回落库后的行。
// 返回 'inserted'（新插入）或 'duplicate'（并发兜底：两个相同请求同时穿过
// findFavorite 的检查，后到的撞了复合主键 409）。
// 「撞 409 也返回 201 幂等」是 Day 16 拍板的接口约定，归接口层处理，这里只报事实。
async function insertFavorite(userId, foodId) {
  try {
    const res = await fetch(REST_BASE + '/favorites', {
      method: 'POST',
      headers: Object.assign({}, authHeaders(), {
        'Content-Type': 'application/json',
        Prefer: 'return=representation',
      }),
      body: JSON.stringify({ userId: userId, foodId: foodId }),
    });

    if (res.status === 409) return 'duplicate';
    if (!res.ok) throw await toRepoError(res, '数据库写入失败');
    return 'inserted';
  } catch (err) {
    throw wrapUnexpected(err, '数据库写入失败');
  }
}

module.exports = { RepoError, assertConfigured, listFoodIdsByUser, foodExists, findFavorite, insertFavorite };
