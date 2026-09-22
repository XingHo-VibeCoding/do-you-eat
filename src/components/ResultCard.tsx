// 结果卡片组件（Day 7 第 4 步）
import { StarRating } from './StarRating'
import type { Food } from '../types/food'

interface Props {
  food: Food
  onRated?: () => void
}

export function ResultCard({ food, onRated }: Props) {
  return (
    <article className="card" aria-live="polite">
      <span className="card__emoji" aria-hidden="true">
        {food.emoji}
      </span>
      <h2 className="card__name">{food.name}</h2>
      <p className="card__desc">{food.description}</p>
      <StarRating foodId={food.id} onRated={onRated} />
    </article>
  )
}