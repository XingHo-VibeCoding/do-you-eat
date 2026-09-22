import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import './styles/app.css'

// 应用入口：把 App 组件挂载到 index.html 的 #root 节点上
ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
)
