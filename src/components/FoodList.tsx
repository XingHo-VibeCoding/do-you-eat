// 候选食物列表（Day 8 第 1 步）
// 可复用组件：数据 + FoodCard 之间的「排版层」。
// 响应式（桌面多栏 / 手机单栏）由 CSS 的 .food-grid 完成，见 app.css。
import { FoodCard } from './FoodCard'
import type { Food } from '../types/food'

interface Props {
  foods: readonly Food[]
}

export function FoodList({ foods }: Props) {
  if (foods.length === 0) return null // 空数组的展示交给 App 层的 empty 状态，列表只管「有东西」的情况

  return (
    <section className="food-list" aria-label="候选菜单">
      <ul className="food-grid">
        {foods.map((food) => (
          <li key={food.id} className="food-grid__item">
            <FoodCard food={food} />
          </li>
        ))}
      </ul>
    </section>
  )
}
