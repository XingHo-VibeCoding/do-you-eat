// 数据更新时间戳（Day 20 余力加练）
//
// 为什么需要：接上真实 API 后，页面上的数据只是「某次拉取的快照」——
// 在控制台改过数据库后，需要一眼看出数据是什么时候拉的，并能手动刷新。
// 三个拉 foods 的页面（首页 / 食物库 / 场景）共用这个组件。
//
// 设计边界：
//   - 显示的时间是「前端最近一次拉取成功的时刻」，不是数据库的修改时间
//     （api-contract.md 没有这个字段，不加接口是 MVP 边界决策）
//   - 点击 = 重新拉取；拉取期间页面进入 loading 态，本组件随主体卸载，
//     所以不需要 loading 样式
//   - updatedAt 为 null（还没成功拉过 / 拉取失败）时显示 --:--

interface Props {
  /** 最近一次拉取成功的时刻；null = 尚未成功拉取过 */
  updatedAt: Date | null
  /** 重新拉取（直接复用各页面自己的 load） */
  onRefresh: () => void
}

export function DataUpdatedStamp({ updatedAt, onRefresh }: Props) {
  const pad = (n: number) => n.toString().padStart(2, '0')
  const label = updatedAt
    ? `${pad(updatedAt.getHours())}:${pad(updatedAt.getMinutes())}`
    : '--:--'
  return (
    <button type="button" className="updated-stamp" onClick={onRefresh}>
      数据更新于 {label} · 点击刷新
    </button>
  )
}
