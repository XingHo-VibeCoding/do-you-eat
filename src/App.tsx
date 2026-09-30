// 应用主组件（Day 13 第 2 步改为路由壳）
//
// 历史上的 App.tsx 是「单页 + 全部业务」——一个文件管 header / footer / 抽卡 / 筛选。
// Day 13 起，App 退化成「路由壳」：
//   - 拿当前 hash 路由
//   - 渲染公共 header + 导航 + 当前页 + footer
//   - 业务状态全部下放到对应页面（HomePage / LibraryPage / ScenariosPage / HealthPage）

import { useCallback, useState } from 'react'
import { useRoute } from './lib/hashRouter'
import { AppNav } from './components/AppNav'
import { HomePage } from './pages/HomePage'
import { LibraryPage } from './pages/LibraryPage'
import { ScenariosPage } from './pages/ScenariosPage'
import { HealthPage } from './pages/HealthPage'
import { APP_NAME, APP_TAGLINE } from './lib/constants'

function App() {
  const { route } = useRoute()

  // —— 收藏状态线（Day 14 从 HomePage 上提到路由壳）——
  // 上提原因：Day 11 起收藏状态放 HomePage 的 useState（内存），切到其他页面时
  // HomePage 被卸载、收藏随之丢失——用户测试反馈「收藏的食物找不到」，一半根源在此。
  // 放到 App（路由壳，永不卸载）后收藏跨页面存活；刷新清空的边界维持 Day 11 决策不变。
  const [favoriteIds, setFavoriteIds] = useState<ReadonlySet<string>>(() => new Set())

  /** 收藏 / 取消收藏成功后的落库（内存版）：交给 FavoriteButton 成功回调 */
  const handleToggleFavorite = useCallback((foodId: string, next: boolean) => {
    setFavoriteIds((prev) => {
      const nextSet = new Set(prev)
      if (next) {
        nextSet.add(foodId)
      } else {
        nextSet.delete(foodId)
      }
      return nextSet
    })
  }, [])

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