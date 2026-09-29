// 健康档案页面（Day 13 第 3 步）
//
// 功能：表单录入身高 / 体重 / 年龄，提交后存到 localStorage。
// 数据只保存在浏览器里，不上云（项目专属规则第 1 条精神：
// 所有 localStorage 读写都走 service，不在组件里直接 getItem/setItem）。
//
// 健康档案不属于「列表」概念，没有四态（Day 13 PLAN §三）。
// 这里只有两种业务情况：
//   - 未保存：表单空着，提示填一下
//   - 已保存：表单回填已保存值，下方显示「已保存于 xx」+ 提供「清空」按钮

import { useState, type FormEvent } from 'react'
import { clearHealth, getHealth, saveHealth, type HealthProfile } from '../services/healthStorage'

interface ValidationResult {
  ok: boolean
  reason?: string
}

function validate(input: {
  heightCm: string
  weightKg: string
  age: string
}): ValidationResult & { heightCm: number; weightKg: number; age: number } {
  const h = Number(input.heightCm)
  const w = Number(input.weightKg)
  const a = Number.parseInt(input.age, 10)
  if (!Number.isFinite(h) || h < 50 || h > 250) {
    return { ok: false, reason: '身高请填 50~250 之间的数字（cm）', heightCm: 0, weightKg: 0, age: 0 }
  }
  if (!Number.isFinite(w) || w < 10 || w > 300) {
    return { ok: false, reason: '体重请填 10~300 之间的数字（kg）', heightCm: 0, weightKg: 0, age: 0 }
  }
  if (!Number.isFinite(a) || a < 1 || a > 150) {
    return { ok: false, reason: '年龄请填 1~150 之间的数字', heightCm: 0, weightKg: 0, age: 0 }
  }
  return { ok: true, heightCm: h, weightKg: w, age: a }
}

function formatSavedTime(iso: string): string {
  // 把 ISO 8601 格式化成更友好的中文展示，例如 2026-09-29 16:42
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return iso
  const pad = (n: number) => n.toString().padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`
}

export function HealthPage() {
  // 首次渲染时从 localStorage 读一次，作为表单初始值
  const [saved, setSaved] = useState<HealthProfile | null>(() => getHealth())
  const [heightCm, setHeightCm] = useState<string>(() => saved?.heightCm?.toString() ?? '')
  const [weightKg, setWeightKg] = useState<string>(() => saved?.weightKg?.toString() ?? '')
  const [age, setAge] = useState<string>(() => saved?.age?.toString() ?? '')
  const [formError, setFormError] = useState<string | null>(null)

  const handleSubmit = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    const result = validate({ heightCm, weightKg, age })
    if (!result.ok) {
      setFormError(result.reason ?? '输入不合法')
      return
    }
    const next = saveHealth({ heightCm: result.heightCm, weightKg: result.weightKg, age: result.age })
    setSaved(next)
    setFormError(null)
  }

  const handleClear = () => {
    clearHealth()
    setSaved(null)
    setHeightCm('')
    setWeightKg('')
    setAge('')
    setFormError(null)
  }

  return (
    <div className="page page--health">
      <header className="page__header">
        <h2 className="page__title">健康档案</h2>
        <p className="page__subtitle">数据只保存在你的浏览器里，不上云</p>
      </header>

      <article className="card">
        <form className="health-form" onSubmit={handleSubmit} aria-label="健康档案表单">
          <div className="form-row form-row--split">
            <div>
              <label className="form-label" htmlFor="hp-height">
                身高（cm）
              </label>
              <input
                id="hp-height"
                className="form-input"
                type="number"
                inputMode="numeric"
                min={50}
                max={250}
                value={heightCm}
                onChange={(e) => setHeightCm(e.target.value)}
                placeholder="例如 170"
              />
            </div>
            <div>
              <label className="form-label" htmlFor="hp-weight">
                体重（kg）
              </label>
              <input
                id="hp-weight"
                className="form-input"
                type="number"
                inputMode="decimal"
                min={10}
                max={300}
                step="0.1"
                value={weightKg}
                onChange={(e) => setWeightKg(e.target.value)}
                placeholder="例如 60"
              />
            </div>
            <div>
              <label className="form-label" htmlFor="hp-age">
                年龄
              </label>
              <input
                id="hp-age"
                className="form-input"
                type="number"
                inputMode="numeric"
                min={1}
                max={150}
                value={age}
                onChange={(e) => setAge(e.target.value)}
                placeholder="例如 25"
              />
            </div>
          </div>

          {formError !== null && (
            <p className="form-error" role="alert">
              {formError}
            </p>
          )}

          <div className="health-form__actions">
            <button type="submit" className="btn btn--primary">
              保存
            </button>
            {saved !== null && (
              <button
                type="button"
                className="btn btn--ghost"
                onClick={handleClear}
                aria-label="清空已保存的健康档案"
              >
                清空
              </button>
            )}
          </div>
        </form>
      </article>

      {saved !== null ? (
        <article className="card health-saved-card" aria-live="polite">
          <span className="card__emoji" aria-hidden="true">
            ✅
          </span>
          <h3 className="card__name">已保存</h3>
          <p className="health-saved-card__line">
            身高 <strong>{saved.heightCm}</strong> cm · 体重 <strong>{saved.weightKg}</strong> kg · 年龄{' '}
            <strong>{saved.age}</strong>
          </p>
          <p className="health-saved-card__time">保存于 {formatSavedTime(saved.updatedAt)}</p>
          {saved.weightKg > 0 && saved.heightCm > 0 && (
            <p className="health-saved-card__bmi">
              BMI ≈{' '}
              <strong>
                {(saved.weightKg / Math.pow(saved.heightCm / 100, 2)).toFixed(1)}
              </strong>
            </p>
          )}
        </article>
      ) : (
        <article className="card card--state" aria-live="polite">
          <span className="card__emoji" aria-hidden="true">
            📝
          </span>
          <h3 className="card__name">还没有保存过档案</h3>
          <p className="card__desc">填一下身高体重，方便以后做更贴近你的推荐</p>
        </article>
      )}
    </div>
  )
}