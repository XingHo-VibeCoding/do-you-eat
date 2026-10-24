// 我的资料（健康档案）折叠区 —— Day 29
//
// 位置：AI 助手页底部，默认收起。
// 为什么收起而不是摆在页面上方：档案是「长期不变的常量」（身高/年龄），
// 用户填一次就很久不用动；真正天天要动的是中间的四个气泡。
// 摆在页面上会把常用功能挤下去，收进折叠区既不丢功能也不占地方。
//
// 它同时是 AI 的输入：没有身高体重，AI 就算不出 BMI，
// 所以卡片里明确写了「填一下我才能按你的情况给建议」。
//
// 存档位置：Day 29 起上云（接口 #10-#12），原来的 localStorage 版
// src/services/healthStorage.ts 已删除。换设备资料也在。

import { useState, type FormEvent } from 'react'
import { clearHealthProfile, friendlyErrorMessage, saveHealthProfile } from '../services/api'
import {
  PROFILE_CLEAR,
  PROFILE_CLEAR_ARIA,
  PROFILE_EMPTY,
  PROFILE_FORM_ARIA,
  PROFILE_LABEL_AGE,
  PROFILE_LABEL_HEIGHT,
  PROFILE_LABEL_WEIGHT,
  PROFILE_PH_AGE,
  PROFILE_PH_HEIGHT,
  PROFILE_PH_WEIGHT,
  PROFILE_SAVED_AT,
  PROFILE_SECTION_ARIA,
  PROFILE_SUBMIT,
  PROFILE_TOGGLE,
  PROFILE_TOGGLE_OPEN,
} from '../lib/constants'
import type { HealthProfile } from '../types/health'

interface ProfileCardProps {
  profile: HealthProfile | null
  onSaved: (profile: HealthProfile) => void
  onCleared: () => void
  onError: (message: string) => void
}

/** 与后端 #11 的 CHECK 约束一致：身高 50~250 / 体重 10~300 / 年龄 1~150 */
function validate(input: { heightCm: string; weightKg: string; age: string }): string | null {
  const h = Number(input.heightCm)
  const w = Number(input.weightKg)
  const a = Number.parseInt(input.age, 10)
  if (!Number.isFinite(h) || h < 50 || h > 250) return '身高请填 50~250 之间的数字（cm）'
  if (!Number.isFinite(w) || w < 10 || w > 300) return '体重请填 10~300 之间的数字（kg）'
  if (!Number.isFinite(a) || a < 1 || a > 150) return '年龄请填 1~150 之间的数字'
  return null
}

function formatDateTime(value: string): string {
  const d = new Date(value)
  if (Number.isNaN(d.getTime())) return value
  const pad = (n: number) => n.toString().padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(
    d.getHours(),
  )}:${pad(d.getMinutes())}`
}

export function ProfileCard({ profile, onSaved, onCleared, onError }: ProfileCardProps) {
  const [open, setOpen] = useState(false)
  const [heightCm, setHeightCm] = useState(() => (profile ? String(profile.heightCm) : ''))
  const [weightKg, setWeightKg] = useState(() => (profile ? String(profile.weightKg) : ''))
  const [age, setAge] = useState(() => (profile ? String(profile.age) : ''))
  const [busy, setBusy] = useState(false)

  const handleSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    const reason = validate({ heightCm, weightKg, age })
    if (reason !== null) {
      onError(reason)
      return
    }
    setBusy(true)
    try {
      const saved = await saveHealthProfile({
        heightCm: Number(heightCm),
        weightKg: Number(weightKg),
        age: Number.parseInt(age, 10),
      })
      onSaved(saved)
    } catch (err) {
      onError(friendlyErrorMessage(err))
    } finally {
      setBusy(false)
    }
  }

  const handleClear = async () => {
    setBusy(true)
    try {
      await clearHealthProfile()
      setHeightCm('')
      setWeightKg('')
      setAge('')
      onCleared()
    } catch (err) {
      onError(friendlyErrorMessage(err))
    } finally {
      setBusy(false)
    }
  }

  return (
    <section className="card profile-card" aria-label={PROFILE_SECTION_ARIA}>
      <button
        type="button"
        className="profile-card__toggle"
        aria-expanded={open}
        onClick={() => setOpen(!open)}
      >
        <span>{open ? PROFILE_TOGGLE_OPEN : PROFILE_TOGGLE}</span>
        <span className="profile-card__arrow" aria-hidden="true">
          {open ? '▲' : '▼'}
        </span>
      </button>

      {open && (
        <div className="profile-card__body">
          {profile === null && <p className="profile-card__empty">{PROFILE_EMPTY}</p>}

          <form className="health-form" onSubmit={handleSubmit} aria-label={PROFILE_FORM_ARIA}>
            <div className="form-row form-row--split">
              <div>
                <label className="form-label" htmlFor="pc-height">
                  {PROFILE_LABEL_HEIGHT}
                </label>
                <input
                  id="pc-height"
                  className="form-input"
                  type="number"
                  inputMode="numeric"
                  min={50}
                  max={250}
                  value={heightCm}
                  onChange={(e) => setHeightCm(e.target.value)}
                  placeholder={PROFILE_PH_HEIGHT}
                />
              </div>
              <div>
                <label className="form-label" htmlFor="pc-weight">
                  {PROFILE_LABEL_WEIGHT}
                </label>
                <input
                  id="pc-weight"
                  className="form-input"
                  type="number"
                  inputMode="decimal"
                  min={10}
                  max={300}
                  step="0.1"
                  value={weightKg}
                  onChange={(e) => setWeightKg(e.target.value)}
                  placeholder={PROFILE_PH_WEIGHT}
                />
              </div>
              <div>
                <label className="form-label" htmlFor="pc-age">
                  {PROFILE_LABEL_AGE}
                </label>
                <input
                  id="pc-age"
                  className="form-input"
                  type="number"
                  inputMode="numeric"
                  min={1}
                  max={150}
                  value={age}
                  onChange={(e) => setAge(e.target.value)}
                  placeholder={PROFILE_PH_AGE}
                />
              </div>
            </div>

            <div className="health-form__actions">
              <button type="submit" className="btn btn--primary" disabled={busy}>
                {PROFILE_SUBMIT}
              </button>
              {profile !== null && (
                <button
                  type="button"
                  className="btn btn--secondary"
                  onClick={handleClear}
                  disabled={busy}
                  aria-label={PROFILE_CLEAR_ARIA}
                >
                  {PROFILE_CLEAR}
                </button>
              )}
            </div>
          </form>

          {profile !== null && (
            <p className="profile-card__time">
              {PROFILE_SAVED_AT} {formatDateTime(profile.updatedAt)}
            </p>
          )}
        </div>
      )}
    </section>
  )
}
