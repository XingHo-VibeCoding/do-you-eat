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
 * - 抛出 ApiError（后端 4xx/5xx 错误）或普通 Error（网络错误）
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

  const response = await fetch(`${API_BASE}${path}`, { ...init, headers })

  // 后端返回 4xx / 5xx 时，统一返回 { error: { code, message } }
  if (!response.ok) {
    let code = 'INTERNAL'
    let message = `请求失败 (HTTP ${response.status})`
    try {
      const body = await response.json()
      if (body?.error) {
        code = body.error.code ?? code
        message = body.error.message ?? message
      }
    } catch {
      // 响应体不是 JSON（网关异常等）
    }
    throw new ApiError(response.status, code, message)
  }

  // DELETE 成功返回 204 无内容
  if (response.status === 204) {
    return undefined as T
  }

  return response.json() as Promise<T>
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
