// 云函数：favorites —— GET /api/favorites + POST /api/favorites/:foodId
// 对应 api-contract.md 接口 #7（GET，Day 17 实现）与 #8（POST，Day 18 实现）
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

  const apiKey = process.env.CLOUDBASE_API_KEY;
  if (!apiKey) {
    return httpJson(500, {
      error: { code: 'INTERNAL', message: 'CLOUDBASE_API_KEY 未配置，请在控制台函数环境变量中配置' },
    });
  }

  const authHeaders = { Authorization: 'Bearer ' + apiKey, Accept: 'application/json' };

  // ---------- GET：读取收藏列表（Day 17 逻辑，原样保留） ----------
  if (method === 'GET') {
    try {
      // PostgREST 过滤：userId=eq.<值>。
      // 值先 encodeURIComponent 再拼 URL；PostgREST 内部会把过滤条件
      // 转成参数化 SQL 执行——值永远只当数据，不当 SQL 代码（防注入）。
      const url =
        REST_BASE +
        '/favorites?select=foodId&userId=eq.' +
        encodeURIComponent(userId) +
        '&order=foodId.asc';

      const res = await fetch(url, { headers: authHeaders });

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
  }

  // ---------- POST：收藏一道菜（Day 18 新增） ----------
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
    // 第 1 步：校验这道菜存在（favorites 表有外键，但提前查能给出更准确的 404）
    const foodRes = await fetch(REST_BASE + '/foods?select=id&id=eq.' + encodeURIComponent(foodId), {
      headers: authHeaders,
    });
    if (!foodRes.ok) {
      console.error('[favorites] 查 foods 失败 ' + foodRes.status + '：' + (await foodRes.text()).slice(0, 300));
      return httpJson(500, { error: { code: 'INTERNAL', message: '数据库查询失败' } });
    }
    const foodRows = await foodRes.json();
    if (foodRows.length === 0) {
      console.log('[favorites] POST 拒绝：userId=' + userId + ' foodId=' + foodId + '（食物不存在）');
      return httpJson(404, { error: { code: 'NOT_FOUND', message: '食物不存在：' + foodId } });
    }

    // 第 2 步：幂等约定（Day 16 拍板）——已收藏的直接返回 201，不报错
    const existRes = await fetch(
      REST_BASE +
        '/favorites?select=foodId&userId=eq.' +
        encodeURIComponent(userId) +
        '&foodId=eq.' +
        encodeURIComponent(foodId),
      { headers: authHeaders }
    );
    if (!existRes.ok) {
      console.error('[favorites] 查收藏失败 ' + existRes.status + '：' + (await existRes.text()).slice(0, 300));
      return httpJson(500, { error: { code: 'INTERNAL', message: '数据库查询失败' } });
    }
    const existRows = await existRes.json();
    if (existRows.length > 0) {
      console.log('[favorites] POST 幂等：userId=' + userId + ' foodId=' + foodId + '（已收藏，返回 201）');
      return isHttpCall ? httpJson(201, { foodId: foodId }) : { foodId: foodId };
    }

    // 第 3 步：插入。Prefer: return=representation 让 REST 返回落库后的行
    const insertRes = await fetch(REST_BASE + '/favorites', {
      method: 'POST',
      headers: Object.assign({}, authHeaders, {
        'Content-Type': 'application/json',
        Prefer: 'return=representation',
      }),
      body: JSON.stringify({ userId: userId, foodId: foodId }),
    });

    if (insertRes.status === 409) {
      // 并发兜底：两个相同请求同时穿过第 2 步的检查，后到的会撞复合主键
      console.log('[favorites] POST 幂等(并发)：userId=' + userId + ' foodId=' + foodId);
      return isHttpCall ? httpJson(201, { foodId: foodId }) : { foodId: foodId };
    }
    if (!insertRes.ok) {
      console.error('[favorites] 写入失败 ' + insertRes.status + '：' + (await insertRes.text()).slice(0, 300));
      return httpJson(500, { error: { code: 'INTERNAL', message: '数据库写入失败' } });
    }

    console.log('[favorites] POST 成功：userId=' + userId + ' foodId=' + foodId);
    return isHttpCall ? httpJson(201, { foodId: foodId }) : { foodId: foodId };
  } catch (err) {
    console.error('[favorites] 请求失败:', err.message);
    return httpJson(500, { error: { code: 'INTERNAL', message: '数据库写入失败' } });
  }
};
