// 云函数：health —— 健康检查接口的占位实现（事件函数形态）
// Day 15 只验证「部署 → 公网访问」链路，不连数据库、不写业务逻辑。
// 真实业务接口在 Day 16–20 按 api-contract.md 实现，到时候新增函数，不改这里。
//
// 工作方式（事件函数 + HTTP 网关）：
// 1. 公网请求打到 <默认域名>/api/health；
// 2. HTTP 网关把请求包装成 event 对象（含 path、httpMethod、headers、body 等），调用下面的 main；
// 3. main 按「API 网关标准格式」返回 { statusCode, headers, body }，
//    网关把 body 原样作为响应体发回浏览器 —— 所以公网看到的就是 {"ok":true,"service":"do you eat"}。
//
// 事件函数与 Web 函数的区别：事件函数不自己监听端口，由平台调用、传入事件、取走返回值；
// Web 函数（带 scf_bootstrap）要自己起 HTTP 服务器，适合跑 Express 这类完整 Web 框架。
// 今天只需要返回一份数据，事件函数是更简单、也更省资源的形态。

// 接口要返回的业务数据（今天固定，Day 16 起会换成真实状态）
const HEALTH_PAYLOAD = {
  ok: true,
  service: 'do you eat',
};

exports.main = async function (event, context) {
  // 经 HTTP 网关调用时，event 里会带 httpMethod；直接用 CLI/SDK 调用时没有这个字段
  const isHttpCall = Boolean(event && event.httpMethod);

  // 接口契约只定义了 GET /api/health，其他方法一律拒绝
  if (isHttpCall && event.httpMethod !== 'GET') {
    return {
      statusCode: 405,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ok: false, error: 'method not allowed' }),
    };
  }

  // 走 HTTP 网关：返回标准格式，body 必须是字符串
  if (isHttpCall) {
    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(HEALTH_PAYLOAD),
    };
  }

  // 直接用 CLI / SDK 调用：返回普通对象即可
  return HEALTH_PAYLOAD;
};
