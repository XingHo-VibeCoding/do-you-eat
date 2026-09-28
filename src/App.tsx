// 应用主组件（Day 7 第 4 步初版；Day 8 接入数据四态 + 候选列表）
//
// 现在页面里有两条状态线，别混：
//   loadPhase  = 数据状态（loading / success / empty / error），管「食堂数据拿没拿到」
//   gachaPhase = 交互状态（idle / rolling / result），管「这一次抽卡进行到哪一步」
// 只有 loadPhase === 'success' 时才有抽卡区和候选列表 —— 没数据就抽不了卡。
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { GachaButton } from './components/GachaButton'
import { IntroHint } from './components/IntroHint'
import { ResultCard } from './components/ResultCard'
import { FoodList } from './components/FoodList'
import { TagFilter } from './components/TagFilter'
import { fetchFoods } from './services/mockApi'
import { pickRandom, ROLL_DURATION_MS } from './lib/gacha'
import {
  APP_NAME,
  APP_TAGLINE,
  BUTTON_RETRY,
  EMPTY_FILTER_DESC,
  EMPTY_FILTER_TITLE,
  LOAD_EMPTY_DESC,
  LOAD_EMPTY_TITLE,
  LOAD_ERROR_DESC,
  LOAD_ERROR_TITLE,
  LOAD_LOADING_TEXT,
  LIST_TITLE,
} from './lib/constants'
import type { Food, GachaPhase, LoadPhase } from './types/food'

function App() {
  // —— 数据状态线 ——
  const [loadPhase, setLoadPhase] = useState<LoadPhase>('loading')
  const [foods, setFoods] = useState<readonly Food[]>([])

  // —— 抽卡状态线（Day 7 逻辑，原样保留）——
  const [gachaPhase, setGachaPhase] = useState<GachaPhase>('idle')
  const [current, setCurrent] = useState<Food | null>(null)
  const lastFoodRef = useRef<Food | undefined>(undefined)
  const timeoutRef = useRef<number | null>(null)

  // —— 收藏状态线（Day 11）——
  // 前端临时状态：只放内存（useState），不进 localStorage、不接后端，刷新即清空。
  // 按今天的任务边界：收藏不属于评分，所以不走 storage.ts；将来接云端时单独开 service。
  const [favoriteIds, setFavoriteIds] = useState<ReadonlySet<string>>(() => new Set())

  /** 收藏 / 取消收藏成功后的落库（内存版）：交给 FavoriteButton 成功回调 */
  const handleToggleFavorite = useCallback((foodId: string, next: boolean) => {
    setFavoriteIds((prev) => {
      const nextSet = new Set(prev)
      if (next) {
        nextSet.add(foodId)
      } else {
        nextSet.delete(foodId)
      }
      return nextSet
    })
  }, [])

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
              onToggleFavorite={handleToggleFavorite}
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

  return (
    <div className={`app${gachaPhase === 'rolling' ? ' is-rolling' : ''}`}>
      <header className="app__header">
        <h1 className="app__title">{APP_NAME}</h1>
        <p className="app__tagline">{APP_TAGLINE}</p>
      </header>

      {renderBody()}

      <footer className="copy-line" aria-hidden="true">
        —— 决定不下，就让概率来 ——{' '}
      </footer>
    </div>
  )
}

export default App
