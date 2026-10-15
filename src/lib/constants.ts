// 全局常量（Day 7 第 3 步；Day 8 追加数据四态文案）
// 文案集中处：所有面向用户的字句都从这里出，便于后续打磨 / i18n 替换

import type { MealPeriod } from '../types/food'

export const APP_NAME = 'do you eat'
export const APP_TAGLINE = '今天吃啥'

/** 按钮文案 */
export const BUTTON_ROLL = '开始干饭'
export const BUTTON_REROLL = '不行，重来'
export const BUTTON_RESET_RATING = '清除我的评分'
export const BUTTON_RETRY = '再试一次'

/** 空状态 / 引导 */
export const INTRO_HINT =
  '点上面的按钮，让命运决定你今天吃啥 🍜'

/** 数据四态文案（Day 8） */
export const LOAD_LOADING_TEXT = '正在拿食堂数据…'
export const LOAD_EMPTY_TITLE = '菜单空空如也'
export const LOAD_EMPTY_DESC = '今天厨房休息，稍后再来看看吧'
export const LOAD_ERROR_TITLE = '数据没拿回来'
export const LOAD_ERROR_DESC = '可能是网络开小差了，再试一次？'

/** 筛选后无结果文案（Day 12） */
export const EMPTY_FILTER_TITLE = '没找到匹配的口味'
export const EMPTY_FILTER_DESC = '试试别的标签，或者点上面的「清空筛选」恢复全部'

/** 候选列表 */
export const LIST_TITLE = '候选菜单'

/** mealPeriod 字段 → 中文显示名（Day 8 列表卡片用） */
export const MEAL_PERIOD_LABELS: Record<MealPeriod, string> = {
  breakfast: '早餐',
  lunch: '午餐',
  dinner: '晚餐',
  snack: '夜宵',
}

/** 收藏按钮文案（Day 11）——四态：未收藏 / 处理中（收藏、取消两种）/ 已收藏 / 失败 */
export const FAV_ADD = '☆ 收藏'
export const FAV_ADD_PENDING = '收藏中…'
export const FAV_REMOVE_PENDING = '取消中…'
export const FAV_DONE = '★ 已收藏'
export const FAV_ERROR = '收藏失败，点我重试'

/** 评分区块标题 */
export const RATING_PROMPT = '给这次打个分？'
export const RATING_THANKS = '已记到你的浏览器啦 ✏️'

/**
 * 健康档案：刷新验证（Day 27 第三方试用最高优先级修复）
 *
 * 背景：真人试用时卡在「刷新一下，看数据还在不在」——
 *   1) 手机上内容不满一屏时下拉手势不触发刷新，微信内置浏览器里下拉也会被吃掉；
 *   2) 即便刷成功，刷新前后画面像素级一致，页面无法自证「数据还活着」。
 * 对策：给一个不依赖浏览器手势的刷新按钮（真重载 hash 路由会保留），
 *      并把「保存时间（刷新不变）」和「本次打开时间（刷新必变）」并排显示，
 *      让用户自己就能下结论。
 * 文案口径：说人话，不出现「localStorage / 缓存 / 持久化」这类词。
 */
export const HEALTH_REFRESH_BUTTON = '🔄 刷新页面'
export const HEALTH_SAVED_AT = '保存于'
export const HEALTH_OPENED_AT = '本次打开页面'
export const HEALTH_REFRESH_HINT =
  '点上面的「刷新页面」：保存于 那一行不会变（= 数据还在），本次打开页面 那一行会变（= 页面确实刷新了）'

/** 复制结果用的格式：{emoji} {name}\n{description}\n— 来自 {APP_NAME} */
export function buildShareText(
  emoji: string,
  name: string,
  description: string,
): string {
  return `${emoji} ${name}\n${description}\n— 来自 ${APP_NAME}`
}