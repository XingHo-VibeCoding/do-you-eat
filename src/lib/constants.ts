// 全局常量（Day 7 第 3 步）
// 文案集中处：所有面向用户的字句都从这里出，便于后续打磨 / i18n 替换

export const APP_NAME = 'do you eat'
export const APP_TAGLINE = '今天吃啥'

/** 按钮文案 */
export const BUTTON_ROLL = '开始干饭'
export const BUTTON_REROLL = '不行，重来'
export const BUTTON_RESET_RATING = '清除我的评分'

/** 空状态 / 引导 */
export const INTRO_HINT =
  '点上面的按钮，让命运决定你今天吃啥 🍜'

/** 评分区块标题 */
export const RATING_PROMPT = '给这次打个分？'
export const RATING_THANKS = '已记到你的浏览器啦 ✏️'

/** 复制结果用的格式：{emoji} {name}\n{description}\n— 来自 {APP_NAME} */
export function buildShareText(
  emoji: string,
  name: string,
  description: string,
): string {
  return `${emoji} ${name}\n${description}\n— 来自 ${APP_NAME}`
}