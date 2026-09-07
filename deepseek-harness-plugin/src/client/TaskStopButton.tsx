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

const errorStyle: CSSProperties = {
  maxWidth: 220,
  color: 'var(--dsw-alias-label-error, #b91c1c)',
  fontSize: 11,
  lineHeight: 1.3,
  overflowWrap: 'anywhere',
}

/** Stop the active OpenGUI phone or browser task from the composer's right tool row. */
export function TaskStopButton({ coremateSessionId }: { readonly coremateSessionId?: string }): JSX.Element | null {
  const { task } = useCoremateTaskStatus(coremateSessionId)
  const [pendingTasks, setPendingTasks] = useState(() => new Map<string, string>())
  const [errors, setErrors] = useState(() => new Map<string, { taskId: string, message: string }>())

  const stop = useCallback(async (): Promise<void> => {
    const sessionId = coremateSessionId
    const taskId = task.taskId
    if (!sessionId || !taskId) return
    setPendingTasks(current => new Map(current).set(sessionId, taskId))
    setErrors(current => {
      const next = new Map(current)
      next.delete(sessionId)
      return next
    })
    try {
      await coremateTaskStatusStore.stop(sessionId, taskId)
    } catch (reason) {
      setErrors(current => new Map(current).set(sessionId, {
        taskId,
        message: reason instanceof Error ? reason.message : String(reason),
      }))
    } finally {
      setPendingTasks(current => {
        if (current.get(sessionId) !== taskId) return current
        const next = new Map(current)
        next.delete(sessionId)
        return next
      })
    }
  }, [coremateSessionId, task.taskId])

  if (!coremateSessionId || !task.active || !task.taskId) return null
  const pending = pendingTasks.get(coremateSessionId) === task.taskId
  const failure = errors.get(coremateSessionId)
  const error = failure?.taskId === task.taskId ? failure.message : undefined
  const stopping = pending || task.phase === 'stopping'
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
      {error === undefined ? null : <span role="alert" style={errorStyle}>{error}</span>}
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
    </span>
  )
}
