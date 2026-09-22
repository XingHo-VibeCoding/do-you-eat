// 内置食物库（Day 7 第 2 步）
// 设计依据：TECH_DESIGN.md §3.1 + Day 5 决策 D3（TS 内置数组，IDE 友好）
// 覆盖 4 个 mealPeriod，每条带 emoji + 一句话俏皮文案
// MVP 共 24 条，足够支撑「随机出菜 + 重抽」的体验；后续可继续追加

import type { Food } from '../types/food'

export const FOODS: readonly Food[] = [
  // —— 早餐 —— 6
  {
    id: 'f001',
    name: '豆浆油条',
    emoji: '🥛',
    description: '黄金搭档，趁热咬一口就是宿舍的早晨',
    mealPeriod: 'breakfast',
    spicy: false,
    tags: ['咸口', '传统'],
  },
  {
    id: 'f002',
    name: '小笼包',
    emoji: '🥟',
    description: '先开窗再喝汤，不然会烫到怀疑人生',
    mealPeriod: 'breakfast',
    spicy: false,
    tags: ['汤汁', '鲜'],
  },
  {
    id: 'f003',
    name: '皮蛋瘦肉粥',
    emoji: '🍲',
    description: '感冒初愈的胃，靠它温柔接住',
    mealPeriod: 'breakfast',
    spicy: false,
    tags: ['清淡', '养胃'],
  },
  {
    id: 'f004',
    name: '鸡蛋灌饼',
    emoji: '🌯',
    description: '鸡蛋从饼里炸出来的那一刻，是大学早餐的高光',
    mealPeriod: 'breakfast',
    spicy: false,
    tags: ['路边摊', '饱腹'],
  },
  {
    id: 'f005',
    name: '茶叶蛋',
    emoji: '🥚',
    description: '便宜又顶饿，自习到昏昏欲睡的好搭档',
    mealPeriod: 'breakfast',
    spicy: false,
    tags: ['便携', '便宜'],
  },
  {
    id: 'f006',
    name: '燕麦杯',
    emoji: '🥣',
    description: '假装养生的第一站',
    mealPeriod: 'breakfast',
    spicy: false,
    tags: ['健康', '宿舍 DIY'],
  },

  // —— 午餐 —— 6
  {
    id: 'f007',
    name: '黄焖鸡米饭',
    emoji: '🍗',
    description: '国民下饭神器，三碗米饭打底',
    mealPeriod: 'lunch',
    spicy: true,
    tags: ['下饭', '米饭'],
  },
  {
    id: 'f008',
    name: '麻辣香锅',
    emoji: '🌶️',
    description: '选菜三分钟，吃完三小时',
    mealPeriod: 'lunch',
    spicy: true,
    tags: ['辣', '自选'],
  },
  {
    id: 'f009',
    name: '兰州拉面',
    emoji: '🍜',
    description: '「二细，辣子多些」，是西北孩子的接头暗号',
    mealPeriod: 'lunch',
    spicy: true,
    tags: ['面食', '汤面'],
  },
  {
    id: 'f010',
    name: '宫保鸡丁盖饭',
    emoji: '🍛',
    description: '花生脆、鸡丁嫩，米饭要再来一碗',
    mealPeriod: 'lunch',
    spicy: true,
    tags: ['盖饭', '经典'],
  },
  {
    id: 'f011',
    name: '沙县拌面',
    emoji: '🥢',
    description: '国民食堂，4 块钱的快乐',
    mealPeriod: 'lunch',
    spicy: false,
    tags: ['便宜', '快餐'],
  },
  {
    id: 'f012',
    name: '番茄鸡蛋饭',
    emoji: '🍅',
    description: '不知道吃啥的时候，番茄鸡蛋从不背叛你',
    mealPeriod: 'lunch',
    spicy: false,
    tags: ['保底', '家常'],
  },

  // —— 晚餐 —— 6
  {
    id: 'f013',
    name: '重庆小面',
    emoji: '🌶️',
    description: '辣到鼻尖冒汗，但就是停不下来',
    mealPeriod: 'dinner',
    spicy: true,
    tags: ['辣', '面食'],
  },
  {
    id: 'f014',
    name: '烤肉拌饭',
    emoji: '🍱',
    description: '酱汁拌开的那一瞬间，是打工人的治愈时刻',
    mealPeriod: 'dinner',
    spicy: false,
    tags: ['韩式', '拌饭'],
  },
  {
    id: 'f015',
    name: '酸菜鱼',
    emoji: '🐟',
    description: '酸辣鲜香，宿舍夜宵局的硬菜',
    mealPeriod: 'dinner',
    spicy: true,
    tags: ['硬菜', '聚餐'],
  },
  {
    id: 'f016',
    name: '烤鱼',
    emoji: '🐠',
    description: '一个炉子撑起一桌人的快乐',
    mealPeriod: 'dinner',
    spicy: true,
    tags: ['聚餐', '硬菜'],
  },
  {
    id: 'f017',
    name: '蛋炒饭',
    emoji: '🍚',
    description: '「妈妈的味道」全国统一答案',
    mealPeriod: 'dinner',
    spicy: false,
    tags: ['家常', '快手'],
  },
  {
    id: 'f018',
    name: '螺蛳粉',
    emoji: '🌀',
    description: '爱的爱死，恨的恨死，整层楼的鼻子都知道你吃了',
    mealPeriod: 'dinner',
    spicy: true,
    tags: ['臭味', '网红'],
  },

  // —— 夜宵 —— 6
  {
    id: 'f019',
    name: '烤冷面',
    emoji: '🫓',
    description: '「加蛋加肠加芝士」，后街路口的标准台词',
    mealPeriod: 'snack',
    spicy: false,
    tags: ['夜宵', '后街'],
  },
  {
    id: 'f020',
    name: '鸡柳年糕',
    emoji: '🍢',
    description: '裹满酱汁的年糕，是深夜的甜蜜暴击',
    mealPeriod: 'snack',
    spicy: false,
    tags: ['夜宵', '甜辣'],
  },
  {
    id: 'f021',
    name: '奶茶',
    emoji: '🧋',
    description: '三分糖去冰，是大学生最后的倔强',
    mealPeriod: 'snack',
    spicy: false,
    tags: ['饮品', '续命'],
  },
  {
    id: 'f022',
    name: '关东煮',
    emoji: '🍡',
    description: '热汤下肚，所有 emo 都能被熬掉一半',
    mealPeriod: 'snack',
    spicy: false,
    tags: ['暖胃', '汤'],
  },
  {
    id: 'f023',
    name: '烤红薯',
    emoji: '🍠',
    description: '冬天的手心暖源，顺便蹭个手套味',
    mealPeriod: 'snack',
    spicy: false,
    tags: ['秋冬', '路边'],
  },
  {
    id: 'f024',
    name: '蛋仔冰淇淋',
    emoji: '🍨',
    description: '甜筒和华夫的混血儿，拍照大于吃',
    mealPeriod: 'snack',
    spicy: false,
    tags: ['甜品', '出片'],
  },
]

/**
 * 按 id 查 Food；找不到返回 undefined（上游应当兜底）
 */
export function findFoodById(id: string): Food | undefined {
  return FOODS.find((f) => f.id === id)
}