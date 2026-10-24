// 今天的健康数据录入表单（Day 29）
//
// 对应接口 #14（PUT /api/health/logs/:date）。
// 关键设计：**只提交用户真的填了的字段**。
// 后端是字段级 upsert（没提交的保留原值），所以用户可以早上只填体重、
// 晚上再补饮食，两次提交互不覆盖。表单这边绝不能替用户补默认值，
// 否则「没填」会被当成「填了 0」写进库里。

import { useState, type FormEvent } from 'react'
import { ApiError, deleteLog, friendlyErrorMessage, saveLog } from '../services/api'
import {
  LOG_DELETE,
  LOG_DELETE_ARIA,
  LOG_FORM_ARIA,
  LOG_LABEL_MEALS,
  LOG_LABEL_MOOD,
  LOG_LABEL_NOTE,
  LOG_LABEL_SLEEP,
  LOG_LABEL_WATER,
  LOG_LABEL_WEIGHT,
  LOG_MEALS_HINT,
  LOG_MOOD_ARIA,
  LOG_PH_NOTE,
  LOG_PH_SLEEP,
  LOG_PH_WATER,
  LOG_PH_WEIGHT,
  LOG_SAVING,
  LOG_STORED_HINT,
  LOG_SUBMIT,
} from '../lib/constants'
import { todayKey } from '../lib/date'
import type { DailyLog, DailyLogInput } from '../types/health'

interface DailyLogFormProps {
  /** 今天已有的记录（用来回填表单）；没有则传 null */
  today: DailyLog | null
  /** 保存成功后回调，把新记录交给页面 */
  onSaved: (log: DailyLog) => void
  /** 删除成功后回调 */
  onDeleted: () => void
  /** 失败时的中文提示由页面统一显示 */
  onError: (message: string) => void
}

const MOOD_OPTIONS = [1, 2, 3, 4, 5]

export function DailyLogForm({ today, onSaved, onDeleted, onError }: DailyLogFormProps) {
  // 初始值直接用今天的记录回填——用户点开就能看到早上记过什么
  const [weightKg, setWeightKg] = useState(() =>
    today && today.weightKg !== null ? String(today.weightKg) : '',
  )
  const [sleepHours, setSleepHours] = useState(() =>
    today && today.sleepHours !== null ? String(today.sleepHours) : '',
  )
  const [waterMl, setWaterMl] = useState(() =>
    today && today.waterMl !== null ? String(today.waterMl) : '',
  )
  const [mood, setMood] = useState<number | null>(() => today?.mood ?? null)
  const [meals, setMeals] = useState(() => (today && today.meals ? today.meals.join('，') : ''))
  const [note, setNote] = useState(() => today?.note ?? '')
  const [busy, setBusy] = useState(false)

  const buildPatch = (): DailyLogInput => {
    const patch: DailyLogInput = {}
    if (weightKg.trim() !== '') patch.weightKg = Number(weightKg)
    if (sleepHours.trim() !== '') patch.sleepHours = Number(sleepHours)
    if (waterMl.trim() !== '') patch.waterMl = Number.parseInt(waterMl, 10)
    if (mood !== null) patch.mood = mood
    if (meals.trim() !== '') {
      patch.meals = meals
        .split(/[,，]/)
        .map((m) => m.trim())
        .filter((m) => m.length > 0)
    }
    if (note.trim() !== '') patch.note = note.trim()
    return patch
  }

  const handleSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    const patch = buildPatch()
    if (Object.keys(patch).length === 0) {
      onError('至少填一项再记下来')
      return
    }
    setBusy(true)
    try {
      const saved = await saveLog(todayKey(), patch)
      onSaved(saved)
    } catch (err) {
      onError(friendlyErrorMessage(err))
    } finally {
      setBusy(false)
    }
  }

  const handleDelete = async () => {
    setBusy(true)
    try {
      await deleteLog(todayKey())
      // 删完把表单清空，用户看到的是空白表单而不是旧数据
      setWeightKg('')
      setSleepHours('')
      setWaterMl('')
      setMood(null)
      setMeals('')
      setNote('')
      onDeleted()
    } catch (err) {
      // 「今天本来就没记过」会返回 404。对用户来说那就是「已经是空的」，不值得报错——
      // 这里按 HTTP 状态码判断，不能拿文案里有没有「404」四个字符来猜：
      // friendlyErrorMessage() 返回的是中文人话，里面根本没有状态码。
      if (err instanceof ApiError && err.status === 404) {
        onError('')
      } else {
        onError(friendlyErrorMessage(err))
      }
    } finally {
      setBusy(false)
    }
  }

  return (
    <form className="log-form" onSubmit={handleSubmit} aria-label={LOG_FORM_ARIA}>
      {today !== null && <p className="log-form__hint">{LOG_STORED_HINT}</p>}

      <div className="form-row form-row--split">
        <div>
          <label className="form-label" htmlFor="log-weight">
            {LOG_LABEL_WEIGHT}
          </label>
          <input
            id="log-weight"
            className="form-input"
            type="number"
            inputMode="decimal"
            step="0.1"
            min={10}
            max={300}
            value={weightKg}
            onChange={(e) => setWeightKg(e.target.value)}
            placeholder={LOG_PH_WEIGHT}
          />
        </div>
        <div>
          <label className="form-label" htmlFor="log-sleep">
            {LOG_LABEL_SLEEP}
          </label>
          <input
            id="log-sleep"
            className="form-input"
            type="number"
            inputMode="decimal"
            step="0.5"
            min={0}
            max={24}
            value={sleepHours}
            onChange={(e) => setSleepHours(e.target.value)}
            placeholder={LOG_PH_SLEEP}
          />
        </div>
        <div>
          <label className="form-label" htmlFor="log-water">
            {LOG_LABEL_WATER}
          </label>
          <input
            id="log-water"
            className="form-input"
            type="number"
            inputMode="numeric"
            step="100"
            min={0}
            max={10000}
            value={waterMl}
            onChange={(e) => setWaterMl(e.target.value)}
            placeholder={LOG_PH_WATER}
          />
        </div>
      </div>

      <div className="log-form__mood">
        <span className="form-label">{LOG_LABEL_MOOD}</span>
        <div className="mood-row" role="group" aria-label={LOG_MOOD_ARIA}>
          {MOOD_OPTIONS.map((value) => (
            <button
              key={value}
              type="button"
              className={`mood-btn${mood === value ? ' mood-btn--on' : ''}`}
              aria-pressed={mood === value}
              onClick={() => setMood(mood === value ? null : value)}
            >
              {value}
            </button>
          ))}
        </div>
      </div>

      <div>
        <label className="form-label" htmlFor="log-meals">
          {LOG_LABEL_MEALS}
        </label>
        <input
          id="log-meals"
          className="form-input"
          type="text"
          value={meals}
          onChange={(e) => setMeals(e.target.value)}
          placeholder={LOG_MEALS_HINT}
        />
      </div>

      <div>
        <label className="form-label" htmlFor="log-note">
          {LOG_LABEL_NOTE}
        </label>
        <input
          id="log-note"
          className="form-input"
          type="text"
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder={LOG_PH_NOTE}
        />
      </div>

      <div className="log-form__actions">
        <button type="submit" className="btn btn--primary" disabled={busy}>
          {busy ? LOG_SAVING : LOG_SUBMIT}
        </button>
        {today !== null && (
          <button
            type="button"
            className="btn btn--secondary"
            onClick={handleDelete}
            disabled={busy}
            aria-label={LOG_DELETE_ARIA}
          >
            {LOG_DELETE}
          </button>
        )}
      </div>
    </form>
  )
}
