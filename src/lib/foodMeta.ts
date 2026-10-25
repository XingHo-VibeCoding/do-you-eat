// 食堂真实数据的「价格 + 档口」展示串（Day 30 第 3 步；第 6 步加固 null 兼容）
// 只有采集来的食堂菜品才有这三项；老数据是通用菜名，没有价格档口，返回空串由调用方跳过。
import type { Food } from '../types/food'

/**
 * 例：
 *   ¥7 · 大食堂 · 风味餐厅
 *   ¥9.8 · 二楼西区食堂
 *   老数据（无 price）→ ''
 *
 * 为什么要 typeof 判断而不是 `!== undefined`：数据已经上云（Day 30），
 * 走的是 PostgreSQL 而不是本地 TS 数组。老行查出来 price 是 **null**
 * （不是 undefined），`null !== undefined` 为真，会拼出「¥null」。
 * location / canteenType 同理是 null——好在这俩用真值判断，null 本身 falsy。
 */
export function formatFoodMeta(food: Food): string {
  const parts: string[] = []

  // price 走云端后可能是 number（有值）/ null（老数据）/ 极少数情况下的字符串
  const raw: unknown = food.price
  const price = typeof raw === 'number' ? raw : typeof raw === 'string' ? Number(raw) : NaN
  if (Number.isFinite(price)) parts.push(`¥${price}`)

  if (food.location) parts.push(food.location)
  if (food.canteenType) parts.push(food.canteenType)
  return parts.join(' · ')
}
