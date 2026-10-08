import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// Vite 配置：React 插件 + 相对路径打包（为后续静态托管部署预留）
// 开发代理（Day 20 本地接线）：/api → CloudBase 网关
//   原因：生产 API 是公网地址，前端直连需要网关 CORS 白名单（已配置好）。
//   但开发环境 localhost:5173 不在白名单里，浏览器请求会被 CORS 拦截。
//   加这个 proxy 后：浏览器以为请求的是 localhost:5173/api/xxx（同源无跨域），
//   实际由 Vite 服务器转发到真实公网 API。
export default defineConfig({
  plugins: [react()],
  base: './',
  server: {
    proxy: {
      '/api': {
        target: 'https://doyoueat-d5g36rg7ia785b553-1496350653.ap-shanghai.app.tcloudbase.com',
        changeOrigin: true,
      },
    },
  },
})
