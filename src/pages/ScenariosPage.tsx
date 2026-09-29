// 场景抽取页面（Day 13 第 3 步）
//
// 功能：选一个用餐时段（早 / 午 / 晚 / 夜宵），从该时段的候选池里抽一道菜。
// 注：任务清单提到的「中国八大菜系抽取」需要 Food.cuisine 字段，
//     当前 foods.ts 24 条数据未带菜系字段，列入「下一步计划」——
//     强行做也是「永远 empty」没有演示价值。
//
// 四态来源：
//   loading  → fetchFoods 在路上
//   success  → 列表非空（无论筛后是否非空，列表本身有）
//   empty    → 列表为空（用户把食物都删了），当前场景也没候选
//   error    → fetchFoods reject（演示用 ?mode=error）

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { StateCard } from '../components/StateCard'
import { fetchFoods } from '../services/mockApi'
import { pickRandom, ROLL_DURATION_MS } from '../lib/gacha'
import { MEAL_PERIOD_LABELS } from '../lib/constants'
import { STATE_MESSAGES } from '../lib/stateMessages'
import type { Food, GachaPhase, LoadPhase, MealPeriod } from '../types/food'

interface ScenarioOption {
  key: MealPeriod
  label: string
  icon: string
}

const SCENARIOS: readonly ScenarioOption[] = [
  { key: 'breakfast', label: MEAL_PERIOD_LABELS.breakfast, icon: '🌅' },
  { key: 'lunch', label: MEAL_PERIOD_LABELS.lunch, icon: '☀️' },
  { key: 'dinner', label: MEAL_PERIOD_LABELS.dinner, icon: '🌙' },
  { key: 'snack', label: MEAL_PERIOD_LABELS.snack, icon: '🌃' },
]

export function ScenariosPage() {
  const [loadPhase, setLoadPhase] = useState<LoadPhase>('loading')
  const [foods, setFoods] = useState<readonly Food[]>([])
  const [scenario, setScenario] = useState<MealPeriod>('breakfast')

  const [gachaPhase, setGachaPhase] = useState<GachaPhase>('idle')
  const [current, setCurrent] = useState<Food | null>(null)
  const lastFoodRef = useRef<Food | undefined>(undefined)
  const timeoutRef = useRef<number | null>(null)

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

  // 组件卸载时清理未触发的 timeout，避免 setState on unmounted 警告
  useEffect(() => {
    return () => {
      if (timeoutRef.current !== null) {
        window.clearTimeout(timeoutRef.current)
      }
    }
  }, [])

  /** 当前场景下的候选池 */
  const candidates = useMemo<readonly Food[]>(
    () => foods.filter((f) => f.mealPeriod === scenario),
    [foods, scenario],
  )

  const handleRoll = () => {
    if (gachaPhase === 'rolling') return
    if (candidates.length === 0) return

    setGachaPhase('rolling')
    if (timeoutRef.current !== null) {
      window.clearTimeout(timeoutRef.current)
    }
    timeoutRef.current = window.setTimeout(() => {
      const picked = pickRandom(candidates, lastFoodRef.current)
      lastFoodRef.current = picked
      setCurrent(picked)
      setGachaPhase('result')
      timeoutRef.current = null
    }, ROLL_DURATION_MS)
  }

  const handleScenarioChange = (next: MealPeriod) => {
    if (next === scenario) return
    // 切换场景时把抽卡结果清掉，避免「早餐的菜显示在晚餐 tab 下」
    setScenario(next)
    setGachaPhase('idle')
    setCurrent(null)
    lastFoodRef.current = undefined
  }

  const renderBody = () => {
    switch (loadPhase) {
      case 'loading':
        return <StateCard message={STATE_MESSAGES['/scenarios'].loading} />
      case 'empty':
        return <StateCard message={STATE_MESSAGES['/scenarios'].empty} actionHref="#/library" />
      case 'error':
        return <StateCard message={STATE_MESSAGES['/scenarios'].error} onAction={load} />
      case 'success':
        return null
    }
  }

  return (
    <div className="page page--scenarios">
      <header className="page__header">
        <h2 className="page__title">场景抽取</h2>
        <p className="page__subtitle">选一个用餐时段，让概率挑一道</p>
      </header>

      {/* 场景切换器始终可见——即使数据还在 loading，用户也能先选好场景 */}
      <div className="scenario-tabs" role="tablist" aria-label="用餐时段">
        {SCENARIOS.map((s) => (
          <button
            key={s.key}
            type="button"
            role="tab"
            aria-selected={s.key === scenario}
            className={`scenario-tab${s.key === scenario ? ' is-active' : ''}`}
            onClick={() => handleScenarioChange(s.key)}
          >
            <span aria-hidden="true">{s.icon}</span>
            <span>{s.label}</span>
          </button>
        ))}
      </div>

      {renderBody()}

      {/* success 时显示抽卡区；loading/empty/error 阶段已被 StateCard 占满 */}
      {loadPhase === 'success' && (
        <section className="scenarios-gacha" aria-label="场景抽卡区">
          <article className="card">
            <span className="card__emoji" aria-hidden="true">
              {gachaPhase === 'result' && current !== null
                ? current.emoji
                : gachaPhase === 'rolling'
                  ? '🎲'
                  : SCENARIOS.find((s) => s.key === scenario)?.icon ?? '🍽️'}
            </span>
            {gachaPhase === 'result' && current !== null ? (
              <>
                <h2 className="card__name">{current.name}</h2>
                <p className="card__desc">{current.description || '（这道菜还没有描述）'}</p>
              </>
            ) : gachaPhase === 'rolling' ? (
              <p className="card__hint">命运正在决定…</p>
            ) : candidates.length === 0 ? (
              <>
                <h2 className="card__name">{MEAL_PERIOD_LABELS[scenario]} 暂无可选项</h2>
                <p className="card__desc">
                  该时段下还没有食物，先去「食物库」补充几道吧。
                </p>
                <a href="#/library" className="btn btn--primary">
                  去食物库
                </a>
              </>
            ) : (
              <>
                <h2 className="card__name">{MEAL_PERIOD_LABELS[scenario]}抽卡</h2>
                <p className="card__desc">
                  候选池里有 {candidates.length} 道菜，按下方按钮开抽。
                </p>
              </>
            )}
          </article>
          <button
            type="button"
            className="btn btn--primary scenarios-gacha__btn"
            onClick={handleRoll}
            disabled={gachaPhase === 'rolling' || candidates.length === 0}
          >
            {gachaPhase === 'result' ? '换一道' : '开始干饭'}
          </button>
        </section>
      )}
    </div>
  )
}