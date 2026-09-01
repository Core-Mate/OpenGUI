import type { CSSProperties } from 'react'
import type { CommandNode } from '@deepseek-ai/dsh-client-runtime/client'
import type { CommandRowProps } from '@deepseek-ai/dsh-client-ui-conversation/client'
import { OpenGuiMark } from './OpenGuiMark.tsx'

export interface OpenGuiCommandPresentation {
  readonly state: 'running' | 'success' | 'stopped' | 'error'
  readonly summary: string
  readonly task?: string
  readonly detail?: string
}

const cardStyle: CSSProperties = {
  display: 'grid',
  gap: 10,
  width: '100%',
  padding: '14px 16px',
  border: '1px solid color-mix(in srgb, #f1bf1f 34%, var(--dsw-alias-border-l2, #d4d4d8))',
  borderRadius: 12,
  color: 'var(--dsw-alias-label-primary, #27272a)',
  background: 'color-mix(in srgb, #f1bf1f 7%, var(--dsw-alias-bg-layer-1, #fff))',
  boxShadow: '0 1px 3px rgba(39, 39, 42, 0.08)',
  boxSizing: 'border-box',
}

const stateLabelStyle: CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  minHeight: 22,
  padding: '0 8px',
  borderRadius: 999,
  fontSize: 11,
  fontWeight: 700,
  whiteSpace: 'nowrap',
}

function normalizedText(value: string | null | undefined): string | undefined {
  const text = value?.trim()
  return text === undefined || text.length === 0 ? undefined : text
}

/** Derive durable presentation from the command log, never from live global task state. */
export function openGuiCommandPresentation(node: CommandNode): OpenGuiCommandPresentation {
  const task = normalizedText(node.args)
  if (node.outcome === null) {
    return {
      state: 'running',
      summary: 'OpenGUI 已接收任务，正在处理…',
      ...(task === undefined ? {} : { task }),
    }
  }
  const detail = node.outcome.sourceEventSeq === undefined
    ? normalizedText(node.outcome.text)
    : undefined
  if (node.outcome.kind === 'error') {
    if (detail?.includes('OpenGUI task stopped by user') === true) {
      return {
        state: 'stopped',
        summary: 'OpenGUI 任务已停止',
        ...(task === undefined ? {} : { task }),
      }
    }
    return {
      state: 'error',
      summary: 'OpenGUI 任务执行失败',
      ...(task === undefined ? {} : { task }),
      ...(detail === undefined ? {} : { detail }),
    }
  }
  return {
    state: 'success',
    summary: 'OpenGUI 任务已完成',
    ...(task === undefined ? {} : { task }),
    ...(detail === undefined ? {} : { detail }),
  }
}

/** Visible lifecycle row for /opengui and its legacy /coremate alias. */
export function OpenGuiCommandCard({ node }: CommandRowProps): JSX.Element {
  const presentation = openGuiCommandPresentation(node)
  const running = presentation.state === 'running'
  const error = presentation.state === 'error'
  const stopped = presentation.state === 'stopped'
  const stateLabel = running ? '处理中' : error ? '失败' : stopped ? '已停止' : '已完成'
  const stateColor = running ? '#8a5a00' : error ? '#b91c1c' : stopped ? '#52525b' : '#15803d'
  const stateBackground = running ? 'rgba(241, 191, 31, 0.18)' : error ? 'rgba(185, 28, 28, 0.10)' : stopped ? 'rgba(82, 82, 91, 0.10)' : 'rgba(21, 128, 61, 0.10)'

  return (
    <section
      role={error ? 'alert' : 'status'}
      aria-live={error ? 'assertive' : 'polite'}
      aria-busy={running}
      data-coremate-command-status={presentation.state}
      style={{ ...cardStyle, ...(error ? { borderColor: 'rgba(185, 28, 28, 0.32)' } : {}) }}
    >
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 10 }}>
        <OpenGuiMark style={{ width: 88, height: 'auto' }} />
        <span style={{ ...stateLabelStyle, color: stateColor, background: stateBackground }}>{stateLabel}</span>
      </div>
      {presentation.task === undefined ? null : (
        <p style={{ margin: 0, overflowWrap: 'anywhere', fontSize: 14, lineHeight: 1.55, fontWeight: 650 }}>
          {presentation.task}
        </p>
      )}
      <p style={{ margin: 0, color: error ? '#b91c1c' : 'var(--dsw-alias-label-secondary, #52525b)', fontSize: 13, lineHeight: 1.5 }}>
        {presentation.summary}
      </p>
      {presentation.detail === undefined ? null : (
        <p style={{ margin: 0, color: error ? '#b91c1c' : 'var(--dsw-alias-label-secondary, #52525b)', whiteSpace: 'pre-wrap', overflowWrap: 'anywhere', fontSize: 12, lineHeight: 1.55 }}>
          {presentation.detail}
        </p>
      )}
      {running ? (
        <progress
          aria-label="OpenGUI 正在处理任务"
          style={{ width: '100%', height: 3, border: 0, accentColor: '#d9a900' }}
        />
      ) : null}
    </section>
  )
}
