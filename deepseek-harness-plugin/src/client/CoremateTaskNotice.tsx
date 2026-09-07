import { useEffect, useState } from 'react'
import type { CSSProperties } from 'react'
import { readBrowserInstallStatus } from './BrowserInstallPrompt.tsx'
import { useCoremateTaskStatus } from './task-status-store.ts'

const noticeStyle: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  gap: 12,
  width: '100%',
  maxWidth: 'var(--dsh-chat-content-width)',
  margin: '8px auto 0',
  padding: '9px 12px',
  border: '1px solid color-mix(in srgb, #f1bf1f 34%, var(--dsw-alias-border-l2, #d4d4d8))',
  borderRadius: 10,
  color: 'var(--dsw-alias-label-primary, #27272a)',
  background: 'color-mix(in srgb, #f1bf1f 9%, var(--dsw-alias-bg-layer-1, #fff))',
  boxShadow: '0 1px 3px rgba(39, 39, 42, 0.08)',
  fontSize: 12,
  fontWeight: 650,
  boxSizing: 'border-box',
}

export interface CoremateTaskNoticeProps {
  readonly coremateSessionId?: string
}

export function CoremateTaskNotice({ coremateSessionId }: CoremateTaskNoticeProps): JSX.Element | null {
  const { task, launching, launchError, bridgeError } = useCoremateTaskStatus(coremateSessionId)
  const [approval, setApproval] = useState<{ sessionId: string, taskId: string }>()

  useEffect(() => {
    if (!coremateSessionId || !task.active || !task.taskId) {
      setApproval(undefined)
      return
    }
    const controller = new AbortController()
    let timer: ReturnType<typeof setTimeout> | undefined
    const poll = async (): Promise<void> => {
      try {
        const status = await readBrowserInstallStatus(coremateSessionId, controller.signal)
        if (controller.signal.aborted) return
        setApproval(status.phase === 'awaiting-confirmation' &&
          status.owner?.sessionId === coremateSessionId &&
          status.owner.taskId === task.taskId
          ? { sessionId: coremateSessionId, taskId: task.taskId }
          : undefined)
      } catch {
        // The optional Host route must not replace the existing task notice.
      } finally {
        if (!controller.signal.aborted) timer = setTimeout(poll, document.hidden ? 5_000 : 1_000)
      }
    }
    void poll()
    return () => {
      controller.abort()
      if (timer !== undefined) clearTimeout(timer)
    }
  }, [coremateSessionId, task.active, task.taskId])

  const browserApproval = approval !== undefined && approval.sessionId === coremateSessionId && approval.taskId === task.taskId
  const message = launchError ?? bridgeError ?? (browserApproval
      ? 'OpenGUI 需要确认浏览器安装，请前往 OpenGUI Tab。'
      : launching ? 'OpenGUI 已接收任务，正在启动…' : undefined)
  if (message === undefined) return null
  return (
    <div role="status" style={noticeStyle} data-coremate-task-notice>
      <span>{message}</span>
    </div>
  )
}
