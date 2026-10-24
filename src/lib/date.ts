// 日期工具（Day 29）
//
// 只有一件事：把 Date 转成接口 #14 要的 'YYYY-MM-DD'。
//
// 为什么单独拎出来：必须用**用户本地日历日**，不能直接 toISOString().slice(0,10)。
// toISOString 会先转 UTC——东八区在 00:00–08:00 之间会算成前一天，
// 用户大清早记的体重就被归到昨天去了。这类时区偏移 bug 平时看不出来，
// 只在特定时段出现，是最难查的一种。

/** 把 Date 转成 'YYYY-MM-DD'（按用户本地时区，不是 UTC） */
export function toDateKey(date: Date): string {
  const pad = (n: number) => n.toString().padStart(2, '0')
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`
}

/** 今天（本地日历日） */
export function todayKey(): string {
  return toDateKey(new Date())
}
