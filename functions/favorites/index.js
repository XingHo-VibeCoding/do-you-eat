// 云函数：favorites —— GET /api/favorites，返回某用户的收藏列表
// 对应 api-contract.md 接口 #7（读取部分，Day 17 实现）
//
// 数据链路：浏览器 → HTTP 网关(/api/favorites，带 X-User-Id 头) → 本函数
//         → CloudBase PG REST API → 原路返回
//
// 为什么用 REST API 而不是 pg 库直连（Day 17 现场拍板）：
// 体验版（共享集群）不提供数据库内网/外网地址，云函数无法用
// TCP 协议直连 PostgreSQL。官方替代方案是 PostgREST 风格的
// REST API（https://{envId}.api.tcloudbasegateway.com/v1/rdb/rest/{table}），
// 用 API Key（service_role）认证——Key 只配在函数环境变量里，绝不进代码、不进前端。
//
// 返回形状（契约 v1.1）：
// - 成功：HTTP 200 + foodId 字符串数组（如 ["f001","f025"]，空收藏是 []）
// - 失败：HTTP 4xx/5xx + { error: { code, message } }

const ENV_ID = 'doyoueat-d5g36rg7ia785b553';
const REST_BASE = 'https://' + ENV_ID + '.api.tcloudbasegateway.com/v1/rdb/rest';

function httpJson(statusCode, payload) {
  return {
    statusCode,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  };
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

exports.main = async function (event, context) {
  const isHttpCall = Boolean(event && event.httpMethod);

  if (isHttpCall && event.httpMethod !== 'GET') {
    return httpJson(405, { error: { code: 'METHOD_NOT_ALLOWED', message: '本接口只支持 GET' } });
  }

  // 匿名用户方案（Day 16 拍板）：前端生成 UUID，放在 X-User-Id 请求头里
  const userId = isHttpCall ? getHeader(event, 'X-User-Id') : event.userId;

  if (typeof userId !== 'string' || userId.length === 0 || userId.length > 64) {
    return httpJson(400, { error: { code: 'BAD_REQUEST', message: '缺少有效的 X-User-Id 请求头' } });
  }

  const apiKey = process.env.CLOUDBASE_API_KEY;
  if (!apiKey) {
    return httpJson(500, {
      error: { code: 'INTERNAL', message: 'CLOUDBASE_API_KEY 未配置，请在控制台函数环境变量中配置' },
    });
  }

  try {
    // PostgREST 过滤：userId=eq.<值>。
    // 值先 encodeURIComponent 再拼 URL；PostgREST 内部会把过滤条件
    // 转成参数化 SQL 执行——值永远只当数据，不当 SQL 代码（防注入）。
    const url =
      REST_BASE +
      '/favorites?select=foodId&userId=eq.' +
      encodeURIComponent(userId) +
      '&order=foodId.asc';

    const res = await fetch(url, {
      headers: { Authorization: 'Bearer ' + apiKey, Accept: 'application/json' },
    });

    if (!res.ok) {
      console.error('[favorites] REST API 状态码 ' + res.status + '：' + (await res.text()).slice(0, 300));
      const message = res.status === 401 || res.status === 403 ? 'API Key 无效或未授权' : '数据库查询失败';
      return httpJson(500, { error: { code: 'INTERNAL', message } });
    }

    // REST 返回 [{ foodId: 'f001' }, ...]，剥壳成 ['f001', ...]
    const rows = await res.json();
    const data = rows.map((row) => row.foodId);
    return isHttpCall ? httpJson(200, data) : data;
  } catch (err) {
    console.error('[favorites] 请求失败:', err.message);
    return httpJson(500, { error: { code: 'INTERNAL', message: '数据库查询失败' } });
  }
};
