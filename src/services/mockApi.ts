// 模拟数据接口（Day 8 第 1 步）
// 作用：假装自己是一个后端 API —— 有延迟、会成功、也可能「空」或「报错」。
// 第 3 周接真实 API 时，只需要把 fetchFoods 换成真的 fetch，
// 上层组件（App.tsx）完全不用动，因为四态状态机的约定不变。
//
// 空状态 / 错误状态的触发方式（演示用）：
//   正常数据：http://localhost:5173/
//   空数据：  http://localhost:5173/?mode=empty
//   请求失败：http://localhost:5173/?mode=error

import { FOODS } from '../data/foods'
import type { Food } from '../types/food'

/** 模拟网络延迟（毫秒）：太短看不出 loading，太长用户会烦 */
const MOCK_DELAY_MS = 800

export type MockMode = 'normal' | 'empty' | 'error'

/** 从地址栏读 ?mode= 参数；没传或传错了按 normal 处理 */
function readModeFromUrl(): MockMode {
  const mode = new URLSearchParams(window.location.search).get('mode')
  if (mode === 'empty' || mode === 'error') return mode
  return 'normal'
}

/**
 * 拉取食物列表（模拟版）。
 * 返回 Promise 是关键：和真实 API 的返回形态保持一致，
 * 上层用 .then/.catch 就能自然写出四态。
 */
export function fetchFoods(mode: MockMode = readModeFromUrl()): Promise<readonly Food[]> {
  return new Promise((resolve, reject) => {
    window.setTimeout(() => {
      if (mode === 'error') {
        // 真实世界里可能是 404 / 500 / 断网，这里统一用一个 Error 模拟
        reject(new Error('模拟请求失败：食堂数据没能拿回来'))
        return
      }
      resolve(mode === 'empty' ? [] : FOODS)
    }, MOCK_DELAY_MS)
  })
}
