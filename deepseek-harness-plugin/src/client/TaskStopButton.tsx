import { useCallback, useState } from 'react'
import type { CSSProperties } from 'react'
import { coremateTaskStatusStore, useCoremateTaskStatus } from './task-status-store.ts'

const buttonStyle: CSSProperties = {
  width: 30,
  height: 30,
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  flex: '0 0 auto',
  padding: 0,
  border: '1px solid var(--dsw-alias-border-l2, rgba(128, 128, 128, 0.35))',
  borderRadius: 999,
  color: 'var(--dsw-alias-label-on-color, #fff)',
  background: 'var(--dsw-alias-button-floating-fill, rgba(30, 30, 32, 0.94))',
  cursor: 'pointer',
  fontFamily: 'inherit',
}

const squareStyle: CSSProperties = {
  width: 9,
  height: 9,
  borderRadius: 2,
  background: '#dc2626',
}

/** Stop the active OpenGUI phone or browser task from the composer's right tool row. */
export function TaskStopButton({ coremateSessionId }: { readonly coremateSessionId?: string }): JSX.Element | null {
  const { task } = useCoremateTaskStatus()
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<string | undefined>()

  const stop = useCallback(async (): Promise<void> => {
    setPending(true)
    setError(undefined)
    try {
      await coremateTaskStatusStore.stop()
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : String(reason))
    } finally {
      setPending(false)
    }
  }, [])

  if (!task.active || (task.ownerSessionId !== undefined && task.ownerSessionId !== coremateSessionId)) return null
  const stopping = pending || task.phase === 'stopping'
  return (
    <button
      type="button"
      style={{ ...buttonStyle, cursor: stopping ? 'wait' : 'pointer', opacity: stopping ? 0.65 : 1 }}
      disabled={stopping}
      aria-label={error ?? (stopping ? '正在停止 OpenGUI 操作' : '停止 OpenGUI 操作')}
      title={error ?? (stopping ? '正在停止 OpenGUI 操作…' : '停止 OpenGUI 操作')}
      onClick={() => { void stop() }}
    >
      <span style={squareStyle} aria-hidden="true" />
    </button>
  )
}
