import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// Vite 配置：React 插件 + 相对路径打包（为后续静态托管部署预留）
export default defineConfig({
  plugins: [react()],
  base: './',
})
