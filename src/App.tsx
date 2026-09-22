// 应用主组件 —— 三态抽卡状态机（Day 7 第 4 步）
//   idle    → 显示引导 + 「开始干饭」按钮
//   rolling → 显示占位 emoji + 抖动动画 + 禁用按钮
//   result  → 展示结果卡片 + 「不行，重来」按钮 + 评分
import { useEffect, useRef, useState } from 'react'
import { GachaButton } from './components/GachaButton'
import { IntroHint } from './components/IntroHint'
import { ResultCard } from './components/ResultCard'
import { FOODS } from './data/foods'
import { pickRandom, ROLL_DURATION_MS } from './lib/gacha'
import { APP_NAME, APP_TAGLINE } from './lib/constants'
import type { Food, GachaPhase } from './types/food'

function App() {
  const [phase, setPhase] = useState<GachaPhase>('idle')
  const [current, setCurrent] = useState<Food | null>(null)
  const lastFoodRef = useRef<Food | undefined>(undefined)
  const timeoutRef = useRef<number | null>(null)

  // 组件卸载时清理未触发的 timeout，避免 setState on unmounted 警告
  useEffect(() => {
    return () => {
      if (timeoutRef.current !== null) {
        window.clearTimeout(timeoutRef.current)
      }
    }
  }, [])

  const handleRoll = () => {
    if (phase === 'rolling') return // 按钮禁用已经挡了一层，这里再加保险

    setPhase('rolling')
    if (timeoutRef.current !== null) {
      window.clearTimeout(timeoutRef.current)
    }
    timeoutRef.current = window.setTimeout(() => {
      const picked = pickRandom(FOODS, lastFoodRef.current)
      lastFoodRef.current = picked
      setCurrent(picked)
      setPhase('result')
      timeoutRef.current = null
    }, ROLL_DURATION_MS)
  }

  return (
    <div className={`app${phase === 'rolling' ? ' is-rolling' : ''}`}>
      <header className="app__header">
        <h1 className="app__title">{APP_NAME}</h1>
        <p className="app__tagline">{APP_TAGLINE}</p>
      </header>

      {phase === 'result' && current !== null ? (
        <ResultCard food={current} />
      ) : (
        <article className="card" aria-live="polite">
          <span className="card__emoji" aria-hidden="true">
            {phase === 'rolling' ? '🎲' : '🍱'}
          </span>
          {phase === 'idle' ? <IntroHint /> : <p className="card__hint">命运正在决定…</p>}
        </article>
      )}

      <GachaButton phase={phase} onClick={handleRoll} />

      <footer className="copy-line" aria-hidden="true">
        —— 决定不下，就让概率来 ——{' '}
      </footer>
    </div>
  )
}

export default App