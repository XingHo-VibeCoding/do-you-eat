// 健康相关的数据类型（Day 29）
//
// 与 api-contract.md 附录 B 逐字段对齐，也和数据库 daily_logs /
// health_profiles 的列名一致（列名 camelCase 且带双引号，PostgREST 查出来
// 直接就是这个形状，前端零转换、不做蛇形映射）。

/** 健康档案：一人一份，长期不变的常量（身高 / 体重 / 年龄） */
export interface HealthProfile {
  heightCm: number
  weightKg: number
  age: number
  /** ISO 8601 时间戳，由后端写入，前端只回显 */
  updatedAt: string
}

/**
 * 每日健康记录：一人一天一条。
 * 业务字段全部可空——用户可能早上只记了体重、晚上才补饮食，
 * 接口 #14 是「字段级 upsert」，没提交的字段保留原值。
 */
export interface DailyLog {
  /** YYYY-MM-DD */
  date: string
  weightKg: number | null
  sleepHours: number | null
  waterMl: number | null
  /** 1~5 */
  mood: number | null
  meals: string[] | null
  note: string | null
  /** ISO 8601 时间戳，后端写入 */
  createdAt: string
}

/** 写入某天记录时提交的内容：全部字段可选，只提交用户真的填了的那些 */
export type DailyLogInput = Partial<Pick<DailyLog, 'weightKg' | 'sleepHours' | 'waterMl' | 'mood' | 'meals' | 'note'>>

/** AI 助手的四个意图（契约 #16） */
export type AssistantIntent = 'trend' | 'recommend' | 'log' | 'free'

/** 向 #16 提问时带的上下文 */
export interface AssistantRequest {
  intent: AssistantIntent
  message?: string
  candidates?: string[]
  logs?: DailyLog[]
  profile?: Omit<HealthProfile, 'updatedAt'> | null
}

/** #16 的回答。source 标明这条回答是模型给的还是规则引擎给的 */
export interface AssistantReply {
  reply: string
  source: 'llm' | 'rules'
}
