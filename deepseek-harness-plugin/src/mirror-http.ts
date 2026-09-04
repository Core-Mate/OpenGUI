import type { IncomingMessage, ServerResponse } from 'node:http'
import type { Duplex } from 'node:stream'
import type { Context } from '@deepseek-ai/cordis'
import type {} from '@deepseek-ai/dsh-host-webserver'
import {
  BROWSER_INSTALL_APPROVE_PATH, BROWSER_INSTALL_DECLINE_PATH, BROWSER_INSTALL_STATUS_PATH,
  DEVICE_PREVIEW_PATH, DEVICE_SELECTION_PATH, DEVICE_STREAM_ENABLE_PATH, DEVICE_STREAM_PATH, DEVICE_STREAM_STATUS_PATH,
  MIRROR_START_PATH, MIRROR_STATUS_PATH, MIRROR_STOP_PATH,
  PHONE_TASK_STATUS_PATH, PHONE_TASK_STOP_PATH,
  PLUGIN_UPDATE_CHECK_PATH, PLUGIN_UPDATE_INSTALL_PATH, PLUGIN_UPDATE_STATUS_PATH,
  RUNTIME_INFO_PATH,
} from './mirror-contract.ts'
import type { RuntimeInfo } from './mirror-contract.ts'
import type { CoremateTaskState, OpenGuiTaskIdentity } from './phone-task.ts'
import type { BrowserInstallStatus } from './browser.ts'
import type { DeviceFleet, DeviceFleetSnapshot } from './device-fleet.ts'
import { DeviceSelectionLockedError } from './device-fleet.ts'
import type { PhonePreview } from './preview.ts'
import type { ScrcpyMirror } from './scrcpy.ts'
import type { ScrcpyVideoStreams } from './scrcpy-stream.ts'
import { runtimeInfo as readRuntimeInfo } from './package-info.ts'
import { acceptStreamWebSocket } from './websocket.ts'

interface CoremateTaskControl {
  isActive(): boolean
  state(sessionId: string): CoremateTaskState
  states(): readonly CoremateTaskState[]
  cancel(sessionId: string, taskId: string): boolean
  browserOwner(): OpenGuiTaskIdentity | undefined
}

interface BrowserInstallControl {
  status(): Promise<BrowserInstallStatus>
  approveInstall(): boolean
  declineInstall(): boolean
  enableInstallPrompt(): () => void
}

interface PluginUpdateControl {
  start(): void
  status(): unknown
  check(force?: boolean): Promise<void>
  requestUpdate(): boolean
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

function nonemptyString(value: unknown, field: string): string {
  if (typeof value !== 'string' || value.trim().length === 0) throw new Error(`invalid_${field}`)
  return value.trim()
}

function querySessionId(request: IncomingMessage, fallbackPath: string): string {
  const url = new URL(request.url ?? fallbackPath, `http://${request.headers.host ?? 'localhost'}`)
  return nonemptyString(url.searchParams.get('sessionId'), 'session_id')
}

function taskReference(body: Record<string, unknown>): { sessionId: string, taskId: string } {
  return {
    sessionId: nonemptyString(body.sessionId, 'session_id'),
    taskId: nonemptyString(body.taskId, 'task_id'),
  }
}

/** Register the web-only native-mirror control surface without making WebServer a mandatory Host dependency. */
export function installMirrorHttp(
  ctx: Context,
  mirror: ScrcpyMirror,
  fleet: DeviceFleet,
  coremateTasks: CoremateTaskControl,
  browser: BrowserInstallControl,
  updater: PluginUpdateControl,
  preview: PhonePreview,
  streams: ScrcpyVideoStreams,
  runtime: RuntimeInfo = readRuntimeInfo(),
): void {
  ctx.inject(['webServer'], (httpCtx) => {
    httpCtx.effect(() => {
      const disposers: Array<() => void> = []
      disposers.push(browser.enableInstallPrompt())
      updater.start()
      const signal = (): AbortSignal => AbortSignal.timeout(5_000)
      const status = async (sessionId: string, snapshot?: DeviceFleetSnapshot) => {
        const task = coremateTasks.state(sessionId)
        return {
          ...mirror.status((snapshot ?? await fleet.snapshotForSession(sessionId, signal())).devices, task.active),
          sessionId,
          ...(task.taskId === undefined ? {} : { taskId: task.taskId }),
          ...(task.attemptId === undefined ? {} : { attemptId: task.attemptId }),
          taskPhase: task.phase,
          selectionLocked: task.selectionLocked,
        }
      }
      try {
        disposers.push(httpCtx.webServer.register({
          kind: 'exact',
          path: RUNTIME_INFO_PATH,
          handler(request, response) {
            if (request.method !== 'GET') return sendJson(response, 405, { error: 'method_not_allowed' })
            sendJson(response, 200, runtime)
          },
        }))
        disposers.push(httpCtx.webServer.register({
          kind: 'exact',
          path: MIRROR_STATUS_PATH,
          async handler(request, response) {
            if (request.method !== 'GET') return sendJson(response, 405, { error: 'method_not_allowed' })
            try {
              const sessionId = querySessionId(request, MIRROR_STATUS_PATH)
              sendJson(response, 200, await status(sessionId))
            } catch (error) {
              const message = error instanceof Error ? error.message : '手机检测服务暂时不可用，请稍后重试。'
              sendJson(response, message === 'invalid_session_id' ? 400 : 503, {
                error: message,
              })
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
            try {
              const sessionId = querySessionId(request, BROWSER_INSTALL_STATUS_PATH)
              const owner = coremateTasks.browserOwner()
              const browserStatus = await browser.status()
              const currentOwner = coremateTasks.browserOwner()
              if (owner?.sessionId !== sessionId ||
                currentOwner?.sessionId !== owner.sessionId ||
                currentOwner.taskId !== owner.taskId ||
                currentOwner.attemptId !== owner.attemptId) {
                return sendJson(response, 200, {
                  phase: 'idle',
                  version: browserStatus.version,
                  hostPlatform: browserStatus.hostPlatform,
                })
              }
              sendJson(response, 200, { ...browserStatus, owner })
            } catch (error) {
              sendJson(response, 400, { error: error instanceof Error ? error.message : 'invalid_request' })
            }
          },
        }))
        disposers.push(httpCtx.webServer.register({
          kind: 'exact',
          path: BROWSER_INSTALL_APPROVE_PATH,
          async handler(request, response) {
            if (request.method !== 'POST') return sendJson(response, 405, { error: 'method_not_allowed' })
            if (!sameOriginMutation(request)) return sendJson(response, 403, { error: 'same_origin_required' })
            try {
              const ref = taskReference(await readJson(request))
              const owner = coremateTasks.browserOwner()
              if (owner?.sessionId !== ref.sessionId || owner.taskId !== ref.taskId) {
                return sendJson(response, 409, { error: 'browser_owner_mismatch' })
              }
              if (!browser.approveInstall()) return sendJson(response, 409, { error: 'no_browser_installation_waiting' })
              sendJson(response, 202, { accepted: true, ...ref })
            } catch (error) {
              sendJson(response, 400, { error: error instanceof Error ? error.message : 'invalid_request' })
            }
          },
        }))
        disposers.push(httpCtx.webServer.register({
          kind: 'exact',
          path: BROWSER_INSTALL_DECLINE_PATH,
          async handler(request, response) {
            if (request.method !== 'POST') return sendJson(response, 405, { error: 'method_not_allowed' })
            if (!sameOriginMutation(request)) return sendJson(response, 403, { error: 'same_origin_required' })
            try {
              const ref = taskReference(await readJson(request))
              const owner = coremateTasks.browserOwner()
              if (owner?.sessionId !== ref.sessionId || owner.taskId !== ref.taskId) {
                return sendJson(response, 409, { error: 'browser_owner_mismatch' })
              }
              if (!browser.declineInstall()) return sendJson(response, 409, { error: 'no_browser_installation_waiting' })
              coremateTasks.cancel(ref.sessionId, ref.taskId)
              sendJson(response, 202, { accepted: true, ...ref })
            } catch (error) {
              sendJson(response, 400, { error: error instanceof Error ? error.message : 'invalid_request' })
            }
          },
        }))
        disposers.push(httpCtx.webServer.register({
          kind: 'exact',
          path: PLUGIN_UPDATE_STATUS_PATH,
          handler(request, response) {
            if (request.method !== 'GET') return sendJson(response, 405, { error: 'method_not_allowed' })
            if (!sameOriginRead(request)) return sendJson(response, 403, { error: 'same_origin_required' })
            sendJson(response, 200, updater.status())
          },
        }))
        disposers.push(httpCtx.webServer.register({
          kind: 'exact',
          path: PLUGIN_UPDATE_CHECK_PATH,
          handler(request, response) {
            if (request.method !== 'POST') return sendJson(response, 405, { error: 'method_not_allowed' })
            if (!sameOriginMutation(request)) return sendJson(response, 403, { error: 'same_origin_required' })
            void updater.check(true)
            sendJson(response, 202, updater.status())
          },
        }))
        disposers.push(httpCtx.webServer.register({
          kind: 'exact',
          path: PLUGIN_UPDATE_INSTALL_PATH,
          handler(request, response) {
            if (request.method !== 'POST') return sendJson(response, 405, { error: 'method_not_allowed' })
            if (!sameOriginMutation(request)) return sendJson(response, 403, { error: 'same_origin_required' })
            if (coremateTasks.isActive()) return sendJson(response, 409, { error: 'stop_the_active_opengui_task_before_updating' })
            if (!updater.requestUpdate()) return sendJson(response, 409, { error: 'no_plugin_update_available' })
            sendJson(response, 202, updater.status())
          },
        }))
        disposers.push(httpCtx.webServer.register({
          kind: 'exact',
          path: DEVICE_SELECTION_PATH,
          async handler(request, response) {
            if (request.method !== 'POST') return sendJson(response, 405, { error: 'method_not_allowed' })
            if (!sameOriginMutation(request)) return sendJson(response, 403, { error: 'same_origin_required' })
            try {
              const body = await readJson(request)
              const sessionId = nonemptyString(body.sessionId, 'session_id')
              if (coremateTasks.state(sessionId).selectionLocked) {
                return sendJson(response, 409, { error: 'selection_locked_during_task' })
              }
              const snapshot = await fleet.selectForSession(sessionId, stringArray(body.deviceIds, 'device_ids'), signal())
              sendJson(response, 200, await status(sessionId, snapshot))
            } catch (error) {
              sendJson(response, error instanceof DeviceSelectionLockedError ? 409 : 400, {
                error: error instanceof Error ? error.message : 'invalid_request',
              })
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
              const sessionId = nonemptyString(body.sessionId, 'session_id')
              const deviceIds = stringArray(body.deviceIds, 'device_ids')
              const devices = await fleet.resolveConnected(deviceIds, signal())
              for (const device of devices) mirror.requestStart(device)
              sendJson(response, 202, await status(sessionId))
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
            sendJson(response, 200, { tasks: coremateTasks.states() })
          },
        }))
        disposers.push(httpCtx.webServer.register({
          kind: 'exact',
          path: PHONE_TASK_STOP_PATH,
          async handler(request, response) {
            if (request.method !== 'POST') return sendJson(response, 405, { error: 'method_not_allowed' })
            if (!sameOriginMutation(request)) return sendJson(response, 403, { error: 'same_origin_required' })
            try {
              const ref = taskReference(await readJson(request))
              if (!coremateTasks.cancel(ref.sessionId, ref.taskId)) {
                return sendJson(response, 409, { error: 'opengui_task_identity_mismatch' })
              }
              sendJson(response, 202, { accepted: true, ...ref })
            } catch (error) {
              sendJson(response, 400, { error: error instanceof Error ? error.message : 'invalid_request' })
            }
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
              const sessionId = nonemptyString(body.sessionId, 'session_id')
              const deviceIds = stringArray(body.deviceIds, 'device_ids')
              await Promise.all(deviceIds.map(id => mirror.stop(id)))
              sendJson(response, 200, await status(sessionId))
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
