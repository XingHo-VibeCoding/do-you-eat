// 应用主组件（Day 13 第 2 步改为路由壳）
//
// 历史上的 App.tsx 是「单页 + 全部业务」——一个文件管 header / footer / 抽卡 / 筛选。
// Day 13 起，App 退化成「路由壳」：
//   - 拿当前 hash 路由
//   - 渲染公共 header + 导航 + 当前页 + footer
//   - 业务状态全部下放到对应页面（HomePage / LibraryPage / ScenariosPage / HealthPage）

import { useRoute } from './lib/hashRouter'
import { AppNav } from './components/AppNav'
import { HomePage } from './pages/HomePage'
import { LibraryPage } from './pages/LibraryPage'
import { ScenariosPage } from './pages/ScenariosPage'
import { HealthPage } from './pages/HealthPage'
import { APP_NAME, APP_TAGLINE } from './lib/constants'

function App() {
  const { route } = useRoute()

  const renderPage = () => {
    switch (route) {
      case '/library':
        return <LibraryPage />
      case '/scenarios':
        return <ScenariosPage />
      case '/health':
        return <HealthPage />
      case '/':
      default:
        return <HomePage />
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