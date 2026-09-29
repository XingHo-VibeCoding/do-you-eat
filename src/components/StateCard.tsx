// 共用的「数据状态卡」（Day 13 第 3 步）
//
// 用来统一渲染 loading / empty / error 三态：
//   - 一个大圆角卡片
//   - 顶部 emoji（视觉锚点）
//   - 标题 + 描述
//   - 可选行动按钮（点击触发回调，或跳转 hash）
//
// 复用方：HomePage / LibraryPage / ScenariosPage 在非 success 阶段渲染。
// 成功（success）由各页面自渲，不走这个组件。

import type { StateMessage } from '../lib/stateMessages'

interface StateCardProps {
  message: StateMessage
  /** 点行动按钮时回调；不传则按钮不渲染 */
  onAction?: () => void
  /** 提供则用 <a href="#..."> 跳转；与 onAction 二选一 */
  actionHref?: string
}

export function StateCard({ message, onAction, actionHref }: StateCardProps) {
  // action 缺失就不渲染按钮，避免出现「点了没反应」
  if (!message.action) {
    return (
      <article className="card card--state" aria-live="polite">
        <span className="card__emoji" aria-hidden="true">
          {message.icon}
        </span>
        <h2 className="card__name">{message.title}</h2>
        <p className="card__desc">{message.desc}</p>
      </article>
    )
  }

  return (
    <article className="card card--state" aria-live="polite">
      <span className="card__emoji" aria-hidden="true">
        {message.icon}
      </span>
      <h2 className="card__name">{message.title}</h2>
      <p className="card__desc">{message.desc}</p>
      {actionHref !== undefined ? (
        <a href={actionHref} className="btn btn--primary">
          {message.action}
        </a>
      ) : (
        <button type="button" className="btn btn--primary" onClick={onAction}>
          {message.action}
        </button>
      )}
    </article>
  )
}