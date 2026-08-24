import type { CSSProperties } from 'react'
import type { CorematePromotionData } from './promotion-data.ts'
import { OpenGuiMark } from './OpenGuiMark.tsx'

const GITHUB_URL = 'https://github.com/Core-Mate/OpenGUI'
const USE_CASES_URL = 'https://github.com/Core-Mate/Coremate-Mobile-Plugin/blob/main/docs/use-cases.zh.md'

const cardStyle: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  flexWrap: 'wrap',
  gap: 16,
  padding: '16px 18px',
  borderRadius: 12,
  color: 'var(--dsw-alias-label-primary, #27272a)',
  background: 'color-mix(in srgb, #f1bf1f 9%, var(--dsw-alias-bg-layer-1, #fff))',
  boxShadow: '0 1px 3px rgba(39, 39, 42, 0.12)',
  boxSizing: 'border-box',
}

const copyStyle: CSSProperties = {
  display: 'grid',
  minWidth: 220,
  flex: '1 1 360px',
  gap: 6,
}

const titleStyle: CSSProperties = { margin: 0, fontSize: 15, lineHeight: 1.35, fontWeight: 700 }

const bodyStyle: CSSProperties = {
  margin: 0,
  maxWidth: 620,
  color: 'var(--dsw-alias-label-secondary, #52525b)',
  fontSize: 13,
  lineHeight: 1.55,
}

const linkStyle: CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  minHeight: 40,
  padding: '0 14px',
  borderRadius: 9,
  color: '#171717',
  background: '#f1bf1f',
  fontSize: 13,
  fontWeight: 700,
  textDecoration: 'none',
  whiteSpace: 'nowrap',
}

const suggestionsStyle: CSSProperties = {
  display: 'flex',
  flexWrap: 'wrap',
  gap: 8,
  width: '100%',
}

const suggestionStyle: CSSProperties = {
  minHeight: 40,
  padding: '0 13px',
  border: '1px solid color-mix(in srgb, #f1bf1f 38%, var(--dsw-alias-border-l2, #d4d4d8))',
  borderRadius: 9,
  color: 'var(--dsw-alias-label-primary, #27272a)',
  background: 'var(--dsw-alias-bg-layer-1, #fff)',
  font: 'inherit',
  fontSize: 13,
  fontWeight: 650,
  cursor: 'pointer',
}

interface CorematePromotionCardProps {
  readonly matched: CorematePromotionData
  readonly inputActions: { setDraft(text: string): void }
}

/** One post-success OpenGUI promotion, mounted only after the selector accepts a Turn. */
export function CorematePromotionCard({ matched, inputActions }: CorematePromotionCardProps): JSX.Element {
  return (
    <aside style={cardStyle} data-coremate-promotion={matched.status} aria-label="OpenGUI 后续操作与推荐">
      <style>{`[data-coremate-action]{transition:transform 120ms cubic-bezier(.16,1,.3,1)}[data-coremate-action]:active{transform:scale(.96)}[data-coremate-action]:focus-visible{outline:2px solid #d9a900;outline-offset:2px}@media(prefers-reduced-motion:reduce){[data-coremate-action]{transition:none}}`}</style>
      <div style={copyStyle}>
        <OpenGuiMark />
        <p style={titleStyle}>接下来可以继续</p>
        <p style={bodyStyle}>选择建议只会填入输入框，确认内容后再发送。</p>
      </div>
      {matched.suggestions.length === 0 ? null : (
        <div style={suggestionsStyle} aria-label="OpenGUI 后续建议">
          {matched.suggestions.map(item => (
            <button
              key={`${item.label}:${item.prompt}`}
              type="button"
              data-coremate-action
              style={suggestionStyle}
              onClick={() => inputActions.setDraft(`@OpenGUI ${item.prompt}`)}
            >
              {item.label}
            </button>
          ))}
        </div>
      )}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
        <a data-coremate-action href={USE_CASES_URL} target="_blank" rel="noreferrer" style={{ ...linkStyle, color: 'var(--dsw-alias-label-primary, #27272a)', background: 'var(--dsw-alias-bg-layer-1, #fff)' }}>查看好用例 ↗</a>
        <a data-coremate-action href={GITHUB_URL} target="_blank" rel="noreferrer" style={linkStyle}>OpenGUI Git ↗</a>
      </div>
    </aside>
  )
}
