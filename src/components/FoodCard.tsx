// 候选列表里的单张食物卡片（Day 8 第 1 步）
// 可复用组件：只认 props（给什么画什么），不管数据从哪来。
// 设计原则：列表卡片要「可扫描」——emoji + 名字 + 一句话，扫一眼就够，
// 所以不放评分星星（评分只在抽卡结果卡上，避免一屏 24 组星星太吵）。
import { MEAL_PERIOD_LABELS } from '../lib/constants'
import type { Food } from '../types/food'

interface Props {
  food: Food
}

export function FoodCard({ food }: Props) {
  return (
    <article className="food-card">
      <header className="food-card__head">
        <span className="food-card__emoji" aria-hidden="true">
          {food.emoji}
        </span>
        <h3 className="food-card__name">{food.name}</h3>
        <span className="food-card__period">{MEAL_PERIOD_LABELS[food.mealPeriod]}</span>
      </header>
      <p className="food-card__desc">{food.description}</p>
      {food.tags.length > 0 && (
        <ul className="food-card__tags" aria-label="标签">
          {food.tags.map((tag) => (
            <li key={tag} className="food-card__tag">
              {tag}
            </li>
          ))}
        </ul>
      )}
    </article>
  )
}
