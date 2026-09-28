// 抽卡按钮组件（Day 7 第 4 步）
// 同一个按钮，根据 phase 切换文案；rolling 时禁用
import { BUTTON_REROLL, BUTTON_ROLL } from '../lib/constants'
import type { GachaPhase } from '../types/food'

interface Props {
  phase: GachaPhase
  onClick: () => void
  /** 外部禁用（如 Day 12 筛选后候选池为空时）：与 rolling 禁用相或 */
  disabled?: boolean
}

export function GachaButton({ phase, onClick, disabled = false }: Props) {
  const isRolling = phase === 'rolling'
  const isDisabled = isRolling || disabled
  const label = phase === 'idle' ? BUTTON_ROLL : BUTTON_REROLL

  return (
    <button
      type="button"
      className="btn btn--primary"
      onClick={onClick}
      disabled={isDisabled}
      aria-label={label}
    >
      {isRolling ? '干饭中…' : label}
    </button>
  )
}