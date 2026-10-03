import { useEffect, useRef, useState } from 'react'
import type { ISessions, SessionId } from '@deepseek-ai/dsh-client-runtime/client'
import { executePhoneHandoff, phoneTaskHandoff, phoneWorkbenchRoute, phoneWorkbenchView, type PhoneTaskHandoff } from './phone-workbench-bridge.ts'

/** A native DSH panel mounts the same authenticated workbench as other hosts. */
export function PhoneWorkbench({ sessionId, sessions }: { sessionId?: string | undefined; sessions?: ISessions | undefined }): JSX.Element {
  const view = phoneWorkbenchView(sessionId)
  const generation = useRef(0)
  const [url, setUrl] = useState<string>()
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const frame = useRef<HTMLIFrameElement>(null)
  const claimed = useRef(new Set<string>())
  const [retryTask, setRetryTask] = useState<PhoneTaskHandoff>()
  const handoff = async (request: PhoneTaskHandoff) => {
    const { taskId } = request
    const key = sessionId + ':' + request.key
    if (claimed.current.has(key)) return
    claimed.current.add(key)
    setError(''); setRetryTask(undefined)
    try {
      const binding = sessionId ? sessions?.binding(sessionId as SessionId) : undefined
      if (!binding) throw new Error('当前宿主会话不可用')
      const result = await executePhoneHandoff(binding.session, taskId)
      if (result === 'rejected') throw new Error('宿主未接手')
      if (result === 'unknown') setError('宿主接手结果尚未确认。请查看宿主会话和任务进度；系统不会自动重复提交。')
    } catch {
      claimed.current.delete(key)
      setRetryTask(request)
      setError('宿主尚未接手。请保持当前会话可用后重试；任务不会重复创建。')
    }
  }
  useEffect(() => {
    if (!url) return
    const receive = (event: MessageEvent) => {
      const route = phoneWorkbenchRoute(event, new URL(url).origin, frame.current?.contentWindow)
      if (route) view.route = route
      const request = phoneTaskHandoff(event, new URL(url).origin, frame.current?.contentWindow)
      if (request) void handoff(request)
    }
    window.addEventListener('message', receive)
    return () => window.removeEventListener('message', receive)
  }, [url, sessionId, sessions])
  const open = async () => {
    if (!sessionId) { setError('请先打开一个宿主会话。'); return }
    const current = ++generation.current
    setLoading(true); setError('')
    try {
      const response = await fetch('/api/opengui/phone-workbench', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ sessionId }) })
      const value = await response.json() as { url?: string }
      if (!response.ok || !value.url) throw new Error('手机工作台启动失败')
      const parsed = new URL(value.url)
      if (parsed.protocol !== 'http:' || parsed.hostname !== '127.0.0.1') throw new Error('无效工作台地址')
      if (current !== generation.current) return
      view.opened = true
      parsed.hash = view.route
      setUrl(parsed.href)
    } catch { if (current === generation.current) setError('手机工作台暂时不可用，请重试。') } finally { if (current === generation.current) setLoading(false) }
  }
  useEffect(() => {
    if (view.opened) void open()
    return () => { generation.current++ }
  }, [sessionId])
  return <section aria-label="宿主手机任务">
    {url ? <iframe ref={frame} src={url} title="OpenGUI 手机任务工作台" style={{ width: '100%', height: '80vh', border: 0, borderRadius: 10 }} />
      : <button type="button" disabled={loading} onClick={() => void open()} style={{ padding: '12px 18px', marginBottom: 16 }}>{loading ? '正在打开…' : '打开手机任务工作台'}</button>}
    {error && <p role="alert">{error}</p>}
    {retryTask && <button type="button" onClick={() => void handoff(retryTask)}>重试宿主接手</button>}
  </section>
}
