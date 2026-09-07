import { useId } from 'react'
import type { CSSProperties } from 'react'

interface OpenGuiMarkProps {
  readonly style?: CSSProperties
}

/** Compact derivative of the official OpenGUI yellow layered wordmark. */
export function OpenGuiMark({ style }: OpenGuiMarkProps): JSX.Element {
  const gradientId = useId()
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 244 58"
      width="102"
      height="24"
      style={{ display: 'block', flex: '0 0 auto', ...style }}
    >
      <defs>
        <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#ffe76a" />
          <stop offset="52%" stopColor="#ffc423" />
          <stop offset="53%" stopColor="#d88931" />
          <stop offset="100%" stopColor="#c97726" />
        </linearGradient>
      </defs>
      <g
        fontFamily="Arial Black, Impact, Helvetica Neue, sans-serif"
        fontSize="48"
        fontWeight="900"
        letterSpacing="1"
      >
        <text x="5" y="48" fill="none" stroke="#f1bf1f" strokeWidth="3.4">OpenGUI</text>
        <text x="2" y="45" fill="#c97628" stroke="#111111" strokeWidth="2.8">OpenGUI</text>
        <text x="0" y="42" fill={`url(#${gradientId})`} stroke="#111111" strokeWidth="2.8">OpenGUI</text>
      </g>
    </svg>
  )
}
