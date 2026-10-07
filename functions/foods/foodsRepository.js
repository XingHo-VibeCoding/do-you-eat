// foods 表的数据访问层（Repository）—— Day 19 从 index.js 拆出
// 职责边界：本文件只负责「怎么查 / 怎么写 foods 表」；
// 接口层（index.js）只管接请求、校验、包 HTTP 响应，不认识 PostgREST。
// 这相当于前端 storage.ts 唯一出口在后端的对应物：将来换数据库只改这里。
//
// 数据链路（Day 17 定稿）：云函数 → PostgREST 风格 REST API → CloudBase PG。
// 体验版共享集群不给 PG 直连地址，所以走 HTTP 而不是 pg 库。
// API Key（service_role）只从环境变量读，绝不进代码、不进提交。
//
// 对外暴露四个成员（查询函数全部返回业务数据，失败抛 RepoError）：
// - assertConfigured()    环境自检：API Key 没配直接报错
// - listFoods()           查全部食物，按 id 升序
// - findFoodIdsByName()   按名字查 id 行（「算不算重复」的判断留给接口层）
// - insertFood()          插入一行并返回落库结果（409 撞 id 自动换号重试一次）

// 环境资源地址：REST API 网关域名 = 环境ID + 固定后缀（非机密，官网地址里本来就带）
const ENV_ID = 'doyoueat-d5g36rg7ia785b553';
const REST_BASE = 'https://' + ENV_ID + '.api.tcloudbasegateway.com/v1/rdb/rest';

const crypto = require('crypto');

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

// 环境自检：让接口层在处理请求体之前就能发现 Key 没配（保持重构前的报错时序）
function assertConfigured() {
  authHeaders();
}

// 把 PostgREST 的非 2xx 响应统一翻译成 RepoError（Day 17/18 的报错文案原样保留）
async function toRepoError(res, fallbackMessage) {
  console.error('[foodsRepository] REST API 状态码 ' + res.status + '：' + (await res.text()).slice(0, 300));
  const message = res.status === 401 || res.status === 403 ? 'API Key 无效或未授权' : fallbackMessage;
  return new RepoError(500, 'INTERNAL', message);
}

// 仓库层的兜底包装：网络异常等非预期错误统一转成 RepoError，不让原始异常漏到接口层
function wrapUnexpected(err, message) {
  if (err instanceof RepoError) return err;
  console.error('[foodsRepository] 请求失败:', err.message);
  return new RepoError(500, 'INTERNAL', message);
}

// 用户自建食物的 id：后端生成（契约附录 A），形如 user-a1b2c3d4e5f6
function newFoodId() {
  return 'user-' + crypto.randomUUID().replace(/-/g, '').slice(0, 12);
}

// 查全部食物（GET /api/foods 用）。select=* 按表定义顺序返回全部列，order=id.asc 按 id 升序
async function listFoods() {
  try {
    const res = await fetch(REST_BASE + '/foods?select=*&order=id.asc', { headers: authHeaders() });
    if (!res.ok) throw await toRepoError(res, '数据库查询失败');
    return await res.json();
  } catch (err) {
    throw wrapUnexpected(err, '数据库查询失败');
  }
}

// 按名字查 id 行。返回数组；「同名算不算重复」的判断留在接口层
async function findFoodIdsByName(name) {
  try {
    const res = await fetch(REST_BASE + '/foods?select=id&name=eq.' + encodeURIComponent(name), {
      headers: authHeaders(),
    });
    if (!res.ok) throw await toRepoError(res, '数据库查询失败');
    return await res.json();
  } catch (err) {
    throw wrapUnexpected(err, '数据库查询失败');
  }
}

// 插入一行食物（POST /api/foods 用）。Prefer: return=representation 返回落库后的行。
// 极小概率撞随机 id（PostgREST 回 409）：换一个 id 重试一次，仍失败才算写入失败。
async function insertFood(food) {
  const headers = Object.assign({}, authHeaders(), {
    'Content-Type': 'application/json',
    Prefer: 'return=representation',
  });

  try {
    let res = await fetch(REST_BASE + '/foods', {
      method: 'POST',
      headers: headers,
      body: JSON.stringify(Object.assign({ id: newFoodId() }, food)),
    });

    if (res.status === 409) {
      console.log('[foodsRepository] 随机 id 撞号，换号重试一次');
      res = await fetch(REST_BASE + '/foods', {
        method: 'POST',
        headers: headers,
        body: JSON.stringify(Object.assign({ id: newFoodId() }, food)),
      });
    }

    if (!res.ok) throw await toRepoError(res, '数据库写入失败');
    const rows = await res.json();
    return rows[0];
  } catch (err) {
    throw wrapUnexpected(err, '数据库写入失败');
  }
}

module.exports = { RepoError, assertConfigured, listFoods, findFoodIdsByName, insertFood };
