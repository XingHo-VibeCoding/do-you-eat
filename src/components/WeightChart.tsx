// 体重变化折线图（Day 29）
//
// 手写 SVG，不引图表库。理由与项目一直以来的取舍一致：
// package.json 到现在只有 react + react-dom（hash 路由、状态机都是自实现的），
// 引 recharts 会给首屏多塞几百 KB，而且它的默认配色和本项目的暖橙卡片不搭。
// 体重折线只需要「把 N 个点连成线 + 标首尾 + 标最高最低」，六十行够了。
//
// 输入：DailyLog[]（含 null 字段），本组件自己挑出有体重的那些天。
// 只有 0 或 1 个点时不画线——一个点连不出线，画了反而是骗人。

import {
  buildChartSummary,
  CHART_EMPTY_DESC,
  CHART_EMPTY_TITLE,
  CHART_LABEL_MAX,
  CHART_LABEL_MIN,
  CHART_SUMMARY_COUNT,
  CHART_SUMMARY_DIFF,
} from '../lib/constants'
import type { DailyLog } from '../types/health'

const WIDTH = 300
const HEIGHT = 120
const PAD_LEFT = 10
const PAD_RIGHT = 10
const PAD_TOP = 18
const PAD_BOTTOM = 24

interface WeightChartProps {
  logs: DailyLog[]
}

export function WeightChart({ logs }: WeightChartProps) {
  // 只保留有体重的记录，并按日期升序（日期是 'YYYY-MM-DD' 字符串，字典序即时间序）。
  // 这里顺手把类型收窄成 { date, weightKg }（weightKg 一定非空）：
  // 后面画点、算极值都要反复用，收窄一次就不用到处写 `as number`。
  const points = logs
    .filter((log) => typeof log.weightKg === 'number' && Number.isFinite(log.weightKg))
    .sort((a, b) => a.date.localeCompare(b.date))
    .map((log) => ({ date: log.date, weightKg: log.weightKg as number }))

  if (points.length < 2) {
    return (
      <div className="chart-empty" role="status">
        <span className="card__emoji" aria-hidden="true">
          📈
        </span>
        <h4 className="card__name">{CHART_EMPTY_TITLE}</h4>
        <p className="card__desc">{CHART_EMPTY_DESC}</p>
      </div>
    )
  }

  const values = points.map((p) => p.weightKg)
  const rawMin = Math.min(...values)
  const rawMax = Math.max(...values)

  // 数据区间太窄时人为上下留白，否则折线会贴着框顶/框底，看着像坏了
  const span = Math.max(rawMax - rawMin, 1)
  const min = rawMin - span * 0.15
  const max = rawMax + span * 0.15

  const x = (index: number) =>
    PAD_LEFT + (index * (WIDTH - PAD_LEFT - PAD_RIGHT)) / (points.length - 1)
  const y = (value: number) =>
    PAD_TOP + (1 - (value - min) / (max - min)) * (HEIGHT - PAD_TOP - PAD_BOTTOM)

  const polyline = points.map((p, i) => `${x(i).toFixed(1)},${y(p.weightKg).toFixed(1)}`)
  const lastIndex = points.length - 1
  const last = points[lastIndex]
  const first = points[0]
  const diff = Math.round((last.weightKg - first.weightKg) * 10) / 10

  return (
    <div className="chart">
      <svg
        viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
        className="chart__svg"
        role="img"
        aria-label={buildChartSummary(points.length, first, last)}
      >
        {/* 首尾连线（点已经在下面单独画了，这层只负责把线连起来） */}
        <polyline
          points={polyline.join(' ')}
          fill="none"
          stroke="var(--accent)"
          strokeWidth="2.5"
          strokeLinejoin="round"
          strokeLinecap="round"
        />

        {points.map((p, i) => (
          <circle
            key={p.date}
            cx={x(i)}
            cy={y(p.weightKg)}
            r={i === lastIndex ? 4.5 : 3}
            fill="var(--accent-strong)"
          />
        ))}

        {/* 最高值与最低值标在图内两侧，让人一眼看到区间 */}
        <text x={PAD_LEFT} y={PAD_TOP - 6} className="chart__label" textAnchor="start">
          {CHART_LABEL_MAX} {rawMax}
        </text>
        <text x={WIDTH - PAD_RIGHT} y={PAD_TOP - 6} className="chart__label" textAnchor="end">
          {CHART_LABEL_MIN} {rawMin}
        </text>

        <text x={PAD_LEFT} y={HEIGHT - 6} className="chart__label" textAnchor="start">
          {first.date.slice(5)}
        </text>
        <text x={WIDTH - PAD_RIGHT} y={HEIGHT - 6} className="chart__label" textAnchor="end">
          {last.date.slice(5)}
        </text>
      </svg>

      <p className="chart__summary">
        共 <strong>{points.length}</strong> {CHART_SUMMARY_COUNT} · {CHART_SUMMARY_DIFF}{' '}
        <strong>
          {diff > 0 ? '+' : ''}
          {diff} kg
        </strong>
      </p>
    </div>
  )
}
