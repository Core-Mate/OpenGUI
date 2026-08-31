import { createServer } from 'node:http'
import type { AddressInfo } from 'node:net'
import type { Context } from '@deepseek-ai/cordis'
import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  DEVICE_PREVIEW_PATH, DEVICE_SELECTION_PATH, DEVICE_STREAM_ENABLE_PATH, DEVICE_STREAM_STATUS_PATH, MIRROR_STATUS_PATH, PHONE_TASK_STATUS_PATH,
  PLUGIN_UPDATE_INSTALL_PATH, PLUGIN_UPDATE_STATUS_PATH,
} from '../src/mirror-contract.ts'
import { installMirrorHttp, publicStreamError } from '../src/mirror-http.ts'

const servers: ReturnType<typeof createServer>[] = []

afterEach(async () => {
  await Promise.all(servers.splice(0).map(server => new Promise<void>(resolve => server.close(() => resolve()))))
})

async function setup(options: { selectionLocked?: boolean, fleetError?: Error } = {}) {
  const routes = new Map<string, (request: never, response: never) => unknown>()
  const device = { id: 'opaque-device-id', serial: 'adb-serial-must-stay-private', label: 'Pixel 9' }
  const previewRead = vi.fn(async () => ({ data: Buffer.from([0xff, 0xd8, 0xff, 0xd9]), etag: '"preview-etag"' }))
  const select = vi.fn(async (ids: readonly string[]) => ({
    devices: [{ id: device.id, label: device.label, selected: ids.includes(device.id) }],
  }))
  const fleet = {
    snapshot: async () => {
      if (options.fleetError !== undefined) throw options.fleetError
      return { devices: [{ id: device.id, label: device.label, selected: true }] }
    },
    select,
    async resolveConnected(ids: readonly string[]) {
      if (ids.length !== 1 || ids[0] !== device.id) throw new Error('unknown device')
      return [device]
    },
  }
  const state = () => ({
    active: options.selectionLocked === true,
    phase: options.selectionLocked === true ? 'running' as const : 'waiting-for-device' as const,
    selectionLocked: options.selectionLocked === true,
  })
  const mirror = {
    status: () => ({ taskActive: false, taskPhase: 'idle', selectionLocked: false, hostPlatform: 'darwin/arm64', cached: true, devices: [] }),
    requestStart: vi.fn(),
    stop: vi.fn(async () => {}),
  }
  const browser = {
    enableInstallPrompt: () => () => {},
    status: async () => ({ phase: 'ready' }),
    approveInstall: () => false,
    declineInstall: () => false,
  }
  const updater = {
    start: vi.fn(),
    dispose: vi.fn(),
    status: vi.fn(() => ({ phase: 'available', currentVersion: '0.1.6', latestVersion: '0.1.7' })),
    check: vi.fn(async () => {}),
    requestUpdate: vi.fn(() => true),
  }
  const httpCtx = {
    webServer: {
      register(definition: { path: string, handler(request: never, response: never): unknown }) {
        routes.set(definition.path, definition.handler)
        return () => { routes.delete(definition.path) }
      },
      registerUpgrade() { return () => {} },
    },
    effect(effect: () => (() => void)) { return effect() },
  }
  const ctx = {
    inject(_services: readonly string[], callback: (child: typeof httpCtx) => void) { callback(httpCtx) },
  } as unknown as Context
  installMirrorHttp(
    ctx,
    mirror as never,
    fleet as never,
    { isActive: () => state().active, state, cancel: () => false },
    browser as never,
    updater,
    { read: previewRead } as never,
    { status: async () => ({ supported: true, cached: true, approved: true, phase: 'ready' }), approve: () => true, subscribe: vi.fn() } as never,
  )
  const server = createServer((request, response) => {
    const path = new URL(request.url ?? '/', 'http://localhost').pathname
    const handler = routes.get(path)
    if (handler === undefined) { response.writeHead(404).end(); return }
    void handler(request as never, response as never)
  })
  servers.push(server)
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve))
  const address = server.address() as AddressInfo
  return { base: `http://127.0.0.1:${address.port}`, device, previewRead, select, updater }
}

describe('OpenGUI local preview HTTP surface', () => {
  it('preserves an actionable device-discovery failure for the local workbench', async () => {
    const failure = new Error('OpenGUI bundled ADB is missing execute permission.')
    const { base } = await setup({ fleetError: failure })

    const response = await fetch(`${base}${MIRROR_STATUS_PATH}`)

    expect(response.status).toBe(503)
    expect(await response.json()).toEqual({ error: failure.message })
  })

  it('keeps the legacy enable route idempotent while reporting automatic readiness', async () => {
    const { base } = await setup()
    const status = await fetch(`${base}${DEVICE_STREAM_STATUS_PATH}`, { headers: { Origin: base } })
    expect(status.status).toBe(200)
    await expect(status.json()).resolves.toMatchObject({ supported: true, approved: true, phase: 'ready' })
    const enabled = await fetch(`${base}${DEVICE_STREAM_ENABLE_PATH}`, { method: 'POST', headers: { Origin: base } })
    expect(enabled.status).toBe(202)
    expect(publicStreamError('private /tmp/path scrcpy failure')).toEqual({
      type: 'error', message: '实时画面启动失败，已切换为截图预览。',
    })
  })

  it('serves opaque same-origin JPEG previews with ETag revalidation', async () => {
    const { base, device, previewRead } = await setup()
    const url = `${base}${DEVICE_PREVIEW_PATH}?id=${device.id}`
    const first = await fetch(url, { headers: { Origin: base } })
    expect(first.status).toBe(200)
    expect(first.headers.get('content-type')).toBe('image/jpeg')
    expect(first.headers.get('etag')).toBe('"preview-etag"')
    expect(Buffer.from(await first.arrayBuffer())).toEqual(Buffer.from([0xff, 0xd8, 0xff, 0xd9]))

    const unchanged = await fetch(url, { headers: { Origin: base, 'If-None-Match': '"preview-etag"' } })
    expect(unchanged.status).toBe(304)
    expect(previewRead).toHaveBeenCalledTimes(2)
  })

  it('rejects cross-origin reads and never accepts a raw ADB serial as an identifier', async () => {
    const { base, device, previewRead } = await setup()
    const crossOrigin = await fetch(`${base}${DEVICE_PREVIEW_PATH}?id=${device.id}`, { headers: { Origin: 'https://evil.example' } })
    expect(crossOrigin.status).toBe(403)
    const serial = await fetch(`${base}${DEVICE_PREVIEW_PATH}?id=${device.serial}`, { headers: { Origin: base } })
    expect(serial.status).toBe(503)
    expect(previewRead).not.toHaveBeenCalled()
  })

  it('protects task ownership state with the same-origin read policy', async () => {
    const { base } = await setup()
    expect((await fetch(`${base}${PHONE_TASK_STATUS_PATH}`, { headers: { Origin: base } })).status).toBe(200)
    expect((await fetch(`${base}${PHONE_TASK_STATUS_PATH}`, { headers: { Origin: 'https://evil.example' } })).status).toBe(403)
  })

  it('exposes update state locally and accepts only same-origin, idle update requests', async () => {
    const idle = await setup()
    const status = await fetch(`${idle.base}${PLUGIN_UPDATE_STATUS_PATH}`, { headers: { Origin: idle.base } })
    expect(status.status).toBe(200)
    expect(await status.json()).toMatchObject({ phase: 'available', latestVersion: '0.1.7' })
    expect((await fetch(`${idle.base}${PLUGIN_UPDATE_STATUS_PATH}`, { headers: { Origin: 'https://evil.example' } })).status).toBe(403)

    const accepted = await fetch(`${idle.base}${PLUGIN_UPDATE_INSTALL_PATH}`, {
      method: 'POST', headers: { Origin: idle.base },
    })
    expect(accepted.status).toBe(202)
    expect(idle.updater.requestUpdate).toHaveBeenCalledOnce()

    const running = await setup({ selectionLocked: true })
    const blocked = await fetch(`${running.base}${PLUGIN_UPDATE_INSTALL_PATH}`, {
      method: 'POST', headers: { Origin: running.base },
    })
    expect(blocked.status).toBe(409)
    expect(running.updater.requestUpdate).not.toHaveBeenCalled()
  })

  it('allows device selection while waiting and locks it only after routing starts', async () => {
    const waiting = await setup()
    const allowed = await fetch(`${waiting.base}${DEVICE_SELECTION_PATH}`, {
      method: 'POST', headers: { Origin: waiting.base, 'Content-Type': 'application/json' },
      body: JSON.stringify({ deviceIds: [waiting.device.id] }),
    })
    expect(allowed.status).toBe(200)
    expect(waiting.select).toHaveBeenCalledWith([waiting.device.id], expect.any(AbortSignal))

    const running = await setup({ selectionLocked: true })
    const locked = await fetch(`${running.base}${DEVICE_SELECTION_PATH}`, {
      method: 'POST', headers: { Origin: running.base, 'Content-Type': 'application/json' },
      body: JSON.stringify({ deviceIds: [running.device.id] }),
    })
    expect(locked.status).toBe(409)
    expect(running.select).not.toHaveBeenCalled()
  })
})
