// 标签筛选器（Day 12）
// 可复用组件：tags 多选 chip + 「清空」按钮。
// 选中状态用 aria-pressed 表达（不仅靠颜色——满足可访问性）。
import type { MouseEvent } from 'react'

interface Props {
  /** 数据里全部 tag（去重、按出现频次降序排好序） */
  allTags: readonly string[]
  /** 当前选中的 tag 集合 */
  selected: ReadonlySet<string>
  /** 单击 chip 时的回调；组件不做 Set 拷贝，由调用方负责不可变更新 */
  onToggle: (tag: string) => void
  /** 单击「清空」按钮的回调 */
  onClear: () => void
}

export function TagFilter({ allTags, selected, onToggle, onClear }: Props) {
  // 没数据就别渲染（防御：上游 foods 为空时也不出现空容器）
  if (allTags.length === 0) return null

  // 「清空」按钮的 stopPropagation 避免冒泡到 chip（双保险，父级也没有 onClick 容器）
  const handleClear = (e: MouseEvent<HTMLButtonElement>) => {
    e.stopPropagation()
    onClear()
  }

  return (
    <div className="tag-filter" role="group" aria-label="按标签筛选">
      {allTags.map((tag) => {
        const isActive = selected.has(tag)
        return (
          <button
            key={tag}
            type="button"
            className={`tag-chip${isActive ? ' tag-chip--active' : ''}`}
            aria-pressed={isActive}
            onClick={() => onToggle(tag)}
          >
            #{tag}
          </button>
        )
      })}
      {selected.size > 0 && (
        <button type="button" className="tag-filter__clear" onClick={handleClear}>
          清空筛选
        </button>
      )}
    </div>
  )
}