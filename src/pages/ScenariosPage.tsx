// 场景抽取页面（Day 13 第 3 步；Day 13 菜系板块扩展）
//
// 功能：按「用餐时段」或「中国八大菜系」两种维度，从候选池里抽一道菜。
//
// 四态来源：
//   loading  → fetchFoods 在路上
//   success  → 列表非空（无论筛后是否非空，列表本身有）
//   empty    → 列表为空（用户把食物都删了）或筛后为空（该时段 / 该菜系没食物）
//   error    → fetchFoods reject（演示用 ?mode=error）
//
// 文案策略：
//   - loading / error 用 STATE_MESSAGES 集中管理（跨 mode 文案一致）
//   - empty 文案按 mode 区分（时段 / 菜系）→ 内联在本文件

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { StateCard } from '../components/StateCard'
import { DataUpdatedStamp } from '../components/DataUpdatedStamp'
import { fetchFoods } from '../services/api'
import { pickRandom, ROLL_DURATION_MS } from '../lib/gacha'
import { MEAL_PERIOD_LABELS } from '../lib/constants'
import { STATE_MESSAGES } from '../lib/stateMessages'
import type { Cuisine, Food, GachaPhase, LoadPhase, MealPeriod } from '../types/food'

// ===== 时段场景配置 =====

interface MealScenarioOption {
  key: MealPeriod
  label: string
  icon: string
}

const MEAL_SCENARIOS: readonly MealScenarioOption[] = [
  { key: 'breakfast', label: MEAL_PERIOD_LABELS.breakfast, icon: '🌅' },
  { key: 'lunch', label: MEAL_PERIOD_LABELS.lunch, icon: '☀️' },
  { key: 'dinner', label: MEAL_PERIOD_LABELS.dinner, icon: '🌙' },
  { key: 'snack', label: MEAL_PERIOD_LABELS.snack, icon: '🌃' },
]

// ===== 菜系场景配置 =====
// 中国八大菜系：川 / 粤 / 鲁 / 苏 / 浙 / 闽 / 湘 / 徽

interface CuisineOption {
  key: Cuisine
  label: string
  /** 单字菜系用一个有辨识度的 emoji 作视觉锚点（不打算用菜系徽标，太正式了） */
  icon: string
}

const CUISINE_SCENARIOS: readonly CuisineOption[] = [
  { key: '川', label: '川菜', icon: '🌶️' },
  { key: '粤', label: '粤菜', icon: '🥢' },
  { key: '鲁', label: '鲁菜', icon: '🐟' },
  { key: '苏', label: '苏菜', icon: '🦀' },
  { key: '浙', label: '浙菜', icon: '🍵' },
  { key: '闽', label: '闽菜', icon: '🍤' },
  { key: '湘', label: '湘菜', icon: '🌶' },
  { key: '徽', label: '徽菜', icon: '🍂' },
]

// ===== 模式切换 =====

type ScenarioMode = 'mealPeriod' | 'cuisine'

interface ModeOption {
  key: ScenarioMode
  label: string
}

const MODE_OPTIONS: readonly ModeOption[] = [
  { key: 'mealPeriod', label: '按时段' },
  { key: 'cuisine', label: '按菜系' },
]

export function ScenariosPage() {
  const [loadPhase, setLoadPhase] = useState<LoadPhase>('loading')
  const [foods, setFoods] = useState<readonly Food[]>([])
  // 最近一次拉取成功的时刻（Day 20 余力加练：供 DataUpdatedStamp 显示）
  const [updatedAt, setUpdatedAt] = useState<Date | null>(null)
  const [mode, setMode] = useState<ScenarioMode>('mealPeriod')
  const [scenario, setScenario] = useState<MealPeriod | Cuisine>('breakfast')

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

  // 组件卸载时清理未触发的 timeout，避免 setState on unmounted 警告
  useEffect(() => {
    return () => {
      if (timeoutRef.current !== null) {
        window.clearTimeout(timeoutRef.current)
      }
    }
  }, [])

  /** 切换 mode 时把默认选中值重置成该 mode 的第一项；并清掉抽卡结果 */
  useEffect(() => {
    if (mode === 'mealPeriod' && !isMealPeriod(scenario)) {
      setScenario('breakfast')
    } else if (mode === 'cuisine' && !isCuisine(scenario)) {
      setScenario('川')
    }
    setGachaPhase('idle')
    setCurrent(null)
    lastFoodRef.current = undefined
  }, [mode, scenario])

  /** 当前 mode × 当前 scenario 下的候选池 */
  const candidates = useMemo<readonly Food[]>(() => {
    if (mode === 'mealPeriod') {
      return foods.filter((f) => f.mealPeriod === scenario)
    }
    return foods.filter((f) => f.cuisine === scenario)
  }, [foods, mode, scenario])

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

  const handleScenarioChange = (next: MealPeriod | Cuisine) => {
    if (next === scenario) return
    // 切换场景时把抽卡结果清掉，避免「早餐的菜显示在晚餐 tab 下」
    setScenario(next)
    setGachaPhase('idle')
    setCurrent(null)
    lastFoodRef.current = undefined
  }

  const handleModeChange = (next: ScenarioMode) => {
    if (next === mode) return
    setMode(next)
    // useEffect 会负责把 scenario 重置 + 清抽卡
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

  /** 当前场景在 tab 列表里的元数据（label / icon） */
  const currentOption = (() => {
    if (mode === 'mealPeriod') {
      return MEAL_SCENARIOS.find((s) => s.key === scenario)
    }
    return CUISINE_SCENARIOS.find((s) => s.key === scenario)
  })()

  /** 候选池为空时的内联文案（按 mode 区分） */
  const emptyHint = (() => {
    if (mode === 'mealPeriod') {
      return `${MEAL_PERIOD_LABELS[scenario as MealPeriod]} 暂无食物`
    }
    const label = currentOption?.label ?? '该菜系'
    return `${label}暂无数据，先去「食物库」补充几道吧`
  })()

  return (
    <div className="page page--scenarios">
      <header className="page__header">
        <h2 className="page__title">场景抽取</h2>
        <p className="page__subtitle">选个时段或菜系，让概率挑一道</p>
        <DataUpdatedStamp updatedAt={updatedAt} onRefresh={load} />
      </header>

      {/* mode 切换器始终可见——让用户先选好维度 */}
      <div className="scenario-mode-switch" role="tablist" aria-label="抽取维度">
        {MODE_OPTIONS.map((m) => (
          <button
            key={m.key}
            type="button"
            role="tab"
            aria-selected={m.key === mode}
            className={`scenario-mode-switch__btn${m.key === mode ? ' is-active' : ''}`}
            onClick={() => handleModeChange(m.key)}
          >
            {m.label}
          </button>
        ))}
      </div>

      {/* 场景切换器始终可见——即使数据还在 loading，用户也能先选好场景 */}
      <div
        className="scenario-tabs"
        role="tablist"
        aria-label={mode === 'mealPeriod' ? '用餐时段' : '八大菜系'}
      >
        {(mode === 'mealPeriod' ? MEAL_SCENARIOS : CUISINE_SCENARIOS).map((s) => (
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
                  : currentOption?.icon ?? '🍽️'}
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
                <h2 className="card__name">{emptyHint}</h2>
                <p className="card__desc">
                  {mode === 'mealPeriod'
                    ? '该时段下还没有食物，先去「食物库」补充几道吧。'
                    : '目前食物库里没有归属这个菜系的菜，去补充几道吧。'}
                </p>
                <a href="#/library" className="btn btn--primary">
                  去食物库
                </a>
              </>
            ) : (
              <>
                <h2 className="card__name">
                  {currentOption?.label ?? ''}抽卡
                </h2>
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

// ===== 类型守卫（用来在 useEffect 中区分 mode 切换后的默认值） =====

const MEAL_KEYS: readonly MealPeriod[] = ['breakfast', 'lunch', 'dinner', 'snack']
const CUISINE_KEYS: readonly Cuisine[] = ['川', '粤', '鲁', '苏', '浙', '闽', '湘', '徽']

function isMealPeriod(v: MealPeriod | Cuisine): v is MealPeriod {
  return (MEAL_KEYS as readonly string[]).includes(v)
}

function isCuisine(v: MealPeriod | Cuisine): v is Cuisine {
  return (CUISINE_KEYS as readonly string[]).includes(v)
}
