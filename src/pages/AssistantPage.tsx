// AI 健康助手页面（Day 29）
//
// 它替代了原来的健康档案页（#/health）。路由没变——已发布的地址不失效，
// 只是里面的东西整个换掉了，档案表单收进页面底部的「我的资料」折叠区。
//
// 页面骨架（照用户要的形态）：
//   中心：会变化的表情（AssistantFace）
//   四周：四个漂浮气泡，点一下就展开下面对应的卡片
//   下方：输入框，直接问 AI
//   卡片区：在气泡和输入框之间原地展开，不跳页
//
// 三条独立的数据线，任何一条挂掉都不该拖垮整页：
//   ① 档案  GET /api/health/profile   → 挂在底部折叠区
//   ② 记录  GET /api/health/logs      → 挂在下方的图表
//   ③ 助手  POST /api/assistant/chat  → 挂在下方的 AI 回答文字
// 三条各自 try/catch，失败只 disable 对应那块，别的照常能用。
//
// 气泡点击后不跳页是有意的：这是个「随手记一下」的页面，
// 跳走再回来的成本比原地展开高得多。

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { AssistantFace, type FaceState } from '../components/AssistantFace'
import { DailyLogForm } from '../components/DailyLogForm'
import { ProfileCard } from '../components/ProfileCard'
import { WeightChart } from '../components/WeightChart'
import {
  ASSISTANT_IDLE_DESC,
  ASSISTANT_IDLE_TITLE,
  ASSISTANT_ASK_ARIA,
  ASSISTANT_INPUT_PLACEHOLDER,
  ASSISTANT_PAGE_SUBTITLE,
  ASSISTANT_PAGE_TITLE,
  ASSISTANT_QUESTION_ARIA,
  ASSISTANT_SEND,
  ASSISTANT_STAGE_ARIA,
  ASSISTANT_THINKING,
  BUBBLE_CHART,
  BUBBLE_CHAT,
  BUBBLE_EAT,
  BUBBLE_LOG,
  CARD_TITLE_CHART,
  CARD_TITLE_CHAT,
  CARD_TITLE_EAT,
  CARD_TITLE_LOG,
  REPLY_FROM_AI,
} from '../lib/constants'
import { pickRandom } from '../lib/gacha'
import { todayKey } from '../lib/date'
import {
  askAssistant,
  fetchFoods,
  fetchLogs,
  friendlyErrorMessage,
  getHealthProfile,
} from '../services/api'
import type { Food } from '../types/food'
import type { DailyLog, HealthProfile } from '../types/health'

/** 卡片类型：idle = 什么都没点开的空态 */
type CardKind = 'idle' | 'log' | 'eat' | 'chart' | 'chat'

/** 问「吃什么」时从食物库里随机取的候选数量 */
const CANDIDATE_COUNT = 8

interface Bubble {
  key: Exclude<CardKind, 'idle'>
  text: string
  /** 气泡的漂浮方向，错开看起来才像在飘 */
  drift: 'a' | 'b'
}

const BUBBLES: Bubble[] = [
  { key: 'log', text: BUBBLE_LOG, drift: 'a' },
  { key: 'eat', text: BUBBLE_EAT, drift: 'b' },
  { key: 'chart', text: BUBBLE_CHART, drift: 'b' },
  { key: 'chat', text: BUBBLE_CHAT, drift: 'a' },
]

/** 卡片标题 */
const CARD_TITLES: Record<Exclude<CardKind, 'idle'>, string> = {
  log: CARD_TITLE_LOG,
  eat: CARD_TITLE_EAT,
  chart: CARD_TITLE_CHART,
  chat: CARD_TITLE_CHAT,
}

export function AssistantPage() {
  const [logs, setLogs] = useState<DailyLog[]>([])
  const [profile, setProfile] = useState<HealthProfile | null>(null)
  const [card, setCard] = useState<CardKind>('idle')
  const [reply, setReply] = useState('')
  const [face, setFace] = useState<FaceState>('idle')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [dataNote, setDataNote] = useState('')
  const [question, setQuestion] = useState('')
  const [foods, setFoods] = useState<Food[] | null>(null)
  const [picked, setPicked] = useState<string[]>([])

  const inputRef = useRef<HTMLInputElement>(null)

  // 今天已有的记录（用来回填表单、判断有没有记过）
  const today = useMemo(() => {
    const key = todayKey()
    return logs.find((log) => log.date === key) ?? null
  }, [logs])

  // ---------- 进入页面时并行拉两条数据，各自独立失败 ----------
  useEffect(() => {
    let cancelled = false
    const notes: string[] = []

    // 记录：拉不到只影响图表，气泡和输入框照常能用
    const logsTask = fetchLogs(30)
      .then((rows) => {
        if (!cancelled) setLogs(rows)
      })
      .catch((err) => {
        if (!cancelled) notes.push('记录没拉回来：' + friendlyErrorMessage(err))
      })

    // 档案：拉不到只是 AI 算不出 BMI，不影响其他
    const profileTask = getHealthProfile()
      .then((p) => {
        if (!cancelled) setProfile(p)
      })
      .catch((err) => {
        if (!cancelled) notes.push('资料没拉回来：' + friendlyErrorMessage(err))
      })

    // 两个任务复用同一批请求（不再各调一次），都跑完再汇总成一行提示
    Promise.all([logsTask, profileTask]).then(() => {
      if (!cancelled && notes.length > 0) setDataNote(notes.join('；'))
    })

    return () => {
      cancelled = true
    }
  }, [])

  // ---------- 通用：向 AI 提一个意图 ----------
  const ask = useCallback(
    async (
      intent: 'trend' | 'recommend' | 'log' | 'free',
      payload: { message?: string; candidates?: string[] } = {},
    ) => {
      setBusy(true)
      setFace('thinking')
      setError('')
      try {
        const result = await askAssistant({
          intent,
          message: payload.message,
          candidates: payload.candidates,
          logs: intent === 'trend' ? logs : intent === 'log' && today !== null ? [today] : undefined,
          profile: profile
            ? { heightCm: profile.heightCm, weightKg: profile.weightKg, age: profile.age }
            : null,
        })
        setReply(result.reply)
        setFace(intent === 'recommend' ? 'hungry' : 'idle')
      } catch (err) {
        // 助手挂掉不该让卡片也消失——图表、表单都是纯前端算的，照常显示
        setError(friendlyErrorMessage(err))
        setFace('idle')
      } finally {
        setBusy(false)
      }
    },
    [logs, profile, today],
  )

  // ---------- 气泡 1：记录今天的健康数据 ----------
  const openLog = useCallback(() => {
    setCard('log')
    setReply('')
    setError('')
    setFace('idle')
  }, [])

  // ---------- 气泡 2：今天想吃什么 ----------
  const openEat = useCallback(async () => {
    setCard('eat')
    setReply('')
    setError('')

    // 候选菜从食物库取；取不到就退化成让后端自己说（传空数组，规则引擎会给兜底话术）
    let list = foods
    if (list === null) {
      try {
        list = await fetchFoods()
        setFoods(list)
      } catch {
        list = null
      }
    }
    const candidates =
      list === null ? [] : pickCandidates(list, CANDIDATE_COUNT)
    setPicked(candidates)
    await ask('recommend', { candidates })
  }, [ask, foods])

  // ---------- 气泡 3：体重变化 ----------
  const openChart = useCallback(async () => {
    setCard('chart')
    setReply('')
    setError('')
    await ask('trend')
  }, [ask])

  // ---------- 气泡 4 / 输入框：聊两句 ----------
  const openChat = useCallback(() => {
    setCard('chat')
    setReply('')
    setError('')
    inputRef.current?.focus()
  }, [])

  // 记录保存成功：把新记录并回列表，并请 AI 点评一句
  const handleLogSaved = useCallback(
    (saved: DailyLog) => {
      setLogs((prev) => {
        const next = prev.filter((log) => log.date !== saved.date)
        next.push(saved)
        next.sort((a, b) => a.date.localeCompare(b.date))
        return next
      })
      setFace('happy')
      setError('')
      // 用刚存下的记录直接问，不等列表回拉（避免读到旧数据）
      askAssistant({
        intent: 'log',
        logs: [saved],
        profile: profile
          ? { heightCm: profile.heightCm, weightKg: profile.weightKg, age: profile.age }
          : null,
      })
        .then((result) => setReply(result.reply))
        .catch(() => {
          // 点评失败无所谓——数据已经存住了，不打扰用户
        })
    },
    [profile],
  )

  const handleLogDeleted = useCallback(() => {
    const key = todayKey()
    setLogs((prev) => prev.filter((log) => log.date !== key))
    setReply('')
    setFace('idle')
  }, [])

  const handleSubmitQuestion = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    const text = question.trim()
    if (text.length === 0) return
    setCard('chat')
    setQuestion('')
    await ask('free', { message: text })
  }

  const handleProfileSaved = useCallback((saved: HealthProfile) => {
    setProfile(saved)
    setFace('happy')
  }, [])

  const handleProfileCleared = useCallback(() => {
    setProfile(null)
  }, [])

  return (
    <div className="page page--assistant">
      <header className="page__header">
        <h2 className="page__title">{ASSISTANT_PAGE_TITLE}</h2>
        <p className="page__subtitle">{ASSISTANT_PAGE_SUBTITLE}</p>
      </header>

      {/* ─── 中心表情 + 四周气泡 ─── */}
      <section className="assistant-stage" aria-label={ASSISTANT_STAGE_ARIA}>
        <div className="assistant-stage__face">
          <AssistantFace state={face} />
        </div>

        {BUBBLES.map((bubble) => (
          <button
            key={bubble.key}
            type="button"
            className={`bubble bubble--${bubble.drift}${card === bubble.key ? ' bubble--on' : ''}`}
            onClick={() => {
              if (bubble.key === 'log') openLog()
              else if (bubble.key === 'eat') void openEat()
              else if (bubble.key === 'chart') void openChart()
              else openChat()
            }}
          >
            {bubble.text}
          </button>
        ))}
      </section>

      {/* ─── 气泡下方的卡片区，点谁开谁 ─── */}
      <article className="card assistant-card" aria-live="polite">
        {card === 'idle' ? (
          <div className="assistant-card__idle">
            <span className="card__emoji" aria-hidden="true">
              💬
            </span>
            <h3 className="card__name">{ASSISTANT_IDLE_TITLE}</h3>
            <p className="card__desc">{ASSISTANT_IDLE_DESC}</p>
          </div>
        ) : (
          <>
            <h3 className="assistant-card__title">{CARD_TITLES[card]}</h3>

            {card === 'log' && (
              <DailyLogForm
                today={today}
                onSaved={handleLogSaved}
                onDeleted={handleLogDeleted}
                onError={setError}
              />
            )}

            {card === 'chart' && <WeightChart logs={logs} />}

            {card === 'eat' && picked.length > 0 && (
              <p className="assistant-card__candidates">
                候选：{picked.join(' · ')}
              </p>
            )}

            {busy ? (
              <p className="assistant-card__thinking">{ASSISTANT_THINKING}</p>
            ) : (
              reply.length > 0 && (
                <p className="assistant-card__reply">
                  <span className="assistant-card__who">{REPLY_FROM_AI}</span>
                  {reply}
                </p>
              )
            )}

            {error.length > 0 && (
              <p className="form-error" role="alert">
                {error}
              </p>
            )}
          </>
        )}
      </article>

      {/* ─── 底部输入框 ─── */}
      <form className="assistant-ask" onSubmit={handleSubmitQuestion} aria-label={ASSISTANT_ASK_ARIA}>
        <input
          ref={inputRef}
          className="form-input assistant-ask__input"
          type="text"
          value={question}
          onChange={(e) => setQuestion(e.target.value)}
          placeholder={ASSISTANT_INPUT_PLACEHOLDER}
          aria-label={ASSISTANT_QUESTION_ARIA}
        />
        <button type="submit" className="btn btn--primary" disabled={busy}>
          {ASSISTANT_SEND}
        </button>
      </form>

      {dataNote.length > 0 && (
        <p className="assistant-datanote" role="status">
          {dataNote}
        </p>
      )}

      <ProfileCard
        profile={profile}
        onSaved={handleProfileSaved}
        onCleared={handleProfileCleared}
        onError={setError}
      />
    </div>
  )
}

/**
 * 从食物库里随机挑 N 道菜名当候选。
 * 不用分页/筛选那一套（契约第八节：筛选不上后端），随机抽就够。
 */
function pickCandidates(list: Food[], count: number): string[] {
  if (list.length === 0) return []
  const taken: string[] = []
  const wanted = Math.min(count, list.length)
  let guard = 0
  while (taken.length < wanted && guard < 100) {
    guard += 1
    const food = pickRandom(list)
    if (!taken.includes(food.name)) taken.push(food.name)
  }
  return taken
}
