// 极简 hash 路由（Day 13 第 2 步）
//
// 为什么自实现而不引入 react-router-dom：
//   1. 任务约束「不要做路由库的进阶用法（够用就好）」
//   2. 4 个页面、无嵌套 / 无守卫 / 无动态路由——hash 自实现 ~40 行代码够用
//   3. CloudBase 静态托管天然支持 hash，无需服务端 fallback 配置
//   4. 不动 package.json，降低 Day 13 风险面
//
// 路径约定：
//   #/        → 首页（抽一抽）
//   #/library → 食物库（浏览 + 增删）
//   #/scenarios → 场景抽取（早/中/晚 + 八大菜系）
//   #/health  → 健康档案（身高 / 体重 / 年龄）
//   其他 hash → fallback 到 '/'
//
// 与浏览器历史栈的协作：
//   - 用 window.location.hash 跳转，每次会在历史栈里加一条记录
//   - 用户点浏览器「返回」按钮 = hashchange 事件触发，组件自动渲染上一页
//   - 这部分不用我们额外写代码，浏览器已经免费给了

import { useCallback, useEffect, useState } from 'react'

export const ROUTES = ['/', '/library', '/scenarios', '/health'] as const
export type Route = (typeof ROUTES)[number]

const DEFAULT_ROUTE: Route = '/'

/** 把当前 window.location.hash 解析为 Route；非法值 fallback 到默认 */
function parseHash(): Route {
  // window.location.hash 是带 '#' 的字符串，例如 '#/library'
  const raw = window.location.hash.slice(1)
  // 兼容 '#library' 这种没带斜杠的写法（容忍输入）
  const path = raw.startsWith('/') ? raw : '/' + raw
  return (ROUTES as readonly string[]).includes(path) ? (path as Route) : DEFAULT_ROUTE
}

/** 编程式导航：跳到指定路径（不刷新页面，只改 hash） */
export function navigate(path: Route): void {
  // 直接赋值给 hash，浏览器会自动加历史记录 + 触发 hashchange 事件
  window.location.hash = '#' + path
}

/**
 * React hook：返回当前路由 + 跳转函数。
 * 第一次渲染时立刻从 window.location.hash 取一次，
 * 之后每次 hashchange 都更新。
 */
export function useRoute(): { route: Route; go: (path: Route) => void } {
  const [route, setRoute] = useState<Route>(() => parseHash())

  useEffect(() => {
    const onHashChange = () => setRoute(parseHash())
    window.addEventListener('hashchange', onHashChange)
    return () => window.removeEventListener('hashchange', onHashChange)
  }, [])

  const go = useCallback((path: Route) => {
    navigate(path)
  }, [])

  return { route, go }
}