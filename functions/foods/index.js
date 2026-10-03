// 云函数：foods —— GET /api/foods，返回食物库全量列表
// 对应 api-contract.md 接口 #1（读取部分，Day 17 实现）
//
// 数据链路：浏览器 → HTTP 网关(/api/foods) → 本函数 → CloudBase PG REST API → 原路返回
//
// 为什么用 REST API 而不是 pg 库直连（Day 17 现场拍板）：
// 体验版（共享集群）不提供数据库内网/外网地址，云函数无法用
// TCP 协议直连 PostgreSQL。官方替代方案是 PostgREST 风格的
// REST API（https://{envId}.api.tcloudbasegateway.com/v1/rdb/rest/{table}），
// 用 API Key（service_role）认证——Key 只配在函数环境变量里，绝不进代码、不进前端。
//
// 返回形状（契约 v1.1）：
// - 成功：HTTP 200 + Food[]（直接是业务数据数组，与前端 mockApi 返回一致）
// - 失败：HTTP 4xx/5xx + { error: { code, message } }

// 环境资源地址：REST API 网关域名 = 环境ID + 固定后缀（非机密，官网地址里本来就带）
const ENV_ID = 'doyoueat-d5g36rg7ia785b553';
const REST_BASE = 'https://' + ENV_ID + '.api.tcloudbasegateway.com/v1/rdb/rest';

// HTTP 网关的标准返回格式（Day 15 health 函数已验证：网关认这个格式）
function httpJson(statusCode, payload) {
  return {
    statusCode,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  };
}

exports.main = async function (event, context) {
  const isHttpCall = Boolean(event && event.httpMethod);

  // 契约只登记了 GET，其他方法一律 405
  if (isHttpCall && event.httpMethod !== 'GET') {
    return httpJson(405, { error: { code: 'METHOD_NOT_ALLOWED', message: '本接口只支持 GET' } });
  }

  // API Key 从环境变量读（控制台「函数配置 → 环境变量」配置）
  const apiKey = process.env.CLOUDBASE_API_KEY;
  if (!apiKey) {
    return httpJson(500, {
      error: { code: 'INTERNAL', message: 'CLOUDBASE_API_KEY 未配置，请在控制台函数环境变量中配置' },
    });
  }

  try {
    // PostgREST 查询：select=* 按表定义顺序返回全部列，order=id.asc 按 id 升序
    const url = REST_BASE + '/foods?select=*&order=id.asc';
    const res = await fetch(url, {
      headers: { Authorization: 'Bearer ' + apiKey, Accept: 'application/json' },
    });

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
};
