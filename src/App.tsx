// 应用主组件（Day 7 第 4 步初版；Day 8 接入数据四态 + 候选列表）
//
// 现在页面里有两条状态线，别混：
//   loadPhase  = 数据状态（loading / success / empty / error），管「食堂数据拿没拿到」
//   gachaPhase = 交互状态（idle / rolling / result），管「这一次抽卡进行到哪一步」
// 只有 loadPhase === 'success' 时才有抽卡区和候选列表 —— 没数据就抽不了卡。
import { useCallback, useEffect, useRef, useState } from 'react'
import { GachaButton } from './components/GachaButton'
import { IntroHint } from './components/IntroHint'
import { ResultCard } from './components/ResultCard'
import { FoodList } from './components/FoodList'
import { fetchFoods } from './services/mockApi'
import { pickRandom, ROLL_DURATION_MS } from './lib/gacha'
import {
  APP_NAME,
  APP_TAGLINE,
  BUTTON_RETRY,
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

    setGachaPhase('rolling')
    if (timeoutRef.current !== null) {
      window.clearTimeout(timeoutRef.current)
    }
    timeoutRef.current = window.setTimeout(() => {
      // 注意：候选池从「拉回来的 foods」里取，不再直接 import FOODS
      const picked = pickRandom(foods, lastFoodRef.current)
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
            <ResultCard food={current} />
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

          <GachaButton phase={gachaPhase} onClick={handleRoll} />
        </section>

        <section className="food-list-wrap" aria-label={LIST_TITLE}>
          <h2 className="food-list-wrap__title">{LIST_TITLE}</h2>
          <FoodList foods={foods} />
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
