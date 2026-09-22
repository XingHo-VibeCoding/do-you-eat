// 评分组件（Day 7 第 4 步）
// 交互：hover 预览、点击落分、再点同一颗 = 取消
// 读写严格走 src/services/storage.ts（AGENTS.md 第八节规则 1）
import { useEffect, useState } from 'react'
import { clearRating, getRating, setRating } from '../services/storage'
import { SCORE_LABELS } from '../lib/rating'
import type { RatingScore } from '../types/food'

interface Props {
  foodId: string
  /** 评分写入后回调（让 App 决定是否刷新其他视图） */
  onRated?: () => void
}

export function StarRating({ foodId, onRated }: Props) {
  const [currentScore, setCurrentScore] = useState<RatingScore | null>(null)
  const [hoverScore, setHoverScore] = useState<RatingScore | null>(null)

  // 当 foodId 变化（重抽结果），重置本地状态并同步 localStorage 当前值
  useEffect(() => {
    const stored = getRating(foodId)
    setCurrentScore(stored?.score ?? null)
    setHoverScore(null)
  }, [foodId])

  const handleClick = (score: RatingScore) => {
    if (currentScore === score) {
      // 再点同一颗 = 取消评分
      clearRating(foodId)
      setCurrentScore(null)
    } else {
      setRating(foodId, score)
      setCurrentScore(score)
    }
    onRated?.()
  }

  const previewScore = hoverScore ?? currentScore
  const label = previewScore ? SCORE_LABELS[previewScore] : '点星星打分'

  return (
    <div className="rating-row">
      <p className="stars__label" aria-live="polite">
        {label}
      </p>
      <div
        className="stars"
        role="radiogroup"
        aria-label="给这道菜打分，1~5 星"
      >
        {[1, 2, 3, 4, 5].map((n) => {
          const score = n as RatingScore
          const active = previewScore !== null && score <= previewScore
          return (
            <button
              key={n}
              type="button"
              className={`star${active ? ' star--active' : ''}`}
              aria-label={`${n} 星`}
              aria-checked={currentScore === score}
              role="radio"
              onMouseEnter={() => setHoverScore(score)}
              onMouseLeave={() => setHoverScore(null)}
              onClick={() => handleClick(score)}
            >
              {active ? '★' : '☆'}
            </button>
          )
        })}
      </div>
      {currentScore !== null && (
        <button
          type="button"
          className="rating-row__reset"
          onClick={() => {
            clearRating(foodId)
            setCurrentScore(null)
            onRated?.()
          }}
        >
          清除我的评分
        </button>
      )}
    </div>
  )
}