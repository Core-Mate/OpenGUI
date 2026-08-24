import { useEffect, useState } from 'react'
import type { CSSProperties } from 'react'
import type { ISessions } from '@deepseek-ai/dsh-client-runtime/client'
import { readBrowserInstallStatus } from './BrowserInstallPrompt.tsx'
import { useCoremateTaskStatus } from './task-status-store.ts'

const noticeStyle: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  gap: 12,
  width: '100%',
  maxWidth: 'var(--dsh-chat-content-width)',
  margin: '0 auto',
  padding: '7px var(--dsh-composer-side-clearance) 0',
  color: 'var(--dsw-alias-label-secondary, #52525b)',
  fontSize: 12,
  boxSizing: 'border-box',
}

export interface CoremateTaskNoticeProps {
  readonly coremateSessionId?: string
  readonly coremateSessions?: ISessions
}

export function CoremateTaskNotice({ coremateSessionId, coremateSessions }: CoremateTaskNoticeProps): JSX.Element | null {
  const { task, launching, launchError, bridgeError } = useCoremateTaskStatus()
  const elsewhere = task.active && task.ownerSessionId !== undefined && task.ownerSessionId !== coremateSessionId
  const [browserApproval, setBrowserApproval] = useState(false)

  useEffect(() => {
    if (!task.active || elsewhere) {
      setBrowserApproval(false)
      return
    }
    const controller = new AbortController()
    let timer: ReturnType<typeof setTimeout> | undefined
    const poll = async (): Promise<void> => {
      try {
        const status = await readBrowserInstallStatus(controller.signal)
        setBrowserApproval(status.phase === 'awaiting-confirmation')
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
  }, [elsewhere, task.active])

  const message = launchError ?? bridgeError ?? (elsewhere
    ? 'OpenGUI 正在另一会话执行'
    : browserApproval
      ? 'OpenGUI 需要确认浏览器安装，请前往 OpenGUI Tab。'
      : launching ? '正在启动 OpenGUI…' : undefined)
  if (message === undefined) return null
  return (
    <div role="status" style={noticeStyle} data-coremate-task-notice>
      <span>{message}</span>
      {!elsewhere || coremateSessions === undefined ? null : (
        <button type="button" onClick={() => coremateSessions.open(task.ownerSessionId as never)} style={{ minHeight: 32, padding: '0 10px', border: '1px solid var(--dsw-alias-border-l2, rgba(128,128,128,.35))', borderRadius: 8, color: 'inherit', background: 'transparent', font: 'inherit', fontWeight: 650, cursor: 'pointer' }}>返回任务</button>
      )}
    </div>
  )
}
