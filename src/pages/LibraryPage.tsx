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
//   - 每条食物右边有「删除」按钮；点击后调 API 删除并刷新列表
//
// Day 14 变更（用户测试最小修复）：列表头部加「只看收藏」开关。
//   起因：真人测试反馈「收藏的食物没有收藏夹，找不到」——收藏按下后无任何地方可回看。
//   修法：不新建页面，开关打开时列表只显示 App 下发的 favoriteIds 里的菜。
//   边界：收藏仍是内存版（Day 11 决策），刷新即清空，本修复不改变这一点。

import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from 'react'
import { StateCard } from '../components/StateCard'
import { DataUpdatedStamp } from '../components/DataUpdatedStamp'
import { addFood, fetchFoods, removeFood, ApiError } from '../services/api'
import { MEAL_PERIOD_LABELS } from '../lib/constants'
import { STATE_MESSAGES } from '../lib/stateMessages'
import type { Food, LoadPhase, MealPeriod } from '../types/food'

const MEAL_PERIOD_OPTIONS: readonly MealPeriod[] = ['breakfast', 'lunch', 'dinner', 'snack']

interface Props {
  /** 已收藏的食物 id 集合（Day 14 起由 App 持有并下发） */
  favoriteIds: ReadonlySet<string>
}

export function LibraryPage({ favoriteIds }: Props) {
  // —— 数据状态线 ——
  const [loadPhase, setLoadPhase] = useState<LoadPhase>('loading')
  const [foods, setFoods] = useState<readonly Food[]>([])
  // 最近一次拉取成功的时刻（Day 20 余力加练：供 DataUpdatedStamp 显示）
  const [updatedAt, setUpdatedAt] = useState<Date | null>(null)

  // —— 视图状态线（Day 14）——
  // 「只看收藏」开关：纯视图过滤，不影响数据本身
  const [showFavoritesOnly, setShowFavoritesOnly] = useState(false)

  /** 开关打开时只显示收藏的菜；关闭显示全部。依赖 favoriteIds，收藏变化会自动重算 */
  const visibleFoods = useMemo<readonly Food[]>(() => {
    if (!showFavoritesOnly) return foods
    return foods.filter((f) => favoriteIds.has(f.id))
  }, [foods, showFavoritesOnly, favoriteIds])

  // —— 新增表单状态线 ——
  const [name, setName] = useState('')
  const [emoji, setEmoji] = useState('🍽️')
  const [mealPeriod, setMealPeriod] = useState<MealPeriod>('lunch')
  const [tagsInput, setTagsInput] = useState('')
  const [formError, setFormError] = useState<string | null>(null)
  const nameInputRef = useRef<HTMLInputElement>(null)
  const [removeError, setRemoveError] = useState<string | null>(null)

  const load = useCallback(() => {
    setLoadPhase('loading')
    setFoods([])
    fetchFoods()
      .then((list) => {
        setFoods(list)
        setUpdatedAt(new Date())
        setLoadPhase(list.length === 0 ? 'empty' : 'success')
      })
      .catch(() => {
        setLoadPhase('error')
      })
  }, [])

  useEffect(() => {
    load()
  }, [load])

  const handleAdd = async (e: FormEvent<HTMLFormElement>) => {
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

    try {
      await addFood({
        name: trimmedName,
        emoji: trimmedEmoji,
        description: '', // 用户自定义描述留空，简单 MVP 边界
        mealPeriod,
        spicy: false,
        tags,
      })
      // 添加成功才清空表单（重复名 409 会被 catch 抓住显示错误，不会误清）
      setName('')
      setEmoji('🍽️')
      setTagsInput('')
      setFormError(null)
    } catch (err) {
      setFormError(err instanceof Error ? err.message : '添加失败，请稍后重试')
      return
    }
    load()
  }

  const handleRemove = async (id: string) => {
    try {
      await removeFood(id);
      setRemoveError(null);
    } catch (err) {
      if (err instanceof ApiError && err.status === 405) {
        setRemoveError('后端删除接口尚未上线，此功能将在后续版本开放');
      } else {
        setRemoveError('删除失败，请稍后重试');
      }
      return;
    }
    load();
  };

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
        <DataUpdatedStamp updatedAt={updatedAt} onRefresh={load} />
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
            <div className="library-view-bar">
              <h3 className="library-list-wrap__title">
                {showFavoritesOnly
                  ? `收藏的菜 · ${visibleFoods.length} 道`
                  : '全部食物'}
              </h3>
              {/* 复用 tag-chip 的胶囊样式；aria-pressed 三态与 TagFilter 的 chip 一致 */}
              <button
                type="button"
                className="tag-chip library-view-bar__fav-toggle"
                aria-pressed={showFavoritesOnly}
                onClick={() => setShowFavoritesOnly((v) => !v)}
              >
                ★ 只看收藏{favoriteIds.size > 0 ? `（${favoriteIds.size}）` : ''}
              </button>
            </div>

            {removeError !== null && (
              <p className="form-error" role="alert">
                {removeError}
              </p>
            )}

            {visibleFoods.length === 0 ? (
              <p className="library-list-wrap__empty">
                {showFavoritesOnly
                  ? '还没有收藏的菜——去首页抽一道，点「☆ 收藏」试试。'
                  : '暂无食物，去上面填一条吧。'}
              </p>
            ) : (
              <ul className="library-list" role="list">
                {visibleFoods.map((food) => (
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