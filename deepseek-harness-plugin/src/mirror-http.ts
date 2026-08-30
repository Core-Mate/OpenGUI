import type { IncomingMessage, ServerResponse } from 'node:http'
import type { Duplex } from 'node:stream'
import type { Context } from '@deepseek-ai/cordis'
import type {} from '@deepseek-ai/dsh-host-webserver'
import {
  BROWSER_INSTALL_APPROVE_PATH, BROWSER_INSTALL_DECLINE_PATH, BROWSER_INSTALL_STATUS_PATH,
  DEVICE_PREVIEW_PATH, DEVICE_SELECTION_PATH, DEVICE_STREAM_ENABLE_PATH, DEVICE_STREAM_PATH, DEVICE_STREAM_STATUS_PATH,
  MIRROR_START_PATH, MIRROR_STATUS_PATH, MIRROR_STOP_PATH,
  PHONE_TASK_STATUS_PATH, PHONE_TASK_STOP_PATH,
} from './mirror-contract.ts'
import type { CoremateTaskState } from './phone-task.ts'
import type { BrowserInstallStatus } from './browser.ts'
import type { DeviceFleet, DeviceFleetSnapshot } from './device-fleet.ts'
import type { PhonePreview } from './preview.ts'
import type { ScrcpyMirror } from './scrcpy.ts'
import type { ScrcpyVideoStreams } from './scrcpy-stream.ts'
import { acceptStreamWebSocket } from './websocket.ts'

interface CoremateTaskControl {
  isActive(): boolean
  state(): CoremateTaskState
  cancel(): boolean
}

interface BrowserInstallControl {
  status(): Promise<BrowserInstallStatus>
  approveInstall(): boolean
  declineInstall(): boolean
  enableInstallPrompt(): () => void
}

function sendJson(response: ServerResponse, status: number, value: unknown): void {
  response.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
    'X-Content-Type-Options': 'nosniff',
  })
  response.end(JSON.stringify(value))
}

function sameOriginMutation(request: IncomingMessage): boolean {
  const origin = request.headers.origin
  const host = request.headers.host
  if (origin === undefined || host === undefined) return false
  try {
    const parsed = new URL(origin)
    return (parsed.protocol === 'http:' || parsed.protocol === 'https:') && parsed.host === host
  } catch {
    return false
  }
}

function sameOriginRead(request: IncomingMessage): boolean {
  const host = request.headers.host
  if (host === undefined || request.headers['sec-fetch-site'] === 'cross-site') return false
  const source = request.headers.origin ?? request.headers.referer
  if (source === undefined) return request.headers['sec-fetch-site'] === 'same-origin'
  try {
    const parsed = new URL(source)
    return (parsed.protocol === 'http:' || parsed.protocol === 'https:') && parsed.host === host
  } catch {
    return false
  }
}

function sendPreview(response: ServerResponse, status: number, data?: Buffer, etag?: string): void {
  response.writeHead(status, {
    ...(data === undefined ? {} : { 'Content-Type': 'image/jpeg', 'Content-Length': data.byteLength }),
    ...(etag === undefined ? {} : { ETag: etag }),
    'Cache-Control': 'no-store',
    'X-Content-Type-Options': 'nosniff',
  })
  response.end(data)
}

function rejectUpgrade(socket: Duplex, status: number, message: string): void {
  socket.end(`HTTP/1.1 ${status} ${message}\r\nConnection: close\r\nContent-Length: 0\r\n\r\n`)
}

export function publicStreamError(code: string): { type: 'waiting' | 'error', message: string } {
  if (code === 'stream_capacity_wait') return { type: 'waiting', message: '实时画面数量已达上限，正在等待空位。' }
  if (code === 'stream_unsupported') return { type: 'error', message: '当前电脑暂不支持实时画面，已切换为截图预览。' }
  return { type: 'error', message: '实时画面启动失败，已切换为截图预览。' }
}

async function readJson(request: IncomingMessage): Promise<Record<string, unknown>> {
  const chunks: Buffer[] = []
  let bytes = 0
  for await (const chunk of request) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)
    bytes += buffer.byteLength
    if (bytes > 16_384) throw new Error('request_too_large')
    chunks.push(buffer)
  }
  const value: unknown = JSON.parse(Buffer.concat(chunks).toString('utf8'))
  if (typeof value !== 'object' || value === null || Array.isArray(value)) throw new Error('invalid_json')
  return value as Record<string, unknown>
}

function stringArray(value: unknown, field: string): string[] {
  if (!Array.isArray(value) || value.some(item => typeof item !== 'string' || item.length === 0)) {
    throw new Error(`invalid_${field}`)
  }
  return [...new Set(value)]
}

/** Register the web-only native-mirror control surface without making WebServer a mandatory Host dependency. */
export function installMirrorHttp(
  ctx: Context,
  mirror: ScrcpyMirror,
  fleet: DeviceFleet,
  coremateTasks: CoremateTaskControl,
  browser: BrowserInstallControl,
  preview: PhonePreview,
  streams: ScrcpyVideoStreams,
): void {
  ctx.inject(['webServer'], (httpCtx) => {
    httpCtx.effect(() => {
      const disposers: Array<() => void> = []
      disposers.push(browser.enableInstallPrompt())
      const signal = (): AbortSignal => AbortSignal.timeout(5_000)
      const status = async (snapshot?: DeviceFleetSnapshot) => {
        const task = coremateTasks.state()
        return {
          ...mirror.status((snapshot ?? await fleet.snapshot(signal())).devices, task.active),
          taskPhase: task.phase,
          selectionLocked: task.selectionLocked,
        }
      }
      try {
        disposers.push(httpCtx.webServer.register({
          kind: 'exact',
          path: MIRROR_STATUS_PATH,
          async handler(request, response) {
            if (request.method !== 'GET') return sendJson(response, 405, { error: 'method_not_allowed' })
            try {
              sendJson(response, 200, await status())
            } catch {
              sendJson(response, 503, { error: 'device_discovery_failed' })
            }
          },
        }))
        disposers.push(httpCtx.webServer.register({
          kind: 'exact',
          path: DEVICE_STREAM_STATUS_PATH,
          async handler(request, response) {
            if (request.method !== 'GET') return sendJson(response, 405, { error: 'method_not_allowed' })
            if (!sameOriginRead(request)) return sendJson(response, 403, { error: 'same_origin_required' })
            sendJson(response, 200, await streams.status())
          },
        }))
        disposers.push(httpCtx.webServer.register({
          kind: 'exact',
          path: DEVICE_STREAM_ENABLE_PATH,
          async handler(request, response) {
            if (request.method !== 'POST') return sendJson(response, 405, { error: 'method_not_allowed' })
            if (!sameOriginMutation(request)) return sendJson(response, 403, { error: 'same_origin_required' })
            if (!streams.approve()) return sendJson(response, 409, { error: 'stream_unsupported' })
            sendJson(response, 202, await streams.status())
          },
        }))
        disposers.push(httpCtx.webServer.registerUpgrade({
          path: DEVICE_STREAM_PATH,
          async handler(request, socket, head) {
            if (!sameOriginRead(request)) { rejectUpgrade(socket, 403, 'Forbidden'); return }
            try {
              const url = new URL(request.url ?? DEVICE_STREAM_PATH, `http://${request.headers.host}`)
              const id = url.searchParams.get('id')?.trim()
              if (!id) { rejectUpgrade(socket, 400, 'Bad Request'); return }
              const [device] = await fleet.resolveConnected([id], signal())
              if (device === undefined) { rejectUpgrade(socket, 404, 'Not Found'); return }
              const sink = acceptStreamWebSocket(request, socket, head)
              try {
                const unsubscribe = await streams.subscribe(device, sink)
                sink.onClose(unsubscribe)
              } catch (error) {
                const code = error instanceof Error ? error.message : 'stream_failed'
                sink.sendText(JSON.stringify(publicStreamError(code)))
                sink.close(1013, 'stream unavailable')
              }
            } catch {
              if (!socket.destroyed) rejectUpgrade(socket, 503, 'Service Unavailable')
            }
          },
        }))
        disposers.push(httpCtx.webServer.register({
          kind: 'exact',
          path: DEVICE_PREVIEW_PATH,
          async handler(request, response) {
            if (request.method !== 'GET') return sendJson(response, 405, { error: 'method_not_allowed' })
            if (!sameOriginRead(request)) return sendJson(response, 403, { error: 'same_origin_required' })
            try {
              const url = new URL(request.url ?? DEVICE_PREVIEW_PATH, `http://${request.headers.host}`)
              const id = url.searchParams.get('id')?.trim()
              if (!id) return sendJson(response, 400, { error: 'invalid_device_id' })
              const [device] = await fleet.resolveConnected([id], signal())
              if (device === undefined) return sendJson(response, 404, { error: 'device_not_found' })
              const image = await preview.read(device, signal())
              if (request.headers['if-none-match'] === image.etag) return sendPreview(response, 304, undefined, image.etag)
              sendPreview(response, 200, image.data, image.etag)
            } catch (error) {
              sendJson(response, 503, { error: error instanceof Error ? error.message : 'preview_failed' })
            }
          },
        }))
        disposers.push(httpCtx.webServer.register({
          kind: 'exact',
          path: BROWSER_INSTALL_STATUS_PATH,
          async handler(request, response) {
            if (request.method !== 'GET') return sendJson(response, 405, { error: 'method_not_allowed' })
            sendJson(response, 200, await browser.status())
          },
        }))
        disposers.push(httpCtx.webServer.register({
          kind: 'exact',
          path: BROWSER_INSTALL_APPROVE_PATH,
          handler(request, response) {
            if (request.method !== 'POST') return sendJson(response, 405, { error: 'method_not_allowed' })
            if (!sameOriginMutation(request)) return sendJson(response, 403, { error: 'same_origin_required' })
            if (!browser.approveInstall()) return sendJson(response, 409, { error: 'no_browser_installation_waiting' })
            sendJson(response, 202, { accepted: true })
          },
        }))
        disposers.push(httpCtx.webServer.register({
          kind: 'exact',
          path: BROWSER_INSTALL_DECLINE_PATH,
          handler(request, response) {
            if (request.method !== 'POST') return sendJson(response, 405, { error: 'method_not_allowed' })
            if (!sameOriginMutation(request)) return sendJson(response, 403, { error: 'same_origin_required' })
            if (!browser.declineInstall()) return sendJson(response, 409, { error: 'no_browser_installation_waiting' })
            coremateTasks.cancel()
            sendJson(response, 202, { accepted: true })
          },
        }))
        disposers.push(httpCtx.webServer.register({
          kind: 'exact',
          path: DEVICE_SELECTION_PATH,
          async handler(request, response) {
            if (request.method !== 'POST') return sendJson(response, 405, { error: 'method_not_allowed' })
            if (!sameOriginMutation(request)) return sendJson(response, 403, { error: 'same_origin_required' })
            if (coremateTasks.state().selectionLocked) return sendJson(response, 409, { error: 'selection_locked_during_task' })
            try {
              const body = await readJson(request)
              const snapshot = await fleet.select(stringArray(body.deviceIds, 'device_ids'), signal())
              sendJson(response, 200, await status(snapshot))
            } catch (error) {
              sendJson(response, 400, { error: error instanceof Error ? error.message : 'invalid_request' })
            }
          },
        }))
        disposers.push(httpCtx.webServer.register({
          kind: 'exact',
          path: MIRROR_START_PATH,
          async handler(request, response) {
            if (request.method !== 'POST') return sendJson(response, 405, { error: 'method_not_allowed' })
            if (!sameOriginMutation(request)) return sendJson(response, 403, { error: 'same_origin_required' })
            try {
              const body = await readJson(request)
              const deviceIds = stringArray(body.deviceIds, 'device_ids')
              const devices = await fleet.resolveConnected(deviceIds, signal())
              for (const device of devices) mirror.requestStart(device)
              sendJson(response, 202, await status())
            } catch (error) {
              sendJson(response, 400, { error: error instanceof Error ? error.message : 'invalid_request' })
            }
          },
        }))
        disposers.push(httpCtx.webServer.register({
          kind: 'exact',
          path: PHONE_TASK_STATUS_PATH,
          handler(request, response) {
            if (request.method !== 'GET') return sendJson(response, 405, { error: 'method_not_allowed' })
            if (!sameOriginRead(request)) return sendJson(response, 403, { error: 'same_origin_required' })
            sendJson(response, 200, coremateTasks.state())
          },
        }))
        disposers.push(httpCtx.webServer.register({
          kind: 'exact',
          path: PHONE_TASK_STOP_PATH,
          handler(request, response) {
            if (request.method !== 'POST') return sendJson(response, 405, { error: 'method_not_allowed' })
            if (!sameOriginMutation(request)) return sendJson(response, 403, { error: 'same_origin_required' })
            if (!coremateTasks.cancel()) return sendJson(response, 409, { error: 'no_active_coremate_task' })
            sendJson(response, 202, { accepted: true })
          },
        }))
        disposers.push(httpCtx.webServer.register({
          kind: 'exact',
          path: MIRROR_STOP_PATH,
          async handler(request, response) {
            if (request.method !== 'POST') return sendJson(response, 405, { error: 'method_not_allowed' })
            if (!sameOriginMutation(request)) return sendJson(response, 403, { error: 'same_origin_required' })
            try {
              const body = await readJson(request)
              const deviceIds = stringArray(body.deviceIds, 'device_ids')
              await Promise.all(deviceIds.map(id => mirror.stop(id)))
              sendJson(response, 200, await status())
            } catch (error) {
              sendJson(response, 400, { error: error instanceof Error ? error.message : 'invalid_request' })
            }
          },
        }))
      } catch (error) {
        for (const dispose of disposers.reverse()) dispose()
        throw error
      }
      return () => { for (const dispose of disposers.reverse()) dispose() }
    }, 'coremate-mobile native mirror HTTP routes')
  })
}
