import { useCallback, useEffect, useState } from 'react'
import type { CSSProperties } from 'react'
import {
  PLUGIN_UPDATE_CHECK_PATH,
  PLUGIN_UPDATE_INSTALL_PATH,
  PLUGIN_UPDATE_STATUS_PATH,
} from '../mirror-contract.ts'
import type { PluginUpdateStatus } from '../mirror-contract.ts'

const ACTIVE_PHASES = new Set<PluginUpdateStatus['phase']>(['checking', 'downloading', 'verifying', 'installing'])

const panelStyle: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  flexWrap: 'wrap',
  gap: 14,
  marginBottom: 16,
  padding: '14px 16px',
  border: '1px solid color-mix(in srgb, #d9a900 48%, transparent)',
  borderRadius: 10,
  color: 'var(--dsw-alias-label-primary, #27272a)',
  background: 'color-mix(in srgb, #f1bf1f 9%, var(--dsw-alias-bg-layer-1, #fff))',
  boxSizing: 'border-box',
}

const buttonStyle: CSSProperties = {
  minHeight: 40,
  padding: '0 16px',
  border: 0,
  borderRadius: 7,
  color: '#171717',
  background: '#f1bf1f',
  font: 'inherit',
  fontSize: 13,
  fontWeight: 750,
  cursor: 'pointer',
}

export type PluginUpdatePresentation =
  | { readonly kind: 'hidden' }
  | { readonly kind: 'available', readonly title: string }
  | { readonly kind: 'progress', readonly title: string, readonly percent?: number }
  | { readonly kind: 'restart', readonly title: string }
  | { readonly kind: 'error', readonly title: string }

export function pluginUpdatePresentation(status?: PluginUpdateStatus, showTransient = false): PluginUpdatePresentation {
  if (status === undefined) return { kind: 'hidden' }
  switch (status.phase) {
    case 'idle':
    case 'up-to-date': return { kind: 'hidden' }
    case 'checking': return showTransient ? { kind: 'progress', title: '正在检查 OpenGUI 更新…' } : { kind: 'hidden' }
    case 'available': return { kind: 'available', title: `OpenGUI v${status.latestVersion ?? ''} 可用` }
    case 'downloading': {
      const percent = status.downloadedBytes !== undefined && status.totalBytes !== undefined && status.totalBytes > 0
        ? Math.min(100, Math.max(0, Math.floor(status.downloadedBytes / status.totalBytes * 100)))
        : undefined
      return {
        kind: 'progress',
        title: percent === undefined ? '正在下载 OpenGUI 更新…' : `正在下载 OpenGUI 更新：${percent}%`,
        ...(percent === undefined ? {} : { percent }),
      }
    }
    case 'verifying': return { kind: 'progress', title: '正在校验 OpenGUI 更新…' }
    case 'installing': return { kind: 'progress', title: '正在安装 OpenGUI 更新…' }
    case 'restart-required': return { kind: 'restart', title: `OpenGUI v${status.latestVersion ?? ''} 已安装` }
    case 'error': return showTransient ? { kind: 'error', title: status.message ?? 'OpenGUI 更新失败' } : { kind: 'hidden' }
  }
}

async function readStatus(signal?: AbortSignal): Promise<PluginUpdateStatus> {
  const response = await fetch(PLUGIN_UPDATE_STATUS_PATH, {
    headers: { Accept: 'application/json' },
    ...(signal === undefined ? {} : { signal }),
  })
  if (!response.ok) throw new Error(`读取更新状态失败（HTTP ${response.status}）`)
  return response.json() as Promise<PluginUpdateStatus>
}

async function mutate(path: string): Promise<PluginUpdateStatus> {
  const response = await fetch(path, { method: 'POST', headers: { Accept: 'application/json' } })
  const body = await response.json().catch(() => ({})) as { error?: unknown } & Partial<PluginUpdateStatus>
  if (!response.ok) {
    const message = body.error === 'stop_the_active_opengui_task_before_updating'
      ? '请先停止正在执行的 OpenGUI 任务，再进行更新。'
      : body.error === 'no_plugin_update_available'
        ? '当前没有可安装的 OpenGUI 更新，请重新检查。'
        : typeof body.error === 'string' ? body.error : `更新请求失败（HTTP ${response.status}）`
    throw new Error(message)
  }
  return body as PluginUpdateStatus
}

export function PluginUpdatePrompt(): JSX.Element | null {
  const [status, setStatus] = useState<PluginUpdateStatus>()
  const [actionStarted, setActionStarted] = useState(false)
  const [requestError, setRequestError] = useState<string>()
  const [refreshKey, setRefreshKey] = useState(0)

  useEffect(() => {
    const controller = new AbortController()
    let timer: ReturnType<typeof setTimeout> | undefined
    const poll = async (): Promise<void> => {
      try {
        const next = await readStatus(controller.signal)
        setStatus(next)
        if (!controller.signal.aborted) timer = setTimeout(poll, ACTIVE_PHASES.has(next.phase) ? 1_000 : 30_000)
      } catch {
        if (!controller.signal.aborted) timer = setTimeout(poll, 30_000)
      }
    }
    void poll()
    return () => {
      controller.abort()
      if (timer !== undefined) clearTimeout(timer)
    }
  }, [refreshKey])

  const request = useCallback(async (path: string): Promise<void> => {
    setActionStarted(true)
    setRequestError(undefined)
    try {
      setStatus(await mutate(path))
      setRefreshKey(value => value + 1)
    } catch (error) {
      setRequestError(error instanceof Error ? error.message : String(error))
    }
  }, [])

  const presentation = requestError === undefined
    ? pluginUpdatePresentation(status, actionStarted)
    : { kind: 'error' as const, title: requestError }
  if (presentation.kind === 'hidden') return null

  const progress = presentation.kind === 'progress' ? presentation.percent : undefined
  return (
    <section style={panelStyle} role={presentation.kind === 'error' ? 'alert' : 'status'} data-coremate-plugin-update={presentation.kind}>
      <div style={{ flex: '1 1 320px', minWidth: 0 }}>
        <div style={{ fontSize: 14, fontWeight: 760 }}>{presentation.title}</div>
        <p style={{ margin: '5px 0 0', color: 'var(--dsw-alias-label-secondary, #52525b)', fontSize: 12, lineHeight: 1.55 }}>
          {presentation.kind === 'available'
            ? `当前版本 v${status?.currentVersion}。更新包会从公开的 OpenGUI GitHub Release 下载并校验 SHA-256。`
            : presentation.kind === 'restart'
              ? (status?.message ?? '重启 Harness 后载入新版本。')
              : presentation.kind === 'error'
                ? '当前运行中的版本未改变，可以重试或稍后再更新。'
                : '请保持 Harness 运行，完成后会提示重启。'}
        </p>
        {progress === undefined ? null : (
          <div aria-label={`更新进度 ${progress}%`} style={{ width: 'min(360px, 100%)', height: 4, marginTop: 10, overflow: 'hidden', borderRadius: 999, background: 'rgba(128,128,128,.2)' }}>
            <div style={{ width: `${progress}%`, height: '100%', background: '#d9a900', transition: 'width 160ms ease-out' }} />
          </div>
        )}
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        {presentation.kind === 'available' && status?.releaseUrl !== undefined
          ? <a href={status.releaseUrl} target="_blank" rel="noreferrer" style={{ color: 'inherit', fontSize: 12 }}>版本说明 ↗</a>
          : null}
        {presentation.kind === 'available'
          ? <button data-coremate-press type="button" style={buttonStyle} onClick={() => { void request(PLUGIN_UPDATE_INSTALL_PATH) }}>更新</button>
          : presentation.kind === 'error'
            ? <button data-coremate-press type="button" style={{ ...buttonStyle, background: 'var(--dsw-alias-bg-layer-2, #f4f4f5)' }} onClick={() => { void request(PLUGIN_UPDATE_CHECK_PATH) }}>重新检查</button>
            : null}
      </div>
    </section>
  )
}
