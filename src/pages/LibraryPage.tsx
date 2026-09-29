// 食物库页面（Day 13 第 3 步）
//  浏览全部食物 + 新增 / 删除 + 四态
//
// 四态来源：
//   loading  → fetchFoods 在路上
//   success  → 拉到非空列表
//   empty    → 列表为空（用户可能把所有食物都删了）
//   error    → fetchFoods reject（演示可用 ?mode=error）
//
// 设计要点：
//   - 「新增食物」表单始终可见（success 时）；empty 时点击空状态卡片的「去添加」
//     按钮会把焦点移到表单的菜名输入框上
//   - 每条食物右边有「删除」按钮；点击立即从 mockApi 移除并刷新列表

import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react'
import { StateCard } from '../components/StateCard'
import { addFood, fetchFoods, removeFood } from '../services/mockApi'
import { MEAL_PERIOD_LABELS } from '../lib/constants'
import { STATE_MESSAGES } from '../lib/stateMessages'
import type { Food, LoadPhase, MealPeriod } from '../types/food'

const MEAL_PERIOD_OPTIONS: readonly MealPeriod[] = ['breakfast', 'lunch', 'dinner', 'snack']

export function LibraryPage() {
  // —— 数据状态线 ——
  const [loadPhase, setLoadPhase] = useState<LoadPhase>('loading')
  const [foods, setFoods] = useState<readonly Food[]>([])

  // —— 新增表单状态线 ——
  const [name, setName] = useState('')
  const [emoji, setEmoji] = useState('🍽️')
  const [mealPeriod, setMealPeriod] = useState<MealPeriod>('lunch')
  const [tagsInput, setTagsInput] = useState('')
  const [formError, setFormError] = useState<string | null>(null)
  const nameInputRef = useRef<HTMLInputElement>(null)

  const load = useCallback(() => {
    setLoadPhase('loading')
    setFoods([])
    fetchFoods()
      .then((list) => {
        setFoods(list)
        setLoadPhase(list.length === 0 ? 'empty' : 'success')
      })
      .catch(() => {
        setLoadPhase('error')
      })
  }, [])

  useEffect(() => {
    load()
  }, [load])

  const handleAdd = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    const trimmedName = name.trim()
    if (trimmedName.length === 0) {
      setFormError('请先填一个菜名')
      nameInputRef.current?.focus()
      return
    }
    const trimmedEmoji = emoji.trim() || '🍽️'
    // tags 用中英文逗号分隔；trim 掉空白；丢空串
    const tags = tagsInput
      .split(/[,，]/)
      .map((s) => s.trim())
      .filter((s) => s.length > 0)

    addFood({
      name: trimmedName,
      emoji: trimmedEmoji,
      description: '', // 用户自定义描述留空，简单 MVP 边界
      mealPeriod,
      spicy: false,
      tags,
    })
    // 清空表单，保留餐段默认值（用户多半连续加同一餐）
    setName('')
    setEmoji('🍽️')
    setTagsInput('')
    setFormError(null)
    // 重拉触发 success 状态更新
    load()
  }

  const handleRemove = (id: string) => {
    removeFood(id)
    load()
  }

  const handleFocusAddForm = () => {
    nameInputRef.current?.focus()
  }

  const renderBody = () => {
    switch (loadPhase) {
      case 'loading':
        return <StateCard message={STATE_MESSAGES['/library'].loading} />
      case 'empty':
        return (
          <StateCard
            message={STATE_MESSAGES['/library'].empty}
            onAction={handleFocusAddForm}
          />
        )
      case 'error':
        return (
          <StateCard
            message={STATE_MESSAGES['/library'].error}
            onAction={load}
          />
        )
      case 'success':
        return null
    }
  }

  return (
    <div className="page page--library">
      <header className="page__header">
        <h2 className="page__title">食物库</h2>
        <p className="page__subtitle">浏览 / 新增 / 删除食物 · 共 {foods.length} 道</p>
      </header>

      {renderBody()}

      {/* success 阶段才显示新增表单与列表；其他阶段状态卡片已经占满 */}
      {loadPhase === 'success' && (
        <>
          <article className="card library-form-card">
            <h3 className="library-form-card__title">新增食物</h3>
            <form className="library-form" onSubmit={handleAdd} aria-label="新增食物表单">
              <div className="form-row">
                <label className="form-label" htmlFor="lib-name">
                  菜名
                </label>
                <input
                  id="lib-name"
                  ref={nameInputRef}
                  className="form-input"
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="例如：番茄鸡蛋饭"
                  maxLength={20}
                />
              </div>
              <div className="form-row form-row--split">
                <div>
                  <label className="form-label" htmlFor="lib-emoji">
                    配图
                  </label>
                  <input
                    id="lib-emoji"
                    className="form-input form-input--emoji"
                    type="text"
                    value={emoji}
                    onChange={(e) => setEmoji(e.target.value)}
                    placeholder="🍽️"
                    maxLength={4}
                  />
                </div>
                <div>
                  <label className="form-label" htmlFor="lib-period">
                    餐段
                  </label>
                  <select
                    id="lib-period"
                    className="form-input"
                    value={mealPeriod}
                    onChange={(e) => setMealPeriod(e.target.value as MealPeriod)}
                  >
                    {MEAL_PERIOD_OPTIONS.map((p) => (
                      <option key={p} value={p}>
                        {MEAL_PERIOD_LABELS[p]}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
              <div className="form-row">
                <label className="form-label" htmlFor="lib-tags">
                  标签（逗号分隔）
                </label>
                <input
                  id="lib-tags"
                  className="form-input"
                  type="text"
                  value={tagsInput}
                  onChange={(e) => setTagsInput(e.target.value)}
                  placeholder="例如：下饭, 家常"
                />
              </div>
              {formError !== null && (
                <p className="form-error" role="alert">
                  {formError}
                </p>
              )}
              <button type="submit" className="btn btn--primary">
                添加到食物库
              </button>
            </form>
          </article>

          <section className="library-list-wrap" aria-label="食物列表">
            <h3 className="library-list-wrap__title">全部食物</h3>
            {foods.length === 0 ? (
              <p className="library-list-wrap__empty">暂无食物，去上面填一条吧。</p>
            ) : (
              <ul className="library-list" role="list">
                {foods.map((food) => (
                  <li key={food.id} className="library-list__item">
                    <span className="library-list__emoji" aria-hidden="true">
                      {food.emoji}
                    </span>
                    <div className="library-list__body">
                      <span className="library-list__name">{food.name}</span>
                      <span className="library-list__meta">
                        {MEAL_PERIOD_LABELS[food.mealPeriod]}
                        {food.tags.length > 0 ? ` · ${food.tags.join(' · ')}` : ''}
                      </span>
                    </div>
                    <button
                      type="button"
                      className="btn btn--ghost library-list__remove"
                      onClick={() => handleRemove(food.id)}
                      aria-label={`删除 ${food.name}`}
                    >
                      删除
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </>
      )}
    </div>
  )
}