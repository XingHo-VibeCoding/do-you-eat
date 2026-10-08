// 收藏按钮组件（Day 11 板块②）
//
// 状态机分两条线，别混（同 App 的 loadPhase / gachaPhase 思路）：
//   数据状态 isFavorite（收没收藏）—— 父组件 App 持有，今天放前端内存
//   交互状态 phase（按钮进行到哪一步）—— 本组件自己持有
//     idle    = ☆ 收藏 / ★ 已收藏（长什么样取决于 isFavorite）
//     pending = 收藏中… / 取消中…（真禁用，防连点重复请求）
//     error   = 收藏失败，点我重试（说人话 + 给出路，失败不丢状态）
import { useEffect, useState } from 'react'
import { addFavorite, removeFavorite } from '../services/api'
import {
  FAV_ADD,
  FAV_ADD_PENDING,
  FAV_DONE,
  FAV_ERROR,
  FAV_REMOVE_PENDING,
} from '../lib/constants'

/** 按钮自己的交互状态机（「收没收藏」这个数据状态由父组件持有，不在这里） */
export type FavoritePhase = 'idle' | 'pending' | 'error'

interface Props {
  /** 当前食物 id */
  foodId: string
  /** 这道菜是否已被收藏（数据状态，App 持有） */
  isFavorite: boolean
  /** 收藏 / 取消成功后的回调：把最终状态交回 App */
  onChange: (foodId: string, next: boolean) => void
}

export function FavoriteButton({ foodId, isFavorite, onChange }: Props) {
  const [phase, setPhase] = useState<FavoritePhase>('idle')

  // 换了食物（重新抽卡）就重置交互状态，避免上一道菜的「失败」标带到下一道
  useEffect(() => {
    setPhase('idle')
  }, [foodId])

  const pending = phase === 'pending'

  const handleClick = () => {
    if (pending) return // disabled 属性已挡一层，这里再加保险（同 App.handleRoll 的写法）
    const next = !isFavorite
    setPhase('pending')
    const request = next ? addFavorite(foodId) : removeFavorite(foodId)
    request
      .then(() => {
        onChange(foodId, next)
        setPhase('idle')
      })
      .catch(() => {
        // 失败不丢状态：按钮回到可点击的样子，用户才有「重试」这个选项
        setPhase('error')
      })
  }

  // 渲染用文案：pending 要区分「正在收藏」和「正在取消」两种过程
  let text: string
  if (pending) {
    text = isFavorite ? FAV_REMOVE_PENDING : FAV_ADD_PENDING
  } else if (phase === 'error') {
    text = FAV_ERROR
  } else {
    text = isFavorite ? FAV_DONE : FAV_ADD
  }

  // 样式三变：done 实心金色 / error 红描边 / 其余默认描边（pending 靠 :disabled 变灰）
  const className = [
    'btn',
    'fav-btn',
    !pending && phase === 'error' ? 'fav-btn--error' : '',
    !pending && phase === 'idle' && isFavorite ? 'fav-btn--done' : '',
  ]
    .filter(Boolean)
    .join(' ')

  return (
    <button
      type="button"
      className={className}
      onClick={handleClick}
      disabled={pending}
      aria-pressed={isFavorite}
    >
      {text}
    </button>
  )
}
