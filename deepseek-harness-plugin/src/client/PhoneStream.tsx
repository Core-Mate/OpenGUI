import { useCallback, useEffect, useRef, useState } from 'react'
import type { CSSProperties } from 'react'
import {
  DEVICE_PREVIEW_PATH,
  DEVICE_STREAM_PATH,
  type MirrorDeviceStatus,
} from '../mirror-contract.ts'
import type { ScrcpyStreamStatus } from '../scrcpy-stream.ts'
import { createCoremateVideoDecoder } from './video-decoder.ts'

type StreamMode = 'checking' | 'consent' | 'connecting' | 'video' | 'fallback'

const viewportStyle: CSSProperties = {
  position: 'relative',
  display: 'grid',
  placeItems: 'center',
  width: '100%',
  minHeight: 220,
  overflow: 'hidden',
  background: 'oklch(18% 0.008 92)',
}

const overlayStyle: CSSProperties = {
  position: 'absolute',
  inset: 0,
  display: 'grid',
  placeItems: 'center',
  padding: 24,
  color: 'oklch(88% 0.01 92)',
  background: 'oklch(18% 0.008 92 / 82%)',
  fontSize: 12,
  lineHeight: 1.6,
  textAlign: 'center',
  boxSizing: 'border-box',
}

function streamUrl(deviceId: string): string {
  const url = new URL(DEVICE_STREAM_PATH, window.location.href)
  url.protocol = url.protocol === 'https:' ? 'wss:' : 'ws:'
  url.searchParams.set('id', deviceId)
  return url.href
}

function megabytes(bytes?: number): string {
  return bytes === undefined ? '' : `${Math.ceil(bytes / 1024 / 1024)} MB`
}

function usePageVisible(): boolean {
  const [visible, setVisible] = useState(() => !document.hidden)
  useEffect(() => {
    const update = (): void => setVisible(!document.hidden)
    document.addEventListener('visibilitychange', update)
    return () => document.removeEventListener('visibilitychange', update)
  }, [])
  return visible
}

function ScreenshotFallback({ device, active }: { readonly device: MirrorDeviceStatus, readonly active: boolean }): JSX.Element {
  const [url, setUrl] = useState<string>()
  const [error, setError] = useState<string>()
  const [lastUpdated, setLastUpdated] = useState<number>()
  const etag = useRef<string>()
  const currentUrl = useRef<string>()
  useEffect(() => () => {
    if (currentUrl.current !== undefined) URL.revokeObjectURL(currentUrl.current)
  }, [device.id])
  useEffect(() => {
    if (!active) return
    const controller = new AbortController()
    let timer: ReturnType<typeof setTimeout> | undefined
    const poll = async (): Promise<void> => {
      try {
        const response = await fetch(`${DEVICE_PREVIEW_PATH}?id=${encodeURIComponent(device.id)}`, {
          cache: 'no-store',
          headers: etag.current === undefined ? {} : { 'If-None-Match': etag.current },
          signal: controller.signal,
        })
        if (response.status !== 304) {
          if (!response.ok) {
            if (response.status === 404) {
              if (currentUrl.current !== undefined) URL.revokeObjectURL(currentUrl.current)
              currentUrl.current = undefined
              setUrl(undefined)
            }
            throw new Error(`截图预览失败 (${response.status})`)
          }
          const next = URL.createObjectURL(await response.blob())
          if (currentUrl.current !== undefined) URL.revokeObjectURL(currentUrl.current)
          currentUrl.current = next
          setUrl(next)
          etag.current = response.headers.get('ETag') ?? undefined
        }
        setLastUpdated(Date.now())
        setError(undefined)
      } catch (reason) {
        if (!controller.signal.aborted) setError(reason instanceof Error ? reason.message : String(reason))
      } finally {
        if (!controller.signal.aborted) timer = setTimeout(poll, 2_000)
      }
    }
    void poll()
    return () => {
      controller.abort()
      if (timer !== undefined) clearTimeout(timer)
    }
  }, [active, device.id])
  return (
    <div style={viewportStyle} data-coremate-preview="screenshot">
      {url === undefined ? <span role="status" style={{ padding: 24, color: 'oklch(82% 0.01 92)', fontSize: 12 }}>{error ?? '正在获取截图预览…'}</span> : (
        <img src={url} alt={`${device.label} 截图预览`} style={{ display: 'block', width: '100%', height: 'auto', objectFit: 'contain' }} />
      )}
      <span style={{ position: 'absolute', top: 10, left: 10, padding: '3px 7px', borderRadius: 999, color: '#fff', background: 'rgba(0,0,0,.62)', fontSize: 11 }}>截图预览</span>
      {error === undefined || url === undefined ? null : (
        <span role="status" style={{ position: 'absolute', right: 10, bottom: 10, maxWidth: '75%', padding: '4px 8px', borderRadius: 7, color: '#fff', background: 'rgba(127,29,29,.86)', fontSize: 11 }}>
          {error}{lastUpdated === undefined ? '' : ` · 上次更新 ${new Date(lastUpdated).toLocaleTimeString()}`}
        </span>
      )}
    </div>
  )
}

interface PhoneStreamProps {
  readonly device: MirrorDeviceStatus
  readonly expanded: boolean
  readonly streamStatus: ScrcpyStreamStatus | undefined
  readonly streamGeneration: number
  readonly enableStream: () => Promise<void>
}

export function PhoneStream({ device, expanded, streamStatus, streamGeneration, enableStream }: PhoneStreamProps): JSX.Element {
  const root = useRef<HTMLDivElement>(null)
  const canvas = useRef<HTMLCanvasElement>(null)
  const [inViewport, setInViewport] = useState(true)
  const pageVisible = usePageVisible()
  const [mode, setMode] = useState<StreamMode>('checking')
  const [error, setError] = useState<string>()
  const [retry, setRetry] = useState(0)

  useEffect(() => {
    const node = root.current
    if (node === null || typeof IntersectionObserver === 'undefined') return
    const observer = new IntersectionObserver(entries => setInViewport(entries[0]?.isIntersecting ?? false), { rootMargin: '120px' })
    observer.observe(node)
    return () => observer.disconnect()
  }, [expanded])

  const shouldStream = expanded && device.connected && inViewport && pageVisible
  useEffect(() => {
    if (!shouldStream) return
    if (typeof VideoDecoder === 'undefined' || typeof EncodedVideoChunk === 'undefined') {
      setError('当前浏览器不支持 WebCodecs，已切换为截图预览。')
      setMode('fallback')
      return
    }
    const controller = new AbortController()
    let websocket: WebSocket | undefined
    let player: ReturnType<typeof createCoremateVideoDecoder> | undefined
    let reconnect: ReturnType<typeof setTimeout> | undefined
    let terminal = false
    const fallback = (reason: unknown, retryable = false): void => {
      if (terminal || controller.signal.aborted) return
      terminal = !retryable
      const message = reason instanceof Error ? reason.message : String(reason)
      setError(message)
      setMode('fallback')
      player?.close()
      player = undefined
      if (websocket?.readyState === WebSocket.OPEN || websocket?.readyState === WebSocket.CONNECTING) {
        websocket.close(1011, 'embedded preview fallback')
      }
    }
    const start = async (): Promise<void> => {
      try {
        setMode('checking')
        const next = streamStatus
        if (next === undefined) return
        if (!next.supported) throw new Error('当前电脑不支持内嵌实时画面')
        if (!next.approved) { setMode('consent'); return }
        setMode('connecting')
        player = createCoremateVideoDecoder(
          canvas.current!,
          () => { setError(undefined); setMode('video') },
          error => fallback(new Error(`实时画面解码失败，已切换为截图预览：${error.message}`)),
        )
        websocket = new WebSocket(streamUrl(device.id))
        websocket.binaryType = 'arraybuffer'
        websocket.onmessage = event => {
          try {
            if (typeof event.data === 'string') {
              const value = JSON.parse(event.data) as { type?: string; width?: number; height?: number; message?: string }
              if (value.type === 'session' && value.width !== undefined && value.height !== undefined) player?.session(value.width, value.height)
              if (value.type === 'waiting') fallback(value.message ?? '实时画面正在等待空位', true)
              if (value.type === 'error') fallback(value.message ?? '实时画面启动失败', true)
              return
            }
            const bytes = new Uint8Array(event.data as ArrayBuffer)
            if (bytes.byteLength < 9) throw new Error('实时画面数据包不完整')
            const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
            player?.packet(bytes[0]!, view.getBigUint64(1), bytes.subarray(9))
          } catch (reason) {
            fallback(reason)
          }
        }
        websocket.onerror = () => fallback('实时画面连接失败，已切换为截图预览。', true)
        websocket.onclose = event => {
          player?.close()
          player = undefined
          if (controller.signal.aborted) return
          setMode('fallback')
          if (!terminal && event.code !== 1000) reconnect = setTimeout(() => setRetry(value => value + 1), Math.min(5_000, 1_000 + retry * 500))
        }
      } catch (reason) {
        fallback(reason)
      }
    }
    void start()
    return () => {
      controller.abort()
      if (reconnect !== undefined) clearTimeout(reconnect)
      websocket?.close(1000, 'preview hidden')
      player?.close()
    }
  }, [device.connected, device.id, retry, shouldStream, streamGeneration, streamStatus?.approved, streamStatus?.supported])

  const enable = useCallback(async (): Promise<void> => {
    try {
      setMode('connecting')
      await enableStream()
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : String(reason))
      setMode('fallback')
    }
  }, [enableStream])

  if (!expanded) return <div ref={root} style={viewportStyle} data-coremate-preview="collapsed"><span style={{ color: 'oklch(76% 0.01 92)', fontSize: 12 }}>画面已收起</span></div>
  if (!device.connected) return <div ref={root} style={viewportStyle} data-coremate-preview="disconnected"><div style={overlayStyle}>设备已断开</div></div>
  return (
    <div ref={root} style={viewportStyle} data-coremate-preview={mode}>
      {mode === 'fallback' ? <ScreenshotFallback device={device} active={shouldStream} /> : <canvas ref={canvas} aria-label={`${device.label} 实时画面`} style={{ display: 'block', width: 'auto', height: 'auto', maxWidth: '100%', maxHeight: 'min(72vh, 820px)', objectFit: 'contain' }} />}
      {!shouldStream && mode !== 'fallback' ? <div style={overlayStyle}>画面已暂停，回到此处后自动继续</div> : null}
      {mode === 'checking' || mode === 'connecting' ? <div role="status" style={overlayStyle}>{mode === 'checking' ? '正在检查实时画面…' : '正在连接手机实时画面…'}</div> : null}
      {mode === 'consent' ? (
        <div style={overlayStyle}>
          <div>
            <p style={{ margin: '0 0 12px' }}>首次启用实时画面需要下载并校验 scrcpy {streamStatus?.version}（{megabytes(streamStatus?.totalBytes)}）。</p>
            <button type="button" data-coremate-press onClick={() => { void enable() }} style={{ minHeight: 40, padding: '0 14px', border: 0, borderRadius: 8, color: '#171717', background: '#f1bf1f', font: 'inherit', fontWeight: 700, cursor: 'pointer' }}>启用实时画面</button>
          </div>
        </div>
      ) : null}
      {error !== undefined && mode !== 'video' ? <span role="status" style={{ position: 'absolute', right: 10, bottom: 10, maxWidth: '75%', padding: '4px 8px', borderRadius: 7, color: '#fff', background: 'rgba(127,29,29,.82)', fontSize: 11 }}>{error}</span> : null}
    </div>
  )
}
