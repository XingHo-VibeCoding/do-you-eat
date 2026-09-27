// 模拟收藏接口（Day 11 板块②）
// 作用：假装自己是未来的「收藏」云接口 —— 有延迟、会成功、也可能失败。
// 注意：收藏状态本身放在 App.tsx 的 useState（内存）里，刷新即清空（今天不接数据库）；
//       本文件只负责模拟「网络往返」这一段，让按钮有真实的 pending 期可测。
// 第 3 周接真实后端时，把这两个函数换成真的 fetch 即可，按钮组件一行不用改。
//
// 失败触发方式（演示用，与 ?mode=xxx 互不干扰，可共存）：
//   正常：    http://localhost:5173/
//   收藏失败：http://localhost:5173/?fav=error

const MOCK_DELAY_MS = 400

/** 从地址栏读 ?fav= 参数，只有显式传 error 才模拟失败 */
function shouldFail(): boolean {
  return new URLSearchParams(window.location.search).get('fav') === 'error'
}

/** 模拟一次网络往返：延迟 + 按开关决定成功或失败 */
function roundTrip<T>(result: T, action: string): Promise<T> {
  return new Promise((resolve, reject) => {
    window.setTimeout(() => {
      if (shouldFail()) {
        reject(new Error(`模拟收藏请求失败：${action}没能完成`))
        return
      }
      resolve(result)
    }, MOCK_DELAY_MS)
  })
}

/** 收藏一个食物（模拟版）。第 3 周换真 API 时保留函数名和返回形态。 */
export function addFavorite(foodId: string): Promise<{ foodId: string }> {
  return roundTrip({ foodId }, '收藏')
}

/** 取消收藏（模拟版）。 */
export function removeFavorite(foodId: string): Promise<{ foodId: string }> {
  return roundTrip({ foodId }, '取消收藏')
}
