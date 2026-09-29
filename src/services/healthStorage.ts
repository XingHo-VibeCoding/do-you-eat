// 健康档案的存储引擎（Day 13 第 3 步）
//
// 设计原则（与项目专属规则第 1 条一致）：
//   组件 / 页面里禁止直接写 localStorage.getItem / setItem。
//   评分已经走 storage.ts；健康数据走本文件；将来接云端时两个 service 一起替换。
//
// 数据形状：
//   { heightCm, weightKg, age, updatedAt }
//   - heightCm / weightKg / age 都是数字（浮点 / 整数）
//   - updatedAt 是 ISO 8601 字符串（saveHealth 自动写入）
//
// 容错：
//   - localStorage 读不到 / JSON.parse 失败 / 字段类型不对 → 视为「没有」，返回 null
//   - 写入用 try / catch 包；localStorage 在隐私窗口可能被禁用
//
// key 命名：
//   - `dye:health:v1` = "do-you-eat / health / version 1"
//   - 留 v1 后缀是为了将来 schema 变化时（v2 / v3）能平滑迁移

const KEY = 'dye:health:v1'

export interface HealthProfile {
  heightCm: number
  weightKg: number
  age: number
  /** ISO 8601 时间戳，由 saveHealth 写入 */
  updatedAt: string
}

/** 类型守卫：判断一个 unknown 是不是合法 HealthProfile */
function isHealthProfile(x: unknown): x is HealthProfile {
  if (typeof x !== 'object' || x === null) return false
  const o = x as Record<string, unknown>
  return (
    typeof o.heightCm === 'number' &&
    typeof o.weightKg === 'number' &&
    typeof o.age === 'number' &&
    typeof o.updatedAt === 'string'
  )
}

/** 读取已保存的健康档案；不存在 / 解析失败都返回 null */
export function getHealth(): HealthProfile | null {
  try {
    const raw = window.localStorage.getItem(KEY)
    if (raw === null) return null
    const parsed: unknown = JSON.parse(raw)
    return isHealthProfile(parsed) ? parsed : null
  } catch {
    return null
  }
}

/** 写入健康档案；返回写入后的完整记录（含 updatedAt） */
export function saveHealth(profile: Omit<HealthProfile, 'updatedAt'>): HealthProfile {
  const full: HealthProfile = {
    ...profile,
    updatedAt: new Date().toISOString(),
  }
  try {
    window.localStorage.setItem(KEY, JSON.stringify(full))
  } catch {
    // localStorage 在隐私窗口可能抛 QuotaExceededError；
    // 这里静默 —— UI 层用「是否拿到返回值」判断即可
  }
  return full
}

/** 清空已保存的健康档案（用户主动删除） */
export function clearHealth(): void {
  try {
    window.localStorage.removeItem(KEY)
  } catch {
    // 同上，静默
  }
}