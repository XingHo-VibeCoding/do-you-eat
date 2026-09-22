// 用户评分的唯一读写出口（Day 7 第 2 步）
// 设计依据：TECH_DESIGN.md §3.3 + Day 5 决策 D4 + AGENTS.md 第八节规则 1
//
// ⚠️ 项目专属规则：组件和页面禁止直接写 `localStorage.getItem/setItem`，
//                  所有评分读写必须经过本文件。未来要换云函数，只改这里即可。
//
// 存储形状：
//   key = `${STORAGE_KEY_PREFIX}${foodId}`   （例：dye:rating:f001）
//   value = JSON.stringify({ foodId, score, updatedAt })

import type { RatingScore, UserRating } from '../types/food'

export const STORAGE_KEY_PREFIX = 'dye:rating:'

function makeKey(foodId: string): string {
  return `${STORAGE_KEY_PREFIX}${foodId}`
}

/**
 * 读取单条评分。找不到 / 解析失败 / localStorage 不可用都返回 null。
 */
export function getRating(foodId: string): UserRating | null {
  try {
    const raw = localStorage.getItem(makeKey(foodId))
    if (raw === null) return null
    const parsed = JSON.parse(raw) as Partial<UserRating>
    if (
      typeof parsed.foodId === 'string' &&
      typeof parsed.score === 'number' &&
      parsed.score >= 1 &&
      parsed.score <= 5 &&
      typeof parsed.updatedAt === 'string'
    ) {
      return parsed as UserRating
    }
    return null
  } catch {
    return null
  }
}

/**
 * 写入一条评分。会校验 score ∈ [1,5]，否则抛错（避免把脏数据写进 localStorage）。
 * 返回落库后的完整对象（便于调用方直接渲染）。
 */
export function setRating(foodId: string, score: number): UserRating {
  if (!Number.isInteger(score) || score < 1 || score > 5) {
    throw new RangeError(`score 必须是 1~5 的整数，实际收到 ${score}`)
  }
  const record: UserRating = {
    foodId,
    score: score as RatingScore,
    updatedAt: new Date().toISOString(),
  }
  try {
    localStorage.setItem(makeKey(foodId), JSON.stringify(record))
  } catch (err) {
    // localStorage 满 / 隐私模式禁用 —— 静默抛错给上层 UI 处理
    throw err instanceof Error ? err : new Error('localStorage 写入失败')
  }
  return record
}

/**
 * 删除一条评分（取消评分按钮会用到；MVP 也可选用）。
 */
export function clearRating(foodId: string): void {
  try {
    localStorage.removeItem(makeKey(foodId))
  } catch {
    // 静默忽略：用户大概率没权限删，那也就读不到，无所谓
  }
}

/**
 * 拉取所有评分，返回 UserRating 数组。
 * 用于统计「用户评过哪些食物」「平均分」之类的派生视图（MVP 暂未使用，UI 第 4 步会用到）。
 */
export function getAllRatings(): UserRating[] {
  const result: UserRating[] = []
  try {
    for (let i = 0; i < localStorage.length; i += 1) {
      const key = localStorage.key(i)
      if (key === null || !key.startsWith(STORAGE_KEY_PREFIX)) continue
      const raw = localStorage.getItem(key)
      if (raw === null) continue
      try {
        const parsed = JSON.parse(raw) as UserRating
        if (parsed.foodId && typeof parsed.score === 'number') {
          result.push(parsed)
        }
      } catch {
        // 单条解析失败不影响整体，继续扫下一条
      }
    }
  } catch {
    // localStorage 整体不可用，返回空数组
  }
  return result
}