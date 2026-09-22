// 全局类型定义（Day 7 第 2 步）
// 字段命名依据：TECH_DESIGN.md §3.1 / §3.2

/**
 * 食物卡 —— 内置餐品库中的每一道菜的最小信息单元
 * @property id 唯一 id（小写英文+数字，便于当 localStorage key 后缀）
 * @property name 显示名（中文）
 * @property emoji 配图（emoji 字符；按 Day 5 决策 D2 选定）
 * @property description 一句话俏皮文案（结果卡片副标题用）
 * @property mealPeriod 适用时段（早 / 午 / 晚 / 夜宵）；MVP 不做筛选但留好字段
 * @property spicy 是否辣；MVP 不做黑名单但留好字段
 * @property tags 自由标签数组，便于后续扩展（甜/咸/汤/饭等）
 */
export type MealPeriod = 'breakfast' | 'lunch' | 'dinner' | 'snack'

export interface Food {
  readonly id: string
  readonly name: string
  readonly emoji: string
  readonly description: string
  readonly mealPeriod: MealPeriod
  readonly spicy: boolean
  readonly tags: readonly string[]
}

/**
 * 用户评分 —— 用户在浏览器里打的 1~5 分
 * 存进 localStorage 的 JSON 形如 { foodId, score, updatedAt }
 * 设计依据：TECH_DESIGN.md §3.2 + Day 5 决策 D4（key = `dye:rating:<foodId>`）
 */
export type RatingScore = 1 | 2 | 3 | 4 | 5

export interface UserRating {
  readonly foodId: string
  readonly score: RatingScore
  readonly updatedAt: string // ISO 8601 字符串
}

/**
 * 抽卡过程中的三态状态机
 * （UI 层在 Day 7 第 4 步才会用到，这里先把类型定义清楚）
 */
export type GachaPhase = 'idle' | 'rolling' | 'result'