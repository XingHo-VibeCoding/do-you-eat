// 顶部导航（Day 13 第 2 步）
//
// 4 个 tab，用 hash 跳转：
//   - 用 <a href="#/..."> 而不是 <button onClick>：
//     浏览器免费给「右键复制链接」「中键新标签」「返回按钮」三件套
//   - 当前页加 .is-active 类 + aria-current="page"：
//     既给视觉信号，也给屏幕阅读器信号（不能只靠颜色——WCAG）
//   - 44×44 px 触控目标：移动端大拇指容易按到

import type { Route } from '../lib/hashRouter'

interface NavItem {
  path: Route
  label: string
  icon: string
  /** 给屏幕阅读器多读一播页面用途，不显示在屏上 */
  hint: string
}

const NAV_ITEMS: readonly NavItem[] = [
  { path: '/', label: '抽一抽', icon: '🎲', hint: '随机抽一道菜' },
  { path: '/library', label: '食物库', icon: '🍱', hint: '浏览和管理食物列表' },
  { path: '/scenarios', label: '场景抽取', icon: '⏰', hint: '按场景筛选后抽取' },
  { path: '/health', label: '健康档案', icon: '💪', hint: '记录身高体重等数据' },
]

interface AppNavProps {
  current: Route
}

export function AppNav({ current }: AppNavProps) {
  return (
    <nav className="app-nav" aria-label="主导航">
      <ul className="app-nav__list" role="list">
        {NAV_ITEMS.map((item) => {
          const isActive = item.path === current
          return (
            <li key={item.path} className="app-nav__item">
              <a
                href={`#${item.path}`}
                className={`app-nav__link${isActive ? ' is-active' : ''}`}
                aria-current={isActive ? 'page' : undefined}
                aria-label={item.hint}
              >
                <span className="app-nav__icon" aria-hidden="true">
                  {item.icon}
                </span>
                <span className="app-nav__label">{item.label}</span>
              </a>
            </li>
          )
        })}
      </ul>
    </nav>
  )
}