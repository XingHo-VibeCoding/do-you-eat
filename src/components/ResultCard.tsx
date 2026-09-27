// 结果卡片组件（Day 7 第 4 步；Day 11 板块②增加收藏按钮，布局原样保留）
import { StarRating } from './StarRating'
import { FavoriteButton } from './FavoriteButton'
import type { Food } from '../types/food'

interface Props {
  food: Food
  onRated?: () => void
  /** 这道菜是否已被收藏（数据状态由 App 持有，Day 11 前端临时状态） */
  isFavorite: boolean
  /** 收藏 / 取消收藏成功后，把最终状态交回 App */
  onToggleFavorite: (foodId: string, next: boolean) => void
}

export function ResultCard({ food, onRated, isFavorite, onToggleFavorite }: Props) {
  return (
    <article className="card" aria-live="polite">
      <span className="card__emoji" aria-hidden="true">
        {food.emoji}
      </span>
      <h2 className="card__name">{food.name}</h2>
      <p className="card__desc">{food.description}</p>
      <StarRating foodId={food.id} onRated={onRated} />
      <FavoriteButton
        foodId={food.id}
        isFavorite={isFavorite}
        onChange={onToggleFavorite}
      />
    </article>
  )
}