import { useCallback, useEffect, useState } from 'react'
import type { CSSProperties } from 'react'
import {
  BROWSER_INSTALL_APPROVE_PATH,
  BROWSER_INSTALL_DECLINE_PATH,
  BROWSER_INSTALL_STATUS_PATH,
} from '../mirror-contract.ts'
import type { BrowserInstallStatus } from '../mirror-contract.ts'

const panelStyle: CSSProperties = {
  width: '100%',
  marginBottom: 24,
  padding: 14,
  border: '1px solid var(--dsw-alias-border-l2, rgba(128, 128, 128, 0.35))',
  borderRadius: 12,
  color: 'var(--dsw-alias-label-primary, inherit)',
  background: 'var(--dsw-alias-bg-layer-1, #fff)',
  boxShadow: '0 1px 3px rgba(39, 39, 42, 0.12)',
  fontSize: 13,
  boxSizing: 'border-box',
}

const actionStyle: CSSProperties = {
  minHeight: 36,
  padding: '0 12px',
  border: '1px solid var(--dsw-alias-border-l2, rgba(128, 128, 128, 0.35))',
  borderRadius: 8,
  color: 'var(--dsw-alias-label-primary, inherit)',
  background: 'transparent',
  cursor: 'pointer',
  fontFamily: 'inherit',
  fontWeight: 650,
}

const progressTrackStyle: CSSProperties = {
  height: 6,
  marginTop: 10,
  overflow: 'hidden',
  borderRadius: 999,
  background: 'var(--dsw-alias-bg-layer-2, rgba(128, 128, 128, 0.16))',
}

export async function readBrowserInstallStatus(signal?: AbortSignal): Promise<BrowserInstallStatus> {
  const response = await fetch(BROWSER_INSTALL_STATUS_PATH, {
    cache: 'no-store',
    ...(signal === undefined ? {} : { signal }),
  })
  if (!response.ok) throw new Error(`浏览器安装状态请求失败 (${response.status})`)
  return await response.json() as BrowserInstallStatus
}

function megabytes(bytes?: number): string {
  return bytes === undefined ? '' : `${Math.ceil(bytes / 1024 / 1024)} MB`
}

export type BrowserInstallPresentation = {
  kind: 'hidden' | 'confirmation' | 'progress' | 'error'
  label?: string
  percent?: number
}

export function browserInstallPresentation(status?: BrowserInstallStatus): BrowserInstallPresentation {
  if (status === undefined) return { kind: 'hidden' }
  if (status.phase === 'awaiting-confirmation') return { kind: 'confirmation' }
  if (status.phase === 'extracting') return { kind: 'progress', label: '正在解压托管浏览器…' }
  if (status.phase === 'downloading') {
    const percent = status.downloadedBytes !== undefined && status.totalBytes !== undefined
      ? Math.min(100, Math.floor(status.downloadedBytes / status.totalBytes * 100))
      : undefined
    return {
      kind: 'progress',
      label: percent === undefined ? '正在下载托管浏览器…' : `正在下载托管浏览器：${percent}%`,
      ...(percent === undefined ? {} : { percent }),
    }
  }
  if (status.phase === 'error') return { kind: 'error', label: status.message ?? '托管浏览器安装失败，请重新提交任务。' }
  return { kind: 'hidden' }
}

/** Inline first-use consent and progress for the plugin-managed browser. */
export function BrowserInstallPrompt(): JSX.Element | null {
  const [status, setStatus] = useState<BrowserInstallStatus>()
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<string>()

  useEffect(() => {
    const controller = new AbortController()
    let timer: ReturnType<typeof setTimeout> | undefined
    const poll = async (): Promise<void> => {
      try {
        setStatus(await readBrowserInstallStatus(controller.signal))
      } catch {
        // The Host route is optional; an absent route leaves this control hidden.
      } finally {
        if (!controller.signal.aborted) timer = setTimeout(poll, document.hidden ? 5_000 : 750)
      }
    }
    void poll()
    return () => {
      controller.abort()
      if (timer !== undefined) clearTimeout(timer)
    }
  }, [])

  const decide = useCallback(async (approve: boolean): Promise<void> => {
    setPending(true)
    setError(undefined)
    try {
      const response = await fetch(approve ? BROWSER_INSTALL_APPROVE_PATH : BROWSER_INSTALL_DECLINE_PATH, {
        method: 'POST',
        headers: { Accept: 'application/json' },
      })
      if (!response.ok && response.status !== 409) throw new Error(`浏览器安装操作失败 (${response.status})`)
      setStatus(await readBrowserInstallStatus())
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : String(reason))
    } finally {
      setPending(false)
    }
  }, [])

  const presentation = browserInstallPresentation(status)
  if (presentation.kind === 'hidden') return null
  if (presentation.kind === 'confirmation' && status !== undefined) {
    return (
      <section style={panelStyle} role="alert" data-coremate-browser-install="awaiting-confirmation">
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12 }}>
          <div style={{ flex: '1 1 260px', minWidth: 0 }}>
            <strong style={{ display: 'block', marginBottom: 4, fontSize: 14 }}>启用托管浏览器</strong>
            <span style={{ color: 'var(--dsw-alias-label-secondary, #52525b)', lineHeight: 1.6 }}>
              浏览器任务需要安装 Chromium {status.version}（{megabytes(status.totalBytes)}）。
              {error === undefined ? '' : ` ${error}`}
            </span>
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button data-coremate-press type="button" style={actionStyle} disabled={pending} onClick={() => { void decide(false) }}>取消任务</button>
            <button
              data-coremate-press
              type="button"
              style={{ ...actionStyle, color: '#171717', borderColor: '#d9a900', background: '#f1bf1f' }}
              disabled={pending}
              onClick={() => { void decide(true) }}
            >
              安装浏览器
            </button>
          </div>
        </div>
      </section>
    )
  }
  if (presentation.kind === 'error') {
    return (
      <section style={{ ...panelStyle, borderColor: 'rgba(185, 28, 28, 0.35)' }} role="alert" data-coremate-browser-install="error">
        <strong style={{ display: 'block', marginBottom: 4 }}>托管浏览器安装失败</strong>
        <span style={{ color: '#b91c1c', lineHeight: 1.6 }}>{presentation.label}</span>
      </section>
    )
  }
  return (
    <section style={panelStyle} role="status" data-coremate-browser-install="progress">
      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 12 }}>
        <strong>{presentation.label}</strong>
        {presentation.percent === undefined ? null : <span style={{ color: 'var(--dsw-alias-label-secondary, #52525b)', fontVariantNumeric: 'tabular-nums' }}>{presentation.percent}%</span>}
      </div>
      <div style={progressTrackStyle} aria-hidden="true">
        <div
          style={{
            width: '100%',
            height: '100%',
            borderRadius: 'inherit',
            background: '#f1bf1f',
            transform: `scaleX(${(presentation.percent ?? 18) / 100})`,
            transformOrigin: 'left center',
            transition: 'transform 180ms ease-out',
          }}
        />
      </div>
    </section>
  )
}
