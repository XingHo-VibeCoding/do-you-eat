// 抽卡相关纯函数（Day 7 第 3 步）
// 设计依据：TECH_DESIGN.md §4（业务逻辑层），无副作用、可单测

/**
 * 从数组中等概率抽一个元素。
 * @param items 候选数组（不能为空，否则抛错 —— UI 层应保证 ≥1 条）
 * @param exclude 可选排除项；常用于「不行，重来」时避免连出同一道
 */
export function pickRandom<T>(items: readonly T[], exclude?: T): T {
  if (items.length === 0) {
    throw new Error('pickRandom：候选数组为空')
  }
  if (items.length === 1) return items[0]
  if (exclude !== undefined && items.length === 2) {
    // 候选只有 2 个且要排除 1 个时，直接返回另一个
    return items.find((x) => x !== exclude) ?? items[0]
  }
  // 均匀随机：Math.floor 永远不会等于 length，可安全用作索引
  const idx = Math.floor(Math.random() * items.length)
  return items[idx]
}

/**
 * 抽卡按钮的转盘动画时长（毫秒）。
 * 调 1.2 秒：太短显得敷衍，太长用户会以为卡了。
 */
export const ROLL_DURATION_MS = 1200

/**
 * 是否处于「抽卡中」（用于屏蔽按钮防双击 & 控制 UI）。
 */
export function isRolling(phase: 'idle' | 'rolling' | 'result'): boolean {
  return phase === 'rolling'
}