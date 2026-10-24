// 云函数：assistant —— AI 健康助手（api-contract.md 接口 #16）
// POST /api/assistant/chat
//
// 【双引擎，这是本函数最重要的设计】
//   process.env.LLM_API_KEY 有值 → 调大模型，source 返回 "llm"
//   没配（或调用失败）        → 走规则引擎，source 返回 "rules"
// 为什么必须有规则引擎兜底：申请 Key、实名认证、云函数出网这三件事都不由我们控制，
// 任何一个卡住都不该让页面变成废页。规则引擎的文案是拿用户**真实数据**算出来的
// （真的算了 7 天体重差、真的比对了饮水量），不是随机鸡汤。
//
// 【Key 绝不进前端】
// 密钥只存在于本函数的环境变量里。前端只发业务数据，永远看不到也不发给别人。
//
// 【回答口径红线】（契约第八节「明确不做」）
// 只给饮食 / 作息的生活方式建议，不做医疗诊断、不判断疾病、不推荐药物。
// 这条同时写进给大模型的 system prompt 里，不因为模型更强而放开。

// 大模型接口用 OpenAI 兼容格式——DeepSeek / 通义（兼容模式）/ Kimi / 智谱 / 混元
// 都通吃，切换供应商只改环境变量，代码不动。
const LLM_BASE_URL = process.env.LLM_BASE_URL || 'https://api.deepseek.com';
const LLM_MODEL = process.env.LLM_MODEL || 'deepseek-chat';

// 红线措辞要点（Day 29 晚上线的实测教训）：
// 早期版本把「问到症状或疾病时，只回一句『这个得问医生』」写在 prompt 里，
// 结果大模型过度保守——用户问「晚餐想吃清淡点，给个建议」也被挡回那句话，
// 好好的饮食建议变成了空话。改法：把红线从无条件声明改成条件触发，
// 明确写清「只有真的出现症状/疾病/药物时才说那句」，并点名哪些情况不许说。
const SYSTEM_PROMPT =
  '你是手机 App「do you eat」里的健康助手，说话简短口语化，一到两句，用中文。' +
  '你只给饮食和作息方面的生活方式建议（吃什么、喝多少水、睡多久）。直接给建议，不要反问用户。' +
  '严禁做医疗诊断：不判断疾病、不说可能的病因、不推荐药物、不建议停药，也不要自称医生。' +
  '只有当用户的提问里真的出现了身体症状、疾病或药物时，才先说一句「这个得问医生，我只能聊聊吃和睡」，然后接着给饮食作息建议。' +
  '用户只是问吃什么、睡不好、喝水少、体重变化时，不要说那句话，直接回答。';

function httpJson(statusCode, payload) {
  return {
    statusCode,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  };
}

// 网关剥前缀：绑 /api/assistant 后 event.path 只剩 '/chat'
function parseSegments(event) {
  const rawPath = (event && typeof event.path === 'string' && event.path) || '';
  const all = rawPath.split('?')[0].split('/').filter(function (s) { return s.length > 0; });
  const start = all.findIndex(function (s) { return s !== 'api' && s !== 'assistant'; });
  return start === -1 ? [] : all.slice(start);
}

function getHeader(event, name) {
  const headers = (event && event.headers) || {};
  const lower = name.toLowerCase();
  for (const key of Object.keys(headers)) {
    if (key.toLowerCase() === lower) return headers[key];
  }
  return undefined;
}

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

// =============================================================
// 规则引擎（无 Key 时的主力回答）
// =============================================================

// 取最近 n 天内有体重的记录
function weightPoints(logs) {
  return (Array.isArray(logs) ? logs : [])
    .filter(function (l) { return l && typeof l.weightKg === 'number' && Number.isFinite(l.weightKg); })
    .sort(function (a, b) { return String(a.date).localeCompare(String(b.date)); });
}

// 趋势点评：算真实的变化量，按幅度分档说话
function replyTrend(logs) {
  const points = weightPoints(logs);
  if (points.length === 0) {
    return '还没有体重记录。记两三天之后，我就能看出趋势了。';
  }
  if (points.length === 1) {
    return '记下第一天了：' + points[0].weightKg + ' kg。再记几天我就能看出趋势。';
  }

  const last = points[points.length - 1];
  const first = points[0];
  const diff = Math.round((last.weightKg - first.weightKg) * 10) / 10;
  const spanDays = points.length;

  if (Math.abs(diff) < 0.2) {
    return '这 ' + spanDays + ' 次记录里体重稳在 ' + last.weightKg + ' kg 上下，保持得不错。';
  }
  if (diff < 0) {
    const drop = Math.abs(diff);
    if (drop > 1.5) {
      return '这 ' + spanDays + ' 次记录里轻了 ' + drop + ' kg，幅度有点大。别再往下压了，晚餐主食加回半碗。';
    }
    return '轻了 ' + drop + ' kg，节奏还行。继续按现在的吃法就好。';
  }
  if (diff > 1.5) {
    return '这 ' + spanDays + ' 次记录里重了 ' + diff + ' kg。先别急着少吃，看看这两天的主食和夜宵。';
  }
  return '重了 ' + diff + ' kg，在正常波动里，不用紧张。';
}

// 吃什么推荐：规则引擎挑不出「你更喜欢吃哪个」（没有偏好数据），
// 所以改成「按日期确定性挑一个 + 给一句理由」，同一天问多次答案一致，不会乱跳。
function replyRecommend(candidates, profile, seed) {
  const list = (Array.isArray(candidates) ? candidates : []).filter(function (c) {
    return typeof c === 'string' && c.trim().length > 0;
  });
  if (list.length === 0) {
    return '今天不知道吃什么的话，先翻翻食物库，随手抽一张也行。';
  }

  let pickIndex = 0;
  for (let i = 0; i < seed.length; i++) {
    pickIndex = (pickIndex * 31 + seed.charCodeAt(i)) % list.length;
  }
  const pick = list[pickIndex];

  let extra = '';
  if (profile && typeof profile.heightCm === 'number' && typeof profile.weightKg === 'number' && profile.heightCm > 0) {
    const bmi = profile.weightKg / Math.pow(profile.heightCm / 100, 2);
    extra = '按你的身高体重，BMI 约 ' + bmi.toFixed(1) + '，';
  }

  // 按东八区判断时段。必须 %24：UTC 20 点 = 北京时间凌晨 4 点，
  // 不做取模会算成 28 → 落进「夜宵」，凌晨问「吃什么」会得到夜宵推荐。
  const hour = (new Date().getUTCHours() + 8) % 24;
  let period = '今天';
  if (hour < 10) period = '早餐';
  else if (hour < 15) period = '午餐';
  else if (hour < 21) period = '晚餐';
  else period = '夜宵';

  // 拼接一律不带前导空格：中文标点后面直接跟汉字，中间塞空格是英文排版的习惯，
  // 挪到中文里会读成「。 按你的…」这种断句。
  return period + '就吃「' + pick + '」吧。' + (extra.length > 0 ? extra + '配这个量刚好。' : '配半碗米饭。');
}

// 记录点评：逐项跟阈值比，只说真的有数据的项
function replyLog(today) {
  if (!today || typeof today !== 'object') {
    return '还没记今天的数据。';
  }
  const parts = [];

  if (typeof today.weightKg === 'number') {
    parts.push('体重 ' + today.weightKg + ' kg 记下了');
  }
  if (typeof today.sleepHours === 'number') {
    const s = today.sleepHours;
    if (s >= 7) parts.push('睡了 ' + s + ' 小时，够的');
    else if (s >= 6) parts.push('睡了 ' + s + ' 小时，稍微有点少，今晚早半小时睡');
    else parts.push('只睡了 ' + s + ' 小时，今天别安排太满');
  }
  if (typeof today.waterMl === 'number') {
    const w = today.waterMl;
    if (w >= 1500) parts.push('饮水 ' + w + ' ml，达标');
    else parts.push('饮水 ' + w + ' ml，还差 ' + (1500 - w) + ' ml');
  }
  if (typeof today.mood === 'number') {
    const m = today.mood;
    if (m >= 4) parts.push('心情不错');
    else if (m === 3) parts.push('心情一般，吃点喜欢的');
    else parts.push('心情有点低，今天别太苛待自己');
  }
  if (Array.isArray(today.meals) && today.meals.length > 0) {
    parts.push('吃了' + today.meals.join('、'));
  }

  if (parts.length === 0) return '今天还没记数据。';

  // 最后给一句落点建议，不然只是复述数据。
  // 这三句直接接在句号后面，所以都不能带前导空格。
  let tail = '';
  if (typeof today.waterMl === 'number' && today.waterMl < 1500) tail = '记得把水补上。';
  else if (typeof today.sleepHours === 'number' && today.sleepHours < 7) tail = '今晚早点睡。';
  else tail = '保持这个节奏。';

  return parts.join('，') + '。' + tail;
}

// 自由提问：规则引擎答不了，但不能装作听懂了
function replyFree(message) {
  if (typeof message === 'string' && message.trim().length > 0) {
    return '这个我得想清楚再答——现在还没接上大模型，只能按数据给建议。' +
      '你可以先点上面的气泡：记今天的体重睡眠，或者看体重变化。';
  }
  return '问点什么吧，比如「晚上饿了吃什么不胖」。';
}

function rulesReply(intent, body, seed) {
  if (intent === 'trend') return replyTrend(body.logs);
  if (intent === 'recommend') return replyRecommend(body.candidates, body.profile, seed);
  if (intent === 'log') {
    const arr = Array.isArray(body.logs) ? body.logs : [];
    return replyLog(arr.length > 0 ? arr[arr.length - 1] : null);
  }
  return replyFree(body.message);
}

// =============================================================
// 大模型调用（有 Key 时）
// =============================================================

// 把意图翻译成一句人话问题，连同结构化数据一起塞给模型
function buildUserContent(intent, body) {
  if (intent === 'trend') {
    const points = weightPoints(body.logs).map(function (p) { return p.date + ' ' + p.weightKg + 'kg'; });
    return '这是用户最近的体重记录：' + (points.length > 0 ? points.join('、') : '没有记录') +
      '。用一到两句说说趋势，如果变化太快提醒一下。';
  }
  if (intent === 'recommend') {
    const list = (Array.isArray(body.candidates) ? body.candidates : []).slice(0, 20);
    const prof = body.profile
      ? '用户身高 ' + body.profile.heightCm + 'cm、体重 ' + body.profile.weightKg + 'kg、年龄 ' + body.profile.age + '。'
      : '用户还没填身高体重。';
    return prof + '候选菜有这些：' + list.join('、') + '。从中推荐一道，并给一句简短理由。';
  }
  if (intent === 'log') {
    const arr = Array.isArray(body.logs) ? body.logs : [];
    const today = arr.length > 0 ? arr[arr.length - 1] : null;
    return '用户今天的记录：' + (today === null ? '没有记录' : JSON.stringify(today)) +
      '。用一到两句点评，指出最该改进的一项。';
  }
  return String(body.message || '').slice(0, 300);
}

async function llmReply(intent, body) {
  const apiKey = process.env.LLM_API_KEY;
  if (!apiKey) return null;

  try {
    const res = await fetch(LLM_BASE_URL.replace(/\/+$/, '') + '/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + apiKey },
      body: JSON.stringify({
        model: LLM_MODEL,
        temperature: 0.7,
        max_tokens: 200,
        messages: [
          { role: 'system', content: SYSTEM_PROMPT },
          { role: 'user', content: buildUserContent(intent, body) },
        ],
      }),
      // 云函数超时是 30s，这里 20s 就撤，留出时间给规则引擎兜底。
      // 大模型一旦卡住，宁可降级也不要让用户盯着转圈等满 30 秒。
      signal: AbortSignal.timeout(20000),
    });

    if (!res.ok) {
      console.error('[assistant] 大模型返回 ' + res.status + '：' + (await res.text()).slice(0, 300));
      return null;
    }
    const data = await res.json();
    const text = data && data.choices && data.choices[0] && data.choices[0].message
      ? String(data.choices[0].message.content || '').trim()
      : '';
    if (text.length === 0) return null;
    return text;
  } catch (err) {
    console.error('[assistant] 调用大模型失败:', err && err.message);
    return null;
  }
}

// =============================================================
// 入口
// =============================================================

exports.main = async function (event) {
  const isHttpCall = Boolean(event && event.httpMethod);
  const method = isHttpCall ? String(event.httpMethod).toUpperCase() : 'POST';

  if (isHttpCall && method !== 'POST') {
    return httpJson(405, { error: { code: 'METHOD_NOT_ALLOWED', message: '本接口只支持 POST' } });
  }

  const segments = isHttpCall ? parseSegments(event) : [];
  // 只认 /chat；别的子路径一律 404，避免以后误加功能时行为不清
  if (isHttpCall && segments.length > 0 && segments[0] !== 'chat') {
    return httpJson(404, { error: { code: 'NOT_FOUND', message: '未知的接口：' + segments[0] } });
  }

  const body = isHttpCall ? parseBody(event) : event;
  if (isHttpCall && body === null) {
    return httpJson(400, { error: { code: 'BAD_REQUEST', message: '请求体不是合法的 JSON' } });
  }
  if (isHttpCall && body === undefined) {
    return httpJson(400, { error: { code: 'BAD_REQUEST', message: '缺少请求体' } });
  }

  const intent = body && body.intent;
  if (intent !== 'trend' && intent !== 'recommend' && intent !== 'log' && intent !== 'free') {
    return httpJson(400, { error: { code: 'BAD_REQUEST', message: '缺少 intent（trend / recommend / log / free）' } });
  }

  // 同一个人同一天问「吃什么」，规则引擎要给出同一个答案，所以用 userId+日期做种子
  const userId = isHttpCall ? getHeader(event, 'X-User-Id') : event && event.userId;
  const seed = String(userId || 'anon') + new Date().toISOString().slice(0, 10);

  const llmText = await llmReply(intent, body);
  if (llmText !== null) {
    console.log('[assistant] 大模型回答 intent=' + intent);
    return isHttpCall
      ? httpJson(200, { reply: llmText, source: 'llm' })
      : { reply: llmText, source: 'llm' };
  }

  const reply = rulesReply(intent, body, seed);
  return isHttpCall
    ? httpJson(200, { reply: reply, source: 'rules' })
    : { reply: reply, source: 'rules' };
};
