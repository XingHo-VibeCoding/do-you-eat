// API 服务层（Day 20 接线上云）
// 替代 mockApi.ts（foods 相关）+ favoriteApi.ts（收藏相关）。
// 依据 api-contract.md v1.2 调用真实后端接口。
//
// 地址策略：
//   - 开发环境走 Vite 代理（/api → CloudBase 网关），浏览器同源请求，无跨域问题
//   - 生产环境直连公网 API 地址，由网关 CORS 策略允许静态托管域名
//   - 网关 CORS 配置为白名单模式，禁止使用 * 通配符

import type { Food } from '../types/food'

const API_BASE = import.meta.env.PROD
  ? 'https://doyoueat-d5g36rg7ia785b553-1496350653.ap-shanghai.app.tcloudbase.com/api'
  : '/api'

// ============ 匿名用户身份 ============

const USER_ID_KEY = 'dye:user-id'

/**
 * 获取当前用户的匿名 ID（首次访问时自动生成并存储）。
 * 后端用 X-User-Id 请求头区分不同用户的收藏数据。
 */
export function getUserId(): string {
  try {
    const existing = localStorage.getItem(USER_ID_KEY)
    if (existing) return existing
    const fresh = crypto.randomUUID()
    localStorage.setItem(USER_ID_KEY, fresh)
    return fresh
  } catch {
    // localStorage 不可用（隐私模式等）—— 返回临时 ID，本次会话内仍可用
    return 'anonymous-temp-user'
  }
}

// ============ 通用请求封装 ============

/**
 * 后端 API 错误类。
 * 后端返回 { error: { code, message } }，这类错误应该用 instanceof ApiError 判断。
 */
export class ApiError extends Error {
  /** HTTP 状态码（405 / 409 / 500 等） */
  status: number
  /** 后端错误码（BAD_REQUEST / NOT_FOUND / INTERNAL 等） */
  code: string

  constructor(status: number, code: string, message: string) {
    super(message)
    this.name = 'ApiError'
    this.status = status
    this.code = code
  }
}

/**
 * 发送 API 请求的通用封装。
 * - 自动附加 X-User-Id（用户身份接口）
 * - 自动附加 Content-Type: application/json（有请求体时）
 * - 抛出 ApiError：网络错 / 输入错 / 服务端错，message 一律是中文人话（Day 23 统一）
 */
async function request<T>(path: string, init?: RequestInit): Promise<T> {
  // 需要用户身份的接口（favorites/ratings/health）自动携带 X-User-Id
  const headers = new Headers(init?.headers)
  if (path.startsWith('/favorites') || path.startsWith('/ratings') || path.startsWith('/health')) {
    headers.set('X-User-Id', getUserId())
  }
  if (init?.body) {
    headers.set('Content-Type', 'application/json')
  }

  let response: Response
  try {
    response = await fetch(`${API_BASE}${path}`, { ...init, headers })
  } catch {
    // 网络层错误（断网 / DNS 解析失败 / 请求被拦截）：
    // 浏览器这里抛的是英文 TypeError: "Failed to fetch"——裸报错的源头之一。
    // status 用 0 表示「请求根本没到达服务器」。
    throw new ApiError(0, 'NETWORK', '网络不给力，请检查网络后重试')
  }

  // 后端返回 4xx / 5xx 时，统一返回 { error: { code, message } }
  if (!response.ok) {
    let code = 'INTERNAL'
    let bodyMessage: string | null = null
    try {
      const body = await response.json()
      if (body?.error) {
        code = body.error.code ?? code
        bodyMessage = body.error.message ?? null
      }
    } catch {
      // 响应体不是 JSON（网关异常返回 HTML 页等）
    }
    throw new ApiError(response.status, code, translateError(response.status, code, bodyMessage))
  }

  // DELETE 成功返回 204 无内容
  if (response.status === 204) {
    return undefined as T
  }

  return response.json() as Promise<T>
}

/**
 * 三类错误 → 中文人话（Day 23 错误提示统一）。
 *
 * 分类规则：
 *   输入错   → 400 / BAD_REQUEST：优先透传后端的中文校验消息（如「菜名不能为空」）
 *   网络错   → 在 fetch 的 catch 里直接翻译，不经过这里
 *   服务端错 → 5xx：一律不透传后端 message——后端 500 的 message 可能带内部细节
 *              （表名 / 堆栈片段），透给用户既看不懂又不安全，统一说人话
 *   其余 4xx → 按语义给固定话术，兜底「请求失败」
 */
function translateError(status: number, code: string, bodyMessage: string | null): string {
  // 输入错：后端 400 的 message 本来就是中文人话（Day 18 校验消息），优先用
  if (status === 400 || code === 'BAD_REQUEST') {
    return bodyMessage ?? '输入有问题，请检查后再试'
  }
  // 没找到（删除不存在的评分等）
  if (status === 404 || code === 'NOT_FOUND') {
    return bodyMessage ?? '没有找到这条内容，可能已被删除'
  }
  // 重名冲突（新增同名菜品）
  if (status === 409) {
    return bodyMessage ?? '这道菜已经存在啦'
  }
  // 服务端错：不透传后端 message，防止内部信息泄露
  if (status >= 500 || code === 'INTERNAL') {
    return '服务器开小差了，请稍后再试'
  }
  // 其余（405 未开放 / 401 等）
  return bodyMessage ?? '请求失败，请稍后重试'
}

/**
 * 把任意 catch 到的错误翻译成中文人话——UI 层显示错误文案的唯一出口。
 * 页面组件里禁止直接显示 err.message（可能流出英文裸报错），一律走这里。
 */
export function friendlyErrorMessage(err: unknown): string {
  if (err instanceof ApiError) {
    return err.message
  }
  if (err instanceof TypeError) {
    // fetch 层的网络错误兜底（正常已被 request() 翻译，这里是双保险）
    return '网络不给力，请检查网络后重试'
  }
  return '出了点小问题，请稍后重试'
}

// ============ foods 表接口（api-contract #1 #2 #3） ============

/** GET /api/foods — 获取全量食物列表 */
export async function fetchFoods(): Promise<Food[]> {
  return request<Food[]>('/foods')
}

export type AddFoodInput = Omit<Food, 'id'>

/** POST /api/foods — 新增一道菜（同名返回 409） */
export async function addFood(input: AddFoodInput): Promise<Food> {
  return request<Food>('/foods', {
    method: 'POST',
    body: JSON.stringify(input),
  })
}

/** DELETE /api/foods/:id — 删除一道菜（Day 20 后端暂未实现，返回 405） */
export async function removeFood(id: string): Promise<void> {
  await request<void>(`/foods/${encodeURIComponent(id)}`, { method: 'DELETE' })
}

// ============ favorites 表接口（api-contract #7 #8 #9） ============

/** GET /api/favorites — 获取当前用户收藏的食物 ID 列表 */
export async function getFavorites(): Promise<string[]> {
  return request<string[]>('/favorites')
}

/** POST /api/favorites/:foodId — 收藏一道菜（幂等，重复收藏返回 201） */
export async function addFavorite(foodId: string): Promise<{ foodId: string }> {
  return request<{ foodId: string }>(`/favorites/${encodeURIComponent(foodId)}`, {
    method: 'POST',
  })
}

/** DELETE /api/favorites/:foodId — 取消收藏（Day 20 后端暂未实现，返回 405） */
export async function removeFavorite(foodId: string): Promise<{ foodId: string }> {
  return request<{ foodId: string }>(`/favorites/${encodeURIComponent(foodId)}`, {
    method: 'DELETE',
  })
}
