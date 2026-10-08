// 应用主组件（Day 13 第 2 步改为路由壳）
//
// 历史上的 App.tsx 是「单页 + 全部业务」——一个文件管 header / footer / 抽卡 / 筛选。
// Day 13 起，App 退化成「路由壳」：
//   - 拿当前 hash 路由
//   - 渲染公共 header + 导航 + 当前页 + footer
//   - 业务状态全部下放到对应页面（HomePage / LibraryPage / ScenariosPage / HealthPage）
//
// Day 20 变更：收藏状态线接上真实后端——应用启动时调 GET /api/favorites
// 从数据库恢复收藏（配合 getUserId() 生成的匿名 X-User-Id）。
// 此前 Day 11 决策「刷新即清空」从此作废，收藏跨会话持久化。

import { useCallback, useEffect, useState } from 'react'
import { useRoute } from './lib/hashRouter'
import { AppNav } from './components/AppNav'
import { HomePage } from './pages/HomePage'
import { LibraryPage } from './pages/LibraryPage'
import { ScenariosPage } from './pages/ScenariosPage'
import { HealthPage } from './pages/HealthPage'
import { getFavorites } from './services/api'
import { APP_NAME, APP_TAGLINE } from './lib/constants'

function App() {
  const { route } = useRoute()

  // —— 收藏状态线（Day 14 上提 App；Day 20 接真实后端）——
  // Day 20 起收藏存在云数据库（favorites 表），启动时从后端拉回。
  // 后端不可达时静默降级为空 Set，用户仍可正常使用（只是看不到旧收藏）。
  const [favoriteIds, setFavoriteIds] = useState<ReadonlySet<string>>(() => new Set())

  useEffect(() => {
    let cancelled = false
    getFavorites()
      .then((list) => {
        if (!cancelled) setFavoriteIds(new Set(list))
      })
      .catch(() => {
        // 网络错误 / 后端 5xx：静默降级，不阻塞页面渲染
      })
    return () => {
      cancelled = true
    }
  }, [])

  /** 收藏 / 取消收藏成功后的落库回调：更新内存状态触发重渲染 */
  const handleToggleFavorite = useCallback(
    (foodId: string, next: boolean) => {
      setFavoriteIds((prev) => {
        const nextSet = new Set(prev)
        if (next) {
          nextSet.add(foodId)
        } else {
          nextSet.delete(foodId)
        }
        return nextSet
      })
    },
    [],
  )

  const renderPage = () => {
    switch (route) {
      case '/library':
        return <LibraryPage favoriteIds={favoriteIds} />
      case '/scenarios':
        return <ScenariosPage />
      case '/health':
        return <HealthPage />
      case '/':
      default:
        return (
          <HomePage favoriteIds={favoriteIds} onToggleFavorite={handleToggleFavorite} />
        )
    }
  }

  return (
    <div className="app">
      <header className="app__header">
        <h1 className="app__title">{APP_NAME}</h1>
        <p className="app__tagline">{APP_TAGLINE}</p>
      </header>

      <AppNav current={route} />

      <main className="section--main">{renderPage()}</main>

      <footer className="app__footer copy-line" aria-hidden="true">
        —— 决定不下，就让概率来 ——
      </footer>
    </div>
  )
}

export default App
