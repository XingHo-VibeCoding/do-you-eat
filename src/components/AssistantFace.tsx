// 会变化的可爱表情（Day 29）
//
// 用 SVG 画而不是贴 emoji：emoji 是固定图片，变不了表情；
// 这里把「脸型 / 眼睛 / 嘴巴 / 腮红」拆开，靠换属性实现五种表情。
// 不引动画库——呼吸和眨眼都是 CSS keyframes（transform + opacity），
// 与 Day 24 的骰子动画、Day 7 的卡片动画同一套做法。
//
// 五种状态对应页面在干的事：
//   idle     普通微笑（默认）
//   thinking 眯眼 + 抿嘴（在等 AI 回答）
//   happy    大笑 + 腮红（刚记下数据 / AI 夸了）
//   hungry   张嘴（聊吃的）
//   sleepy   闭眼（聊睡眠 / 记录睡眠不足）

export type FaceState = 'idle' | 'thinking' | 'happy' | 'hungry' | 'sleepy'

/** 每种表情的嘴巴路径（换 d 属性即可，不需要重画整个脸） */
const MOUTHS: Record<FaceState, string> = {
  idle: 'M42 72 Q60 86 78 72',
  thinking: 'M48 78 L72 78',
  happy: 'M40 70 Q60 92 80 70',
  hungry: 'M44 70 Q60 88 76 70',
  sleepy: 'M52 78 Q60 83 68 78',
}

/** 每种表情的眼睛睁开的程度（ry 越大越圆） */
const EYE_RY: Record<FaceState, number> = {
  idle: 8,
  thinking: 3.5,
  happy: 7,
  hungry: 9,
  sleepy: 1.2,
}

/** 哪些表情要露腮红 */
const BLUSH: Record<FaceState, number> = {
  idle: 0,
  thinking: 0,
  happy: 0.55,
  hungry: 0.4,
  sleepy: 0.25,
}

interface AssistantFaceProps {
  state: FaceState
}

export function AssistantFace({ state }: AssistantFaceProps) {
  const ry = EYE_RY[state]
  const blush = BLUSH[state]

  return (
    <svg
      className="assistant-face"
      viewBox="0 0 120 120"
      role="img"
      aria-label={
        state === 'thinking'
          ? '助手正在思考'
          : state === 'happy'
            ? '助手很开心'
            : state === 'hungry'
              ? '助手在聊吃的'
              : state === 'sleepy'
                ? '助手有点困'
                : '健康助手'
      }
    >
      {/* 呼吸：整张脸轻微放大缩小，让静态页面有活气 */}
      <g className="assistant-face__body">
        <circle
          cx="60"
          cy="60"
          r="52"
          fill="var(--accent-soft)"
          stroke="var(--accent)"
          strokeWidth="2.5"
        />

        {blush > 0 && (
          <>
            <ellipse
              className="assistant-face__blush"
              cx="30"
              cy="70"
              rx="9"
              ry="5"
              fill="var(--accent)"
              opacity={blush}
            />
            <ellipse
              className="assistant-face__blush"
              cx="90"
              cy="70"
              rx="9"
              ry="5"
              fill="var(--accent)"
              opacity={blush}
            />
          </>
        )}

        {/* 眨眼：整组眼睛一起压扁。transform-box 让 transform-origin 落在眼睛自身上 */}
        <g className="assistant-face__eyes">
          <ellipse cx="44" cy="52" rx="6" ry={ry} fill="var(--accent-strong)" />
          <ellipse cx="76" cy="52" rx="6" ry={ry} fill="var(--accent-strong)" />
        </g>

        <path
          className="assistant-face__mouth"
          d={MOUTHS[state]}
          fill="none"
          stroke="var(--accent-strong)"
          strokeWidth="4"
          strokeLinecap="round"
        />
      </g>
    </svg>
  )
}
