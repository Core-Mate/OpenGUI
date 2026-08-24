import { useCallback, useEffect, useState } from 'react'
import type { CSSProperties } from 'react'
import {
  DEVICE_SELECTION_PATH, MIRROR_START_PATH, MIRROR_STATUS_PATH, MIRROR_STOP_PATH,
} from '../mirror-contract.ts'
import type { MirrorDeviceStatus, MirrorStatus } from '../mirror-contract.ts'
import { OpenGuiMark } from './OpenGuiMark.tsx'

const dockStyle: CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 8,
  width: '100%',
  maxWidth: 'var(--dsh-chat-content-width)',
  margin: '0 auto',
  padding: '8px var(--dsh-composer-side-clearance) 0',
  boxSizing: 'border-box',
  fontFamily: 'inherit',
}

const rowStyle: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  flexWrap: 'wrap',
  gap: 8,
}

const brandStyle: CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  gap: 6,
  minHeight: 26,
  color: 'var(--dsw-alias-label-primary, #27272a)',
  fontSize: 13,
  fontWeight: 650,
}

const deviceStyle: CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  gap: 3,
  minHeight: 34,
  padding: '0 4px 0 10px',
  border: '1px solid var(--dsw-alias-border-l2, rgba(128, 128, 128, 0.35))',
  borderRadius: 999,
  color: 'var(--dsw-alias-label-primary, #27272a)',
  background: 'var(--dsw-alias-bg-layer-1, rgba(255, 255, 255, 0.72))',
  fontSize: 13,
  userSelect: 'none',
}

const selectLabelStyle: CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  gap: 7,
  cursor: 'pointer',
}

const eyeButtonStyle: CSSProperties = {
  display: 'inline-grid',
  placeItems: 'center',
  width: 30,
  height: 30,
  padding: 0,
  border: 0,
  borderRadius: 999,
  background: 'transparent',
  color: 'var(--dsw-alias-label-secondary, #52525b)',
  cursor: 'pointer',
  fontFamily: 'inherit',
}

const progressStyle: CSSProperties = {
  fontSize: 13,
  color: 'var(--dsw-alias-label-secondary, #52525b)',
}

const messageStyle: CSSProperties = {
  minWidth: 0,
  color: 'var(--dsw-alias-label-secondary, #52525b)',
  fontSize: 12,
  lineHeight: 1.45,
  overflowWrap: 'anywhere',
}

export function mirrorLabel(device: MirrorDeviceStatus): string {
  switch (device.phase) {
    case 'downloading': {
      const percent = device.downloadedBytes !== undefined && device.totalBytes
        ? Math.min(100, Math.round((device.downloadedBytes / device.totalBytes) * 100))
        : undefined
      return percent === undefined
        ? `取消打开 ${device.label} 独立窗口（正在下载 scrcpy）`
        : `取消打开 ${device.label} 独立窗口（正在下载 scrcpy ${percent}%）`
    }
    case 'extracting': return `取消打开 ${device.label} 独立窗口（准备中）`
    case 'launching': return `取消打开 ${device.label} 独立窗口（正在打开）`
    case 'running': return `关闭 ${device.label} 独立窗口`
    case 'unsupported': return `${device.label}：电脑不受支持`
    case 'error': return `重试打开 ${device.label} 独立窗口`
    case 'idle': return `在独立窗口查看 ${device.label}`
  }
}

export function mirrorProgress(device: MirrorDeviceStatus): string | undefined {
  if (device.phase === 'downloading') {
    return device.downloadedBytes !== undefined && device.totalBytes
      ? `${Math.min(100, Math.round((device.downloadedBytes / device.totalBytes) * 100))}%`
      : '下载…'
  }
  if (device.phase === 'extracting') return '准备…'
  if (device.phase === 'launching') return '打开…'
  return undefined
}

function WindowIcon({ active }: { active: boolean }): JSX.Element {
  return (
    <svg aria-hidden="true" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="5" width="14" height="14" rx="2" fill={active ? 'currentColor' : 'none'} fillOpacity={active ? 0.12 : 0} />
      <path d="M14 3h7v7M21 3l-9 9" />
    </svg>
  )
}

export function mirrorBusy(device: MirrorDeviceStatus): boolean {
  return device.phase === 'downloading' || device.phase === 'extracting' || device.phase === 'launching'
}

export async function readMirrorStatus(signal?: AbortSignal): Promise<MirrorStatus> {
  const response = await fetch(MIRROR_STATUS_PATH, { cache: 'no-store', ...(signal === undefined ? {} : { signal }) })
  if (!response.ok) throw new Error(`手机状态请求失败 (${response.status})`)
  return await response.json() as MirrorStatus
}

export async function postMirrorStatus(path: string, deviceIds: readonly string[]): Promise<MirrorStatus> {
  const response = await fetch(path, {
    method: 'POST',
    headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
    body: JSON.stringify({ deviceIds }),
  })
  const value = await response.json() as MirrorStatus | { error?: string }
  if (!response.ok) throw new Error('error' in value ? value.error : `手机请求失败 (${response.status})`)
  return value as MirrorStatus
}

export function MirrorButton(): JSX.Element | null {
  const [status, setStatus] = useState<MirrorStatus | undefined>()
  const [requestError, setRequestError] = useState<string | undefined>()
  const [pending, setPending] = useState(false)

  useEffect(() => {
    const controller = new AbortController()
    let timer: ReturnType<typeof setTimeout> | undefined
    const poll = async (): Promise<void> => {
      try {
        setStatus(await readMirrorStatus(controller.signal))
        setRequestError(undefined)
      } catch (error) {
        if (!controller.signal.aborted) setRequestError(error instanceof Error ? error.message : String(error))
      } finally {
        if (!controller.signal.aborted) timer = setTimeout(poll, document.hidden ? 5_000 : 1_500)
      }
    }
    void poll()
    return () => {
      controller.abort()
      if (timer !== undefined) clearTimeout(timer)
    }
  }, [])

  const mutate = useCallback(async (path: string, deviceIds: readonly string[]): Promise<void> => {
    try {
      setPending(true)
      setRequestError(undefined)
      setStatus(await postMirrorStatus(path, deviceIds))
    } catch (error) {
      setRequestError(error instanceof Error ? error.message : String(error))
    } finally {
      setPending(false)
    }
  }, [])

  if (status === undefined) return requestError === undefined ? null : (
    <div style={dockStyle} data-coremate-mobile><div role="status" style={messageStyle}>{requestError}</div></div>
  )

  const selectedIds = status.devices.filter(device => device.selected).map(device => device.id)
  return (
    <div style={dockStyle} data-coremate-mobile>
      <div style={rowStyle} aria-label="OpenGUI 手机选择">
        <span style={brandStyle} aria-label="OpenGUI">
          <OpenGuiMark />
        </span>
        <span style={messageStyle}>操作手机</span>
        {status.devices.length === 0
          ? <span style={messageStyle}>未检测到已授权的 Android 手机</span>
          : status.devices.map(device => {
            const busy = mirrorBusy(device)
            const mirrorActive = busy || device.phase === 'running'
            const mirrorDisabled = pending || device.phase === 'unsupported' || (!device.connected && !mirrorActive)
            const progress = mirrorProgress(device)
            return (
            <div
              key={device.id}
              style={{ ...deviceStyle, opacity: device.connected ? 1 : 0.6 }}
            >
              <label
                style={{ ...selectLabelStyle, cursor: status.selectionLocked || pending ? 'not-allowed' : 'pointer' }}
                title={status.selectionLocked ? 'OpenGUI 已锁定本次任务的设备选择' : `选择 ${device.label} 进行操作`}
              >
                <input
                  type="checkbox"
                  checked={device.selected}
                  disabled={status.selectionLocked || pending || !device.connected}
                  onChange={() => {
                    const next = device.selected
                      ? selectedIds.filter(id => id !== device.id)
                      : [...selectedIds, device.id]
                    void mutate(DEVICE_SELECTION_PATH, next)
                  }}
                />
                <span>{device.label}</span>
              </label>
              {progress === undefined ? null : <span style={progressStyle}>{progress}</span>}
              <button
                type="button"
                data-coremate-mirror
                style={{
                  ...eyeButtonStyle,
                  cursor: mirrorDisabled ? 'not-allowed' : 'pointer',
                  opacity: mirrorDisabled ? 0.55 : 1,
                  color: mirrorActive ? 'var(--dsw-alias-color-primary, #2563eb)' : eyeButtonStyle.color,
                  background: mirrorActive ? 'rgba(37, 99, 235, 0.1)' : 'transparent',
                }}
                disabled={mirrorDisabled}
                aria-busy={busy}
                aria-label={mirrorLabel(device)}
                title={`${mirrorLabel(device)}；独立窗口将在运行 Harness 的电脑上打开（${status.hostPlatform}）`}
                onClick={() => { void mutate(mirrorActive ? MIRROR_STOP_PATH : MIRROR_START_PATH, [device.id]) }}
              >
                <WindowIcon active={mirrorActive} />
              </button>
            </div>
            )
          })}
        {status.taskPhase === 'waiting-for-device' ? <span style={messageStyle}>任务已暂停，等待手机连接</span> : null}
        {status.selectionLocked ? <span style={messageStyle}>任务运行中，选择已锁定</span> : null}
      </div>

      {requestError === undefined && status.devices.every(device => device.message === undefined) ? null : (
        <div role="status" style={messageStyle}>
          {requestError ?? status.devices.map(device => device.message).filter(Boolean).join('；')}
        </div>
      )}
    </div>
  )
}
