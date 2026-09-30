// 首页：抽一抽（Day 13 第 2 步从 App.tsx 抽出）
//
// 这里的代码与 Day 7 ~ Day 12 的 App.tsx 主体一字未改：
//   - loadPhase  数据状态（loading / success / empty / error）
//   - gachaPhase 抽卡交互状态（idle / rolling / result）
//   - selectedTags 标签筛选（Day 12）
//
// 唯一改动：函数名 App → HomePage，并把外层 div 从 .app 改成 .page page--home，
// .app 这个最外层类留给路由壳。
//
// Day 14 变更：favoriteIds（Day 11 内存版）上提到 App.tsx——否则切页面即丢。
// 首页只消费 props，不再持有收藏状态。

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { GachaButton } from '../components/GachaButton'
import { IntroHint } from '../components/IntroHint'
import { ResultCard } from '../components/ResultCard'
import { FoodList } from '../components/FoodList'
import { TagFilter } from '../components/TagFilter'
import { fetchFoods } from '../services/mockApi'
import { pickRandom, ROLL_DURATION_MS } from '../lib/gacha'
import {
  BUTTON_RETRY,
  EMPTY_FILTER_DESC,
  EMPTY_FILTER_TITLE,
  LOAD_EMPTY_DESC,
  LOAD_EMPTY_TITLE,
  LOAD_ERROR_DESC,
  LOAD_ERROR_TITLE,
  LOAD_LOADING_TEXT,
  LIST_TITLE,
} from '../lib/constants'
import type { Food, GachaPhase, LoadPhase } from '../types/food'

interface Props {
  /** 已收藏的食物 id 集合（Day 14 起由 App 持有并下发） */
  favoriteIds: ReadonlySet<string>
  /** 收藏 / 取消收藏的落库回调（App 持有） */
  onToggleFavorite: (foodId: string, next: boolean) => void
}

export function HomePage({ favoriteIds, onToggleFavorite }: Props) {
  // —— 数据状态线 ——
  const [loadPhase, setLoadPhase] = useState<LoadPhase>('loading')
  const [foods, setFoods] = useState<readonly Food[]>([])

  // —— 抽卡状态线（Day 7 逻辑，原样保留）——
  const [gachaPhase, setGachaPhase] = useState<GachaPhase>('idle')
  const [current, setCurrent] = useState<Food | null>(null)
  const lastFoodRef = useRef<Food | undefined>(undefined)
  const timeoutRef = useRef<number | null>(null)

  // —— 收藏状态线（Day 11 起；Day 14 上移至 App.tsx，本组件只消费 props）——
  // 仍为内存版：不进 localStorage、不接后端，刷新即清空（Day 11 边界决策不变）。

  // —— 筛选状态线（Day 12）——
  // 选中一组 tag；用 Set 表达命中判断；不进 localStorage（刷新即清空，符合 MVP 边界）。
  const [selectedTags, setSelectedTags] = useState<ReadonlySet<string>>(() => new Set())

  /** 收集 foods 里所有出现过的 tag，按出现频次降序（高频在前 = 最有用的排前） */
  const allTags = useMemo<readonly string[]>(() => {
    const count = new Map<string, number>()
    for (const food of foods) {
      for (const tag of food.tags) {
        count.set(tag, (count.get(tag) ?? 0) + 1)
      }
    }
    return Array.from(count.entries())
      .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], 'zh-Hans-CN'))
      .map(([tag]) => tag)
  }, [foods])

  /** 过滤后的食物列表（Day 12 决策 Q1 修正为 AND 命中：选中的每个 tag 食物都要有）
   *  修正历史：
   *  1) 初版 OR（some）→ 结果只增不减，「无结果」状态永远到不了，三态测不全；
   *  2) 二版 every 方向写反（f.tags.every(t => selected.has(t)) 要求食物的全部 tag 都被选中），
   *     单选「辣」会变空集 —— 正确语义是「选中的每个 tag 食物都有」：selected.every(t => food.tags 含 t)。
   *  AND 也符合电商筛选「多条件=取交集」的通用心智。 */
  const filteredFoods = useMemo<readonly Food[]>(() => {
    if (selectedTags.size === 0) return foods
    return foods.filter((f) => Array.from(selectedTags).every((t) => f.tags.includes(t)))
  }, [foods, selectedTags])

  /** 单击 chip 的回调：存在则删、不在则加；交还新 Set 触发重渲染 */
  const handleToggleTag = useCallback((tag: string) => {
    setSelectedTags((prev) => {
      const next = new Set(prev)
      if (next.has(tag)) {
        next.delete(tag)
      } else {
        next.add(tag)
      }
      return next
    })
  }, [])

  /** 「清空筛选」：交还空 Set；UI 上的按钮也只在 size > 0 时出现 */
  const handleClearTags = useCallback(() => {
    setSelectedTags(new Set())
  }, [])

  /** 拉数据（首次进入 + 出错点「再试一次」都会走这里） */
  const load = useCallback(() => {
    setLoadPhase('loading')
    setFoods([])
    fetchFoods()
      .then((list) => {
        setFoods(list)
        // 数据到了但要区分「有货」和「空」两种情况，这就是空状态的来源
        setLoadPhase(list.length === 0 ? 'empty' : 'success')
      })
      .catch(() => {
        setLoadPhase('error')
      })
  }, [])

  // 首次渲染后拉一次数据
  useEffect(() => {
    load()
  }, [load])

  // 组件卸载时清理未触发的 timeout，避免 setState on unmounted 警告
  useEffect(() => {
    return () => {
      if (timeoutRef.current !== null) {
        window.clearTimeout(timeoutRef.current)
      }
    }
  }, [])

  const handleRoll = () => {
    if (gachaPhase === 'rolling') return // 按钮禁用已经挡了一层，这里再加保险
    // 筛选后为空时不让抽（避免 pickRandom 在空集里抛）；按钮也会 disabled
    if (filteredFoods.length === 0) return

    setGachaPhase('rolling')
    if (timeoutRef.current !== null) {
      window.clearTimeout(timeoutRef.current)
    }
    timeoutRef.current = window.setTimeout(() => {
      // 注意：候选池从「筛选后的 filteredFoods」里取（Day 12 Q2 决策：抽卡跟筛选走）
      const picked = pickRandom(filteredFoods, lastFoodRef.current)
      lastFoodRef.current = picked
      setCurrent(picked)
      setGachaPhase('result')
      timeoutRef.current = null
    }, ROLL_DURATION_MS)
  }

  /** 根据 loadPhase 渲染页面主体 */
  const renderBody = () => {
    if (loadPhase === 'loading') {
      return (
        <article className="card card--state" aria-live="polite">
          <span className="state-spinner" aria-hidden="true" />
          <p className="card__hint">{LOAD_LOADING_TEXT}</p>
        </article>
      )
    }

    if (loadPhase === 'empty') {
      return (
        <article className="card card--state" aria-live="polite">
          <span className="card__emoji" aria-hidden="true">
            🍽️
          </span>
          <h2 className="card__name">{LOAD_EMPTY_TITLE}</h2>
          <p className="card__desc">{LOAD_EMPTY_DESC}</p>
        </article>
      )
    }

    if (loadPhase === 'error') {
      return (
        <article className="card card--state" aria-live="polite">
          <span className="card__emoji" aria-hidden="true">
            🙈
          </span>
          <h2 className="card__name">{LOAD_ERROR_TITLE}</h2>
          <p className="card__desc">{LOAD_ERROR_DESC}</p>
          <button type="button" className="btn btn--secondary" onClick={load}>
            {BUTTON_RETRY}
          </button>
        </article>
      )
    }

    // —— success：抽卡区 + 候选列表 ——
    return (
      <>
        <section className="gacha">
          {gachaPhase === 'result' && current !== null ? (
            <ResultCard
              food={current}
              isFavorite={favoriteIds.has(current.id)}
              onToggleFavorite={onToggleFavorite}
            />
          ) : (
            <article className="card" aria-live="polite">
              <span className="card__emoji" aria-hidden="true">
                {gachaPhase === 'rolling' ? '🎲' : '🍱'}
              </span>
              {gachaPhase === 'idle' ? (
                <IntroHint />
              ) : (
                <p className="card__hint">命运正在决定…</p>
              )}
            </article>
          )}

          <GachaButton
            phase={gachaPhase}
            onClick={handleRoll}
            disabled={filteredFoods.length === 0}
          />
        </section>

        <section className="food-list-wrap" aria-label={LIST_TITLE}>
          <h2 className="food-list-wrap__title">{LIST_TITLE}</h2>
          <TagFilter
            allTags={allTags}
            selected={selectedTags}
            onToggle={handleToggleTag}
            onClear={handleClearTags}
          />
          {selectedTags.size > 0 && filteredFoods.length === 0 ? (
            <article className="card card--state card--filter-empty" aria-live="polite">
              <span className="card__emoji" aria-hidden="true">
                🔍
              </span>
              <h3 className="card__name">{EMPTY_FILTER_TITLE}</h3>
              <p className="card__desc">{EMPTY_FILTER_DESC}</p>
            </article>
          ) : (
            <FoodList foods={filteredFoods} />
          )}
        </section>
      </>
    )
  }

  // 注意：.is-rolling 类从 App.tsx 的 .app 下移到本组件的 .page--home 下
  // CSS 用的是 .is-rolling .card 这种子代选择器，所以只要 .is-rolling 加在 .card 的祖先上就有效
  return (
    <div className={`page page--home${gachaPhase === 'rolling' ? ' is-rolling' : ''}`}>
      {renderBody()}
    </div>
  )
}