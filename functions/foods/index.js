// 云函数：foods —— GET /api/foods + POST /api/foods
// 对应 api-contract.md 接口 #1（GET，Day 17 实现）与 #2（POST，Day 18 实现）
//
// 数据链路：浏览器 → HTTP 网关(/api/foods) → 本函数 → CloudBase PG REST API → 原路返回
//
// 为什么用 REST API 而不是 pg 库直连（Day 17 现场拍板）：
// 体验版（共享集群）不提供数据库内网/外网地址，云函数无法用
// TCP 协议直连 PostgreSQL。官方替代方案是 PostgREST 风格的
// REST API（https://{envId}.api.tcloudbasegateway.com/v1/rdb/rest/{table}），
// 用 API Key（service_role）认证——Key 只配在函数环境变量里，绝不进代码、不进前端。
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

// 环境资源地址：REST API 网关域名 = 环境ID + 固定后缀（非机密，官网地址里本来就带）
const ENV_ID = 'doyoueat-d5g36rg7ia785b553';
const REST_BASE = 'https://' + ENV_ID + '.api.tcloudbasegateway.com/v1/rdb/rest';

// 合法值清单：与 schema.sql 的 CHECK 约束、src/types/food.ts 逐项对齐
const MEAL_PERIODS = ['breakfast', 'lunch', 'dinner', 'snack'];
const CUISINES = ['川', '粤', '鲁', '苏', '浙', '闽', '湘', '徽'];

const crypto = require('crypto');

// HTTP 网关的标准返回格式（Day 15 health 函数已验证：网关认这个格式）
function httpJson(statusCode, payload) {
  return {
    statusCode,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  };
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

// 用户自建食物的 id：后端生成（契约附录 A），形如 user-a1b2c3d4e5f6
function newFoodId() {
  return 'user-' + crypto.randomUUID().replace(/-/g, '').slice(0, 12);
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

  // API Key 从环境变量读（控制台「函数配置 → 环境变量」配置）
  const apiKey = process.env.CLOUDBASE_API_KEY;
  if (!apiKey) {
    return httpJson(500, {
      error: { code: 'INTERNAL', message: 'CLOUDBASE_API_KEY 未配置，请在控制台函数环境变量中配置' },
    });
  }

  const authHeaders = { Authorization: 'Bearer ' + apiKey, Accept: 'application/json' };

  // ---------- GET：食物库全量（Day 17 逻辑，原样保留） ----------
  if (method === 'GET') {
    try {
      // PostgREST 查询：select=* 按表定义顺序返回全部列，order=id.asc 按 id 升序
      const url = REST_BASE + '/foods?select=*&order=id.asc';
      const res = await fetch(url, { headers: authHeaders });

      if (!res.ok) {
        // 401/403 大概率是 Key 配错；其余按数据库查询失败处理
        console.error('[foods] REST API 状态码 ' + res.status + '：' + (await res.text()).slice(0, 300));
        const message = res.status === 401 || res.status === 403 ? 'API Key 无效或未授权' : '数据库查询失败';
        return httpJson(500, { error: { code: 'INTERNAL', message } });
      }

      const data = await res.json();
      return isHttpCall ? httpJson(200, data) : data;
    } catch (err) {
      console.error('[foods] 请求失败:', err.message);
      return httpJson(500, { error: { code: 'INTERNAL', message: '数据库查询失败' } });
    }
  }

  // ---------- POST：新增一道菜（Day 18 新增） ----------
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
    const dupRes = await fetch(REST_BASE + '/foods?select=id&name=eq.' + encodeURIComponent(food.name), {
      headers: authHeaders,
    });
    if (!dupRes.ok) {
      console.error('[foods] 查重失败 ' + dupRes.status + '：' + (await dupRes.text()).slice(0, 300));
      return httpJson(500, { error: { code: 'INTERNAL', message: '数据库查询失败' } });
    }
    const dupRows = await dupRes.json();
    if (dupRows.length > 0) {
      console.log('[foods] POST 拒绝：name=' + food.name + '（同名已存在，id=' + dupRows[0].id + '）');
      return httpJson(409, { error: { code: 'CONFLICT', message: '已有同名食物：' + food.name } });
    }

    // 第 2 步：插入（id 后端生成）。Prefer: return=representation 返回落库后的行
    const payload = Object.assign({ id: newFoodId() }, food);
    const insertRes = await fetch(REST_BASE + '/foods', {
      method: 'POST',
      headers: Object.assign({}, authHeaders, {
        'Content-Type': 'application/json',
        Prefer: 'return=representation',
      }),
      body: JSON.stringify(payload),
    });

    if (insertRes.status === 409) {
      // 极小概率撞 id（随机串重复）：换一个 id 重试一次
      const retryRes = await fetch(REST_BASE + '/foods', {
        method: 'POST',
        headers: Object.assign({}, authHeaders, {
          'Content-Type': 'application/json',
          Prefer: 'return=representation',
        }),
        body: JSON.stringify(Object.assign({ id: newFoodId() }, food)),
      });
      if (!retryRes.ok) {
        console.error('[foods] 写入失败(重试) ' + retryRes.status + '：' + (await retryRes.text()).slice(0, 300));
        return httpJson(500, { error: { code: 'INTERNAL', message: '数据库写入失败' } });
      }
      const retryRows = await retryRes.json();
      console.log('[foods] POST 成功(重试)：name=' + food.name + ' id=' + retryRows[0].id);
      return isHttpCall ? httpJson(201, retryRows[0]) : retryRows[0];
    }
    if (!insertRes.ok) {
      console.error('[foods] 写入失败 ' + insertRes.status + '：' + (await insertRes.text()).slice(0, 300));
      return httpJson(500, { error: { code: 'INTERNAL', message: '数据库写入失败' } });
    }

    const rows = await insertRes.json();
    console.log('[foods] POST 成功：name=' + food.name + ' id=' + rows[0].id);
    return isHttpCall ? httpJson(201, rows[0]) : rows[0];
  } catch (err) {
    console.error('[foods] 请求失败:', err.message);
    return httpJson(500, { error: { code: 'INTERNAL', message: '数据库写入失败' } });
  }
};
