// 集中四态文案（Day 13 第 3 步）
//
// 为什么集中：
//   - 多个页面都需要 loading / empty / error 文案，分散写会各写各的，风格不统一
//   - 后续产品要改语气（比如「亲～」/「bro～」），改一处就够
//   - 任务清单要求的「四态文案表」就落实在这一个文件里
//
// 表结构：
//   - 按页面（Route）索引；每个页面有 loading / empty / error 三态（success 由页面自渲）
//   - health 是表单不是列表，不进此表（只有 success / 没填 两种情况）

export interface StateMessage {
  /** 卡片大标题（用户第一眼看到的） */
  title: string
  /** 卡片描述（一两句话补充） */
  desc: string
  /** 行动按钮文案；无则不渲染按钮 */
  action?: string
  /** 卡片顶部 emoji（视觉锚点） */
  icon: string
}

type LoadKind = 'loading' | 'empty' | 'error'
type RouteKey = '/' | '/library' | '/scenarios'

export const STATE_MESSAGES: Record<RouteKey, Record<LoadKind, StateMessage>> = {
  '/': {
    loading: {
      icon: '⏳',
      title: '正在为你准备…',
      desc: '数据马上就来',
    },
    empty: {
      icon: '🍽️',
      title: '这里还空空如也',
      desc: '添加第一道菜，开启你的美食之旅',
      action: '去添加',
    },
    error: {
      icon: '🙈',
      title: '出了点小问题',
      desc: '数据没拿到，请稍后再试',
      action: '再试一次',
    },
  },
  '/library': {
    loading: {
      icon: '⏳',
      title: '正在加载食物库…',
      desc: '马上看到你收藏的所有菜',
    },
    empty: {
      icon: '🍱',
      title: '食物库还空着',
      desc: '还没有任何食物，先去添加第一道吧',
      action: '去添加',
    },
    error: {
      icon: '🙈',
      title: '加载失败',
      desc: '食物库数据没拿到，请稍后再试',
      action: '再试一次',
    },
  },
  '/scenarios': {
    loading: {
      icon: '⏳',
      title: '正在准备场景数据…',
      desc: '马上就好',
    },
    empty: {
      icon: '🍽️',
      title: '这个场景下还没有菜',
      desc: '试试别的场景，或先去「食物库」补充',
      action: '去食物库',
    },
    error: {
      icon: '🙈',
      title: '场景加载失败',
      desc: '请稍后再试，或换个场景',
      action: '再试一次',
    },
  },
}