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

/**
 * AI 健康助手页文案（Day 29）
 *
 * 文案口径（说人话，与既有页面一致）：
 * - 不出现「大模型 / API / 云端 / 数据库」这类实现词，用户不需要知道背后是谁在回答；
 * - 出错时不甩英文裸报错，一律经 friendlyErrorMessage() 翻译；
 * - 页面要能在「档案 / 记录 / 助手」三件事各自独立失败时照常可用。
 */
export const ASSISTANT_PAGE_TITLE = 'AI 健康助手'
export const ASSISTANT_PAGE_SUBTITLE = '点气泡开始，或者直接问我'
export const ASSISTANT_INPUT_PLACEHOLDER = '问我点什么，比如「晚上饿了吃什么不胖」'
export const ASSISTANT_SEND = '发送'
export const ASSISTANT_THINKING = '让我想想…'

/** 四个气泡 */
export const BUBBLE_LOG = '要收集今天的健康数据吗？'
export const BUBBLE_EAT = '今天想吃什么？'
export const BUBBLE_CHART = '看看我的体重变化 →'
export const BUBBLE_CHAT = '聊两句'

/** 卡片标题 */
export const CARD_TITLE_LOG = '今天的健康数据'
export const CARD_TITLE_EAT = '今天吃什么'
export const CARD_TITLE_CHART = '体重变化'
export const CARD_TITLE_CHAT = '聊聊'

/** 卡片区空态：还没点任何气泡时显示 */
export const ASSISTANT_IDLE_TITLE = '今天想先做点什么？'
export const ASSISTANT_IDLE_DESC = '点上面任意一个气泡，或者直接在下面问我'

/** 记录表单 */
export const LOG_LABEL_WEIGHT = '体重（kg）'
export const LOG_LABEL_SLEEP = '睡眠（小时）'
export const LOG_LABEL_WATER = '饮水（ml）'
export const LOG_LABEL_MOOD = '心情'
export const LOG_LABEL_MEALS = '吃了什么'
export const LOG_LABEL_NOTE = '备注'
export const LOG_MEALS_HINT = '用逗号分隔，例如：麻婆豆腐，米饭'
export const LOG_PH_WEIGHT = '67.0'
export const LOG_PH_SLEEP = '7.5'
export const LOG_PH_WATER = '1500'
export const LOG_PH_NOTE = '今天感觉怎么样？'
export const LOG_FORM_ARIA = '今日健康数据表单'
export const LOG_MOOD_ARIA = '选择今天的心情'
export const LOG_DELETE_ARIA = '删除今天的记录'
export const LOG_SUBMIT = '记下来'
export const LOG_SAVING = '记下中…'
export const LOG_DELETE = '删掉今天'
export const LOG_STORED_HINT = '今天已经记过，改完再点一次「记下来」就会更新，没填的项会保留原值'

/** 图表 */
export const CHART_EMPTY_TITLE = '还画不出折线'
export const CHART_EMPTY_DESC = '至少要有两天的体重记录才能连成线，先去记两天？'
export const CHART_LABEL_MAX = '最高'
export const CHART_LABEL_MIN = '最低'
export const CHART_SUMMARY_COUNT = '次记录'
export const CHART_SUMMARY_DIFF = '首尾相差'

/** 折线图给屏幕阅读器读的整句描述（界面上看不到，但读屏软件会照着念） */
export function buildChartSummary(
  count: number,
  from: { date: string; weightKg: number },
  to: { date: string; weightKg: number },
): string {
  return `体重从 ${from.date} 的 ${from.weightKg} 公斤，变化到 ${to.date} 的 ${to.weightKg} 公斤，共 ${count} 次记录`
}

/** 档案（折叠区） */
export const PROFILE_TOGGLE = '我的资料'
export const PROFILE_TOGGLE_OPEN = '收起资料'
export const PROFILE_EMPTY = '填一下身高体重，我才能按你的情况给建议'
export const PROFILE_SUBMIT = '保存资料'
export const PROFILE_CLEAR = '清空'
export const PROFILE_SAVED_AT = '资料保存于'
export const PROFILE_LABEL_HEIGHT = '身高（cm）'
export const PROFILE_LABEL_WEIGHT = '体重（kg）'
export const PROFILE_LABEL_AGE = '年龄'
export const PROFILE_PH_HEIGHT = '例如 170'
export const PROFILE_PH_WEIGHT = '例如 60'
export const PROFILE_PH_AGE = '例如 25'
export const PROFILE_SECTION_ARIA = '我的资料'
export const PROFILE_FORM_ARIA = '健康档案表单'
export const PROFILE_CLEAR_ARIA = '清空资料'

/** 页面里几处无障碍标签（屏幕阅读器用，界面上看不到） */
export const ASSISTANT_STAGE_ARIA = '健康助手'
export const ASSISTANT_ASK_ARIA = '向助手提问'
export const ASSISTANT_QUESTION_ARIA = '提问内容'

/** 卡片里 AI 回答的署名 */
export const REPLY_FROM_AI = '我想说：'

/** 复制结果用的格式：{emoji} {name}\n{description}\n— 来自 {APP_NAME} */
export function buildShareText(
  emoji: string,
  name: string,
  description: string,
): string {
  return `${emoji} ${name}\n${description}\n— 来自 ${APP_NAME}`
}