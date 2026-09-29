// 模拟数据接口（Day 8 第 1 步；Day 13 第 3 步扩展）
//
// 作用：假装自己是一个后端 API —— 有延迟、会成功、也可能「空」或「报错」。
// 第 3 周接真实 API 时，只需要把 fetchFoods / addFood / removeFood 换成真的 fetch，
// 上层组件完全不用动，因为四态状态机的约定不变。
//
// 空状态 / 错误状态的触发方式（演示用）：
//   正常数据：https://doyoueat-...tcloudbaseapp.com/
//   空数据：  https://doyoueat-...tcloudbaseapp.com/?mode=empty
//   请求失败：https://doyoueat-...tcloudbaseapp.com/?mode=error
//
// Day 13 起，本文件多两个 API：
//   - addFood(input)   新增一道菜到 mock 库（自动生成 id）
//   - removeFood(id)   从 mock 库删除一道菜
//   - listFoods()      同步读取当前列表（不走 setTimeout）

import { FOODS } from '../data/foods'
import type { Food } from '../types/food'

const MOCK_DELAY_MS = 800

export type MockMode = 'normal' | 'empty' | 'error'

/** mock 内部可变列表（克隆 FOODS，避免污染源数据；新增/删除都改这个） */
let mockFoods: Food[] = FOODS.map((f) => ({ ...f }))

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
      // 返回克隆避免外部直接改到内部列表
      resolve(mode === 'empty' ? [] : mockFoods.map((f) => ({ ...f })))
    }, MOCK_DELAY_MS)
  })
}

/** 新增一道菜的入参（id 由 mock 自动生成） */
export type AddFoodInput = Omit<Food, 'id'>

/** 简单 id 生成器（time + random，碰撞概率极低；真后端换 UUID 即可） */
function newFoodId(): string {
  return `user-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`
}

/** 新增一道菜到 mock 库；返回新菜（带 id） */
export function addFood(input: AddFoodInput): Food {
  const food: Food = { id: newFoodId(), ...input }
  mockFoods = [...mockFoods, food]
  return food
}

/** 从 mock 库删除一道菜；找不到 id 是静默 no-op（真后端可能是 404） */
export function removeFood(id: string): void {
  mockFoods = mockFoods.filter((f) => f.id !== id)
}

/** 同步读取当前 mock 列表（不走 setTimeout） */
export function listFoods(): readonly Food[] {
  return mockFoods.map((f) => ({ ...f }))
}