// 评分展示相关纯函数（Day 7 第 3 步）
// 设计依据：PRD F2 评级展示 + TECH_DESIGN.md §4（业务逻辑层）
//
// MVP 没有内置「餐厅平均分」（我们故意没在 Food 里加 rating 字段），
// 所以展示优先级 = 用户分 > 未评分。后续若引入云端聚合，再扩展 combine。

import { getRating } from '../services/storage'
import type { RatingScore } from '../types/food'

/** 展示用的评分视图 */
export interface RatingView {
  /** 当前可展示的分（1~5）；null 表示「未评分」 */
  score: RatingScore | null
  /** 当前分来自哪里；给 UI 显示「已评分/未评分」文案用 */
  source: 'user' | 'none'
}

/**
 * 取某食物的展示评分。
 * MVP 只读用户分；以后要叠加「全网平均分」时，在这里做加权即可。
 */
export function getDisplayRating(foodId: string): RatingView {
  const user = getRating(foodId)
  if (user === null) return { score: null, source: 'none' }
  return { score: user.score, source: 'user' }
}

/**
 * 把分数格式化成「★」字符序列（UI 渲染备用）。
 * 例：score=4 → '★★★★☆'
 */
export function scoreToStars(score: RatingScore): string {
  const filled = '★'.repeat(score)
  const empty = '☆'.repeat(5 - score)
  return filled + empty
}

/** 中文标签：1~5 分的语义化描述，星星旁可附文字 */
export const SCORE_LABELS: Readonly<Record<RatingScore, string>> = {
  1: '踩雷预警',
  2: '凑合一顿',
  3: '普普通通',
  4: '值得回购',
  5: '神仙美味',
}