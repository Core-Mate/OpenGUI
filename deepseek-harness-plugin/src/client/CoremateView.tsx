import { useCallback, useEffect, useRef, useState } from 'react'
import type { CSSProperties } from 'react'
import {
  DEVICE_SELECTION_PATH,
  DEVICE_STREAM_STATUS_PATH,
  MIRROR_START_PATH,
  MIRROR_STOP_PATH,
  RUNTIME_INFO_PATH,
} from '../mirror-contract.ts'
import type { MirrorDeviceStatus, MirrorStatus, RuntimeInfo } from '../mirror-contract.ts'
import type { ScrcpyStreamStatus } from '../scrcpy-stream.ts'
import { BrowserInstallPrompt } from './BrowserInstallPrompt.tsx'
import { OpenGuiMark } from './OpenGuiMark.tsx'
import { mirrorBusy, mirrorLabel, mirrorProgress, postMirrorStatus, readMirrorStatus } from './MirrorButton.tsx'
import { TaskStopButton } from './TaskStopButton.tsx'
import { PhoneStream } from './PhoneStream.tsx'
import { PluginUpdatePrompt } from './PluginUpdatePrompt.tsx'
import { WECHAT_GROUP_QR_DATA_URL } from './wechat-group-qr.ts'

const DISCORD_URL = 'https://discord.gg/pqHHw7XgJ3'
const OPENGUI_GITHUB_URL = 'https://github.com/Core-Mate/OpenGUI'
const OPENGUI_WEBSITE_URL = 'https://opengui.ai/'

const rootStyle: CSSProperties = {
  width: '100%',
  margin: 0,
  padding: '16px clamp(16px, 2vw, 32px) 180px',
  boxSizing: 'border-box',
  containerType: 'inline-size',
  color: 'var(--dsw-alias-label-primary, #27272a)',
  fontFamily: '-apple-system, "SF Pro Text", "PingFang SC", "Noto Sans SC", sans-serif',
}

const headerStyle: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  flexWrap: 'wrap',
  gap: 12,
  paddingBottom: 16,
}

const brandStyle: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 8,
  color: 'var(--dsw-alias-label-secondary, #52525b)',
  fontSize: 12,
  fontWeight: 650,
}

const bodyStyle: CSSProperties = {
  margin: 0,
  maxWidth: '64ch',
  color: 'var(--dsw-alias-label-secondary, #52525b)',
  fontSize: 13,
  lineHeight: 1.7,
}

const headerLinkStyle: CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  minHeight: 40,
  padding: '0 6px',
  borderRadius: 6,
  color: 'var(--dsw-alias-label-secondary, #52525b)',
  fontSize: 12,
  fontWeight: 650,
  textDecoration: 'none',
}

const gridStyle: CSSProperties = {
  display: 'grid',
  alignItems: 'stretch',
  justifyContent: 'start',
  gap: 16,
}

const deviceStyle: CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  overflow: 'hidden',
  borderRadius: 10,
  background: 'var(--dsw-alias-bg-layer-1, #fff)',
  boxShadow: '0 1px 3px rgba(39, 39, 42, 0.14)',
}

const deviceHeaderStyle: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  flexWrap: 'wrap',
  gap: 12,
  minHeight: 48,
  padding: '7px 8px 7px 12px',
}

const actionStyle: CSSProperties = {
  minWidth: 40,
  minHeight: 40,
  border: '1px solid var(--dsw-alias-border-l2, rgba(128,128,128,.28))',
  borderRadius: 6,
  color: 'var(--dsw-alias-label-primary, #27272a)',
  background: 'transparent',
  font: 'inherit',
  fontSize: 12,
  fontWeight: 650,
  cursor: 'pointer',
}

const connectStyle: CSSProperties = {
  display: 'grid',
  placeItems: 'center',
  minHeight: 360,
  padding: 24,
  border: '1px dashed color-mix(in srgb, var(--dsw-alias-label-secondary, #52525b) 34%, transparent)',
  borderRadius: 10,
  color: 'var(--dsw-alias-label-primary, #27272a)',
  background: 'color-mix(in srgb, var(--dsw-alias-bg-layer-1, #fff) 72%, transparent)',
  textAlign: 'center',
  boxSizing: 'border-box',
}

const detectionErrorStyle: CSSProperties = {
  display: 'grid',
  gridTemplateColumns: 'auto minmax(0, 1fr) auto',
  alignItems: 'center',
  gap: '6px 10px',
  marginBottom: 16,
  padding: '10px 12px',
  border: '1px solid color-mix(in srgb, #dc2626 28%, transparent)',
  borderRadius: 8,
  color: '#991b1b',
  background: 'color-mix(in srgb, #fee2e2 55%, var(--dsw-alias-bg-layer-1, #fff))',
  fontSize: 12,
  lineHeight: 1.5,
  overflowWrap: 'anywhere',
}

export type DeviceWallItem =
  | { readonly kind: 'device', readonly device: MirrorDeviceStatus }
  | { readonly kind: 'connect-more' }

/** Keep the wall content-driven: every visible device, followed by one connection guide. */
export function buildDeviceWallItems(devices: readonly MirrorDeviceStatus[]): DeviceWallItem[] {
  return [
    ...devices.map(device => ({ kind: 'device' as const, device })),
    { kind: 'connect-more' },
  ]
}

export function runtimeVersionLabel(info?: RuntimeInfo, failed = false): string {
  if (info !== undefined) {
    const dshVersion = info.dshVersion === 'unknown' ? '未知' : info.dshVersion
    const openGuiVersion = info.openGuiVersion === 'unknown' ? '未知' : info.openGuiVersion
    const compatibility = info.dshCompatibility === 'unsupported' ? '（未验证）' : ''
    return `DSH ${dshVersion}${compatibility} · OpenGUI ${openGuiVersion}`
  }
  return failed ? 'DSH 未知 · OpenGUI 未知' : 'DSH … · OpenGUI …'
}

export function runtimeVersionTitle(info?: RuntimeInfo, failed = false): string {
  if (failed) return '版本信息暂时不可用'
  if (info === undefined) return '正在读取当前实际加载的 DSH 与 OpenGUI 版本'
  if (info.dshCompatibility === 'unsupported') {
    return `当前 DSH 未经验证。已支持：${info.supportedDshVersions.join('、')}；推荐：${info.preferredDshVersion}`
  }
  if (info.dshCompatibility === 'unknown') {
    return `无法识别当前 DSH 版本。推荐：${info.preferredDshVersion}`
  }
  return `当前 DSH 已验证；推荐：${info.preferredDshVersion}`
}

function phaseLabel(status: MirrorStatus): string {
  const online = status.devices.filter(device => device.connected).length
  const deviceLabel = `${online} 台设备在线`
  switch (status.taskPhase) {
    case 'waiting-for-device': return `${deviceLabel} · 等待手机`
    case 'routing': return `${deviceLabel} · 正在规划`
    case 'running': return `${deviceLabel} · 正在执行`
    case 'stopping': return `${deviceLabel} · 正在停止`
    case 'idle': return deviceLabel
  }
}

function mirrorActive(device: MirrorDeviceStatus): boolean {
  return ['downloading', 'extracting', 'launching', 'running'].includes(device.phase)
}

export function CoremateView({ coremateSessionId }: { readonly coremateSessionId?: string }): JSX.Element {
  const currentSessionId = useRef(coremateSessionId)
  currentSessionId.current = coremateSessionId
  const sessionGeneration = useRef(0)
  const mutationGeneration = useRef(0)
  const [snapshot, setStatus] = useState<MirrorStatus>()
  const [expanded, setExpanded] = useState<Set<string>>(() => new Set())
  const seenDevices = useRef(new Set<string>())
  const [pendingSessionId, setPendingSessionId] = useState<string>()
  const [failure, setFailure] = useState<{ sessionId: string | undefined, message: string }>()
  const [streamStatus, setStreamStatus] = useState<ScrcpyStreamStatus>()
  const [streamStatusError, setStreamStatusError] = useState<string>()
  const [runtime, setRuntime] = useState<RuntimeInfo>()
  const [runtimeFailed, setRuntimeFailed] = useState(false)
  const status = snapshot?.sessionId === coremateSessionId ? snapshot : undefined
  const pending = coremateSessionId !== undefined && pendingSessionId === coremateSessionId
  const error = failure?.sessionId === coremateSessionId ? failure?.message : undefined

  useEffect(() => {
    const controller = new AbortController()
    void fetch(RUNTIME_INFO_PATH, { cache: 'no-store', signal: controller.signal })
      .then(async response => {
        if (!response.ok) throw new Error(`runtime info unavailable (${response.status})`)
        setRuntime(await response.json() as RuntimeInfo)
        setRuntimeFailed(false)
      })
      .catch(() => { if (!controller.signal.aborted) setRuntimeFailed(true) })
    return () => controller.abort()
  }, [])

  useEffect(() => {
    const generation = ++sessionGeneration.current
    mutationGeneration.current += 1
    setStatus(undefined)
    setExpanded(new Set())
    seenDevices.current.clear()
    setPendingSessionId(undefined)
    setFailure(undefined)
    const controller = new AbortController()
    if (coremateSessionId === undefined) return () => controller.abort()
    let timer: ReturnType<typeof setTimeout> | undefined
    const poll = async (): Promise<void> => {
      try {
        const next = await readMirrorStatus(coremateSessionId, controller.signal)
        if (
          next === undefined ||
          controller.signal.aborted ||
          generation !== sessionGeneration.current ||
          currentSessionId.current !== coremateSessionId
        ) return
        setStatus(next)
        setExpanded(current => {
          const connectedIds = new Set(next.devices.map(device => device.id))
          const value = new Set([...current].filter(id => connectedIds.has(id)))
          seenDevices.current = new Set([...seenDevices.current].filter(id => connectedIds.has(id)))
          for (const device of next.devices) {
            if (seenDevices.current.has(device.id)) continue
            seenDevices.current.add(device.id)
            value.add(device.id)
          }
          return value
        })
        setFailure(undefined)
      } catch (reason) {
        if (
          !controller.signal.aborted &&
          generation === sessionGeneration.current &&
          currentSessionId.current === coremateSessionId
        ) {
          setFailure({ sessionId: coremateSessionId, message: reason instanceof Error ? reason.message : String(reason) })
        }
      } finally {
        if (
          !controller.signal.aborted &&
          generation === sessionGeneration.current &&
          currentSessionId.current === coremateSessionId
        ) {
          timer = setTimeout(poll, document.hidden ? 10_000 : 1_500)
        }
      }
    }
    void poll()
    return () => {
      controller.abort()
      if (timer !== undefined) clearTimeout(timer)
    }
  }, [coremateSessionId])

  useEffect(() => {
    const controller = new AbortController()
    let timer: ReturnType<typeof setTimeout> | undefined
    const poll = async (): Promise<void> => {
      try {
        const response = await fetch(DEVICE_STREAM_STATUS_PATH, { cache: 'no-store', signal: controller.signal })
        if (!response.ok) throw new Error(`实时画面状态不可用 (${response.status})`)
        setStreamStatus(await response.json() as ScrcpyStreamStatus)
        setStreamStatusError(undefined)
      } catch (reason) {
        if (!controller.signal.aborted) {
          setStreamStatus(undefined)
          setStreamStatusError(reason instanceof Error ? reason.message : String(reason))
        }
      }
      finally {
        if (!controller.signal.aborted) timer = setTimeout(poll, document.hidden ? 5_000 : 1_500)
      }
    }
    void poll()
    return () => {
      controller.abort()
      if (timer !== undefined) clearTimeout(timer)
    }
  }, [])

  const mutate = useCallback(async (path: string, ids: readonly string[]): Promise<void> => {
    const sessionId = coremateSessionId
    const generation = ++mutationGeneration.current
    setPendingSessionId(sessionId)
    try {
      if (sessionId === undefined) throw new Error('当前会话不可用，请刷新后重试。')
      const next = await postMirrorStatus(path, sessionId, ids)
      if (next === undefined || generation !== mutationGeneration.current || currentSessionId.current !== sessionId) return
      setStatus(next)
      setFailure(undefined)
    } catch (reason) {
      if (generation === mutationGeneration.current && currentSessionId.current === sessionId) {
        setFailure({ sessionId, message: reason instanceof Error ? reason.message : String(reason) })
      }
    } finally {
      if (generation === mutationGeneration.current && currentSessionId.current === sessionId) setPendingSessionId(undefined)
    }
  }, [coremateSessionId])

  const selected = status?.devices.filter(device => device.selected).map(device => device.id) ?? []
  const wallItems = buildDeviceWallItems(status?.devices ?? [])
  return (
    <main style={rootStyle} lang="zh-CN" data-coremate-view>
      <style>{`
        [data-coremate-press]{transition:transform 120ms cubic-bezier(.16,1,.3,1),background-color 120ms ease-out}
        [data-coremate-press]:active{transform:scale(.96)}
        [data-coremate-press]:focus-visible,[data-coremate-header-link]:focus-visible{outline:2px solid #d9a900;outline-offset:2px}
        @media(hover:hover){[data-coremate-header-link]:hover{color:var(--dsw-alias-label-primary,#27272a);background:var(--dsw-alias-bg-layer-2,rgba(128,128,128,.10))}}
        @media(prefers-reduced-motion:reduce){[data-coremate-press]{transition:none}}
        [data-coremate-device-wall]{grid-template-columns:minmax(0,1fr)}
        [data-coremate-device-card] > [data-coremate-preview]{flex:1 1 auto}
        @container (min-width:560px){[data-coremate-device-wall]{grid-template-columns:repeat(2,minmax(0,1fr))}}
        @container (min-width:840px){[data-coremate-device-wall]{grid-template-columns:repeat(3,minmax(0,1fr))}}
        @container (min-width:1100px){[data-coremate-device-wall]{grid-template-columns:repeat(4,minmax(0,1fr))}}
        @container (min-width:1400px){[data-coremate-device-wall]{grid-template-columns:repeat(5,minmax(0,1fr))}}
      `}</style>
      <header style={headerStyle}>
        <div style={brandStyle}>
          <OpenGuiMark />
          <span>设备工作台</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', justifyContent: 'flex-end', gap: 6 }}>
          <span
            data-coremate-runtime-version
            aria-label={`运行版本：${runtimeVersionLabel(runtime, runtimeFailed).replace(' · ', '，')}`}
            title={runtimeVersionTitle(runtime, runtimeFailed)}
            style={{ display: 'inline-flex', alignItems: 'center', minHeight: 40, padding: '0 6px', color: runtime?.dshCompatibility === 'unsupported' ? '#b45309' : 'var(--dsw-alias-label-secondary, #52525b)', fontSize: 12, fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap' }}
          >{runtimeVersionLabel(runtime, runtimeFailed)}</span>
          <a data-coremate-header-link href={OPENGUI_GITHUB_URL} target="_blank" rel="noreferrer" style={headerLinkStyle}>GitHub ↗</a>
          <a data-coremate-header-link href={OPENGUI_WEBSITE_URL} target="_blank" rel="noreferrer" style={headerLinkStyle}>官方网站 ↗</a>
          <span role="status" style={{ display: 'inline-flex', alignItems: 'center', gap: 7, minHeight: 40, padding: '0 6px', color: 'var(--dsw-alias-label-secondary, #52525b)', fontSize: 12, fontVariantNumeric: 'tabular-nums' }}>
            <span aria-hidden="true" style={{ width: 6, height: 6, borderRadius: 999, background: error !== undefined ? '#dc2626' : status?.devices.some(device => device.connected) === true ? '#16a34a' : '#a1a1aa' }} />
            {error !== undefined ? '设备检测异常' : status === undefined ? '正在检测设备' : phaseLabel(status)}
          </span>
          <TaskStopButton {...(coremateSessionId === undefined ? {} : { coremateSessionId })} />
        </div>
      </header>

      <div style={{ position: 'sticky', top: 0, zIndex: 10 }}>
        <PluginUpdatePrompt />
        <BrowserInstallPrompt {...(coremateSessionId === undefined ? {} : { coremateSessionId })} />
      </div>

      {error === undefined ? null : (
        <div role="alert" style={detectionErrorStyle} data-coremate-detection-error>
          <strong>设备检测异常</strong>
          <span>{error}</span>
          <span style={{ color: 'var(--dsw-alias-label-secondary, #52525b)', whiteSpace: 'nowrap' }}>正在自动重试…</span>
        </div>
      )}

      <section aria-label="设备照片墙" style={gridStyle} data-coremate-device-wall>
        {wallItems.map(item => {
          if (item.kind === 'connect-more') {
            return (
              <aside key="connect-more" style={connectStyle} data-coremate-connect-more>
                <div>
                  <span aria-hidden="true" style={{ display: 'inline-grid', placeItems: 'center', width: 48, height: 48, marginBottom: 16, border: '1px solid currentColor', borderRadius: 999, fontSize: 30, fontWeight: 300, lineHeight: 1 }}>+</span>
                  <h2 style={{ margin: '0 0 8px', fontSize: 17, lineHeight: 1.35, fontWeight: 720 }}>连接更多设备</h2>
                  <p style={bodyStyle}>连接 Android 手机并开启 USB 调试，授权后会自动出现在设备墙。</p>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', flexWrap: 'wrap', gap: 16, marginTop: 18 }}>
                    <p style={{ ...bodyStyle, flex: '1 1 132px', maxWidth: 188, fontSize: 12 }}>
                      需要帮助可加入 <a href={DISCORD_URL} target="_blank" rel="noreferrer">Discord</a>，也可以微信扫码加入交流群。
                    </p>
                    <figure style={{ flex: '0 0 132px', margin: 0 }}>
                      <img
                        src={WECHAT_GROUP_QR_DATA_URL}
                        alt="OpenGUI 微信交流群二维码"
                        width={752}
                        height={693}
                        style={{ display: 'block', width: 132, height: 'auto', padding: 6, border: '1px solid var(--dsw-alias-border-l2, rgba(128,128,128,.28))', borderRadius: 8, background: '#fff', boxSizing: 'border-box' }}
                      />
                      <figcaption style={{ marginTop: 6, color: 'var(--dsw-alias-label-secondary, #52525b)', fontSize: 11, lineHeight: 1.4 }}>微信扫码入群</figcaption>
                    </figure>
                  </div>
                </div>
              </aside>
            )
          }
          const device = item.device
          const active = mirrorActive(device)
          const open = expanded.has(device.id)
          return (
            <article key={device.id} style={deviceStyle} data-coremate-device-card>
                <div style={deviceHeaderStyle}>
                  <label style={{ display: 'flex', flex: '1 1 92px', alignItems: 'center', gap: 7, minWidth: 0, cursor: status?.selectionLocked === true ? 'not-allowed' : 'pointer' }}>
                    <input
                      type="checkbox"
                      checked={device.selected}
                      disabled={pending || status?.selectionLocked === true || !device.connected}
                      onChange={() => void mutate(DEVICE_SELECTION_PATH, device.selected ? selected.filter(id => id !== device.id) : [...selected, device.id])}
                    />
                    <span style={{ minWidth: 0, overflowWrap: 'anywhere', fontSize: 12, fontWeight: 700 }}>{device.label}</span>
                    <span aria-label={device.connected ? '在线' : '已断开'} title={device.connected ? '在线' : '已断开'} style={{ width: 6, height: 6, flex: '0 0 auto', borderRadius: 999, background: device.connected ? '#16a34a' : '#a1a1aa' }} />
                    {device.occupied && !device.occupiedByCurrentSession
                      ? <span title="设备正由另一 OpenGUI 会话使用" style={{ color: '#b45309', fontSize: 11, fontWeight: 650, whiteSpace: 'nowrap' }}>占用中</span>
                      : null}
                  </label>
                  <div style={{ display: 'flex', flex: '0 0 auto', gap: 6 }}>
                    <button data-coremate-press type="button" style={actionStyle} aria-label={`${open ? '收起' : '展开'} ${device.label} 画面`} aria-expanded={open} onClick={() => setExpanded(current => {
                      const next = new Set(current)
                      if (next.has(device.id)) next.delete(device.id)
                      else next.add(device.id)
                      return next
                    })}>{open ? '收起' : '展开'}</button>
                    <button
                      data-coremate-press
                      type="button"
                      style={{ ...actionStyle, color: active ? '#b45309' : actionStyle.color }}
                      aria-label={mirrorLabel(device)}
                      aria-busy={mirrorBusy(device)}
                      disabled={pending || device.phase === 'unsupported' || (!device.connected && !active)}
                      onClick={() => void mutate(active ? MIRROR_STOP_PATH : MIRROR_START_PATH, [device.id])}
                    >{mirrorProgress(device) ?? (active ? '关闭窗口' : '独立窗口')}</button>
                  </div>
                </div>
                {device.message === undefined ? null : <div role="status" style={{ padding: '0 12px 8px', color: device.phase === 'error' ? '#b91c1c' : 'var(--dsw-alias-label-secondary, #52525b)', fontSize: 11 }}>{device.message}</div>}
                <PhoneStream device={device} expanded={open} streamStatus={streamStatus} streamStatusError={streamStatusError} />
            </article>
          )
        })}
      </section>

    </main>
  )
}
