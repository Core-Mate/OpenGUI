import { afterEach, describe, expect, it, vi } from 'vitest'
import { mkdtemp, readdir, rm, stat } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createConnection } from 'node:net'
import { CodexOpenGuiService } from '../src/codex/service.ts'
import { assertVersion, request as makeRequest, sendRequest, startDaemon } from '../src/daemon.ts'
import { FakeHost } from './fixtures.ts'

const cleanup: (() => Promise<void>)[] = []
const request = (name: string, args: Record<string, unknown> = {}) => makeRequest(name, args, 'task-a')
afterEach(async () => { for (const close of cleanup.splice(0).reverse()) await close() })
async function daemon(confirm = vi.fn(async () => false)) {
  const root = await mkdtemp(join(tmpdir(), 'opengui-daemon-test-'))
  cleanup.push(() => rm(root, { recursive: true, force: true }))
  const host = new FakeHost()
  const service = new CodexOpenGuiService({ host })
  const server = await startDaemon({ root, service, confirm })
  cleanup.push(server.close)
  return { root, host, service, confirm, ...server }
}
async function open(endpoint: string): Promise<string> {
  const response = await sendRequest(endpoint, request('opengui_open_session', { deviceIds: ['phone-a'] }))
  expect(response.ok).toBe(true)
  return (response.result as { sessionId: string }).sessionId
}

describe('standalone daemon transport', () => {
  it('scopes discovery and every session operation to the originating task', async () => {
    const server = await daemon(), sessionId = await open(server.endpoint)
    const other = (name: string, args: Record<string, unknown> = {}) => sendRequest(server.endpoint, makeRequest(name, args, 'task-b'))
    expect((await other('opengui_list_sessions')).result).toEqual({ sessions: [] })
    for (const name of ['opengui_status', 'opengui_observe', 'opengui_cancel', 'opengui_close_session']) {
      expect(await other(name, { sessionId })).toMatchObject({ ok: false, error: expect.stringContaining('another Codex task') })
    }
    expect(await other('opengui_act', { sessionId, action: 'key', key: 'Enter', observationId: 'frame', externalSideEffect: 'send' })).toMatchObject({ ok: false })
    expect(server.confirm).not.toHaveBeenCalled()
    expect(server.service.listSessions()[0]?.state).toBe('active')
    expect((await sendRequest(server.endpoint, request('opengui_status', { sessionId }))).ok).toBe(true)
    expect(await sendRequest(server.endpoint, { ...request('opengui_list_sessions'), owner: '' })).toMatchObject({ ok: false })
  })
  it('rejects mismatched versions and refuses silent replacement', async () => {
    const server = await daemon()
    expect(() => assertVersion({ version: '9.0.0', protocol: 1, activeSessions: 1 })).toThrow('finish existing sessions')
    const response = await sendRequest(server.endpoint, { ...request('opengui_list_devices'), version: '9.0.0' })
    expect(response).toMatchObject({ ok: false, error: expect.stringContaining('incompatible') })
  })

  it('materializes private screenshots and deletes them on close', async () => {
    const server = await daemon(), sessionId = await open(server.endpoint)
    const response = await sendRequest(server.endpoint, request('opengui_observe', { sessionId }))
    const screenshot = (response.result as { screenshot: { path: string; data?: string } }).screenshot
    expect(screenshot.data).toBeUndefined()
    expect((await stat(screenshot.path)).mode & 0o777).toBe(0o600)
    expect((await stat(server.endpoint)).mode & 0o777).toBe(0o600)
    await sendRequest(server.endpoint, request('opengui_close_session', { sessionId }))
    await expect(stat(screenshot.path)).rejects.toThrow()
  })

  it('does not accept a caller-supplied approval boolean', async () => {
    const server = await daemon(), sessionId = await open(server.endpoint)
    const response = await sendRequest(server.endpoint, request('opengui_act', {
      sessionId, action: 'key', key: 'Enter', observationId: 'frame', externalSideEffect: 'send', confirmedExternalSideEffect: true,
    }))
    expect(response.ok).toBe(false)
    expect(server.confirm).not.toHaveBeenCalled()
  })

  it('executes only after native one-action approval', async () => {
    const confirm = vi.fn(async () => false), server = await daemon(confirm), sessionId = await open(server.endpoint)
    const args = { sessionId, action: 'key', key: 'Enter', observationId: 'frame', externalSideEffect: 'send' }
    expect((await sendRequest(server.endpoint, request('opengui_act', args))).ok).toBe(false)
    expect(server.service.listSessions()[0]?.devices[0]?.operationCount).toBe(0)
    confirm.mockResolvedValueOnce(true)
    expect((await sendRequest(server.endpoint, request('opengui_act', args))).ok).toBe(true)
    expect(confirm).toHaveBeenCalledTimes(2)
  })

  it('cancels work when the requesting CLI disappears', async () => {
    const server = await daemon(), sessionId = await open(server.endpoint)
    let started = false
    server.host.observe = (_actor, signal) => new Promise((_resolve, reject) => {
      started = true
      signal.addEventListener('abort', () => reject(signal.reason), { once: true })
    })
    const socket = createConnection(server.endpoint)
    await new Promise<void>(resolve => socket.once('connect', resolve))
    socket.write(JSON.stringify(request('opengui_observe', { sessionId })) + '\n')
    await vi.waitFor(() => expect(started).toBe(true))
    socket.destroy()
    await vi.waitFor(() => expect(server.service.listSessions()[0]?.state).toBe('cancelled'))
  })

  it('will not stop a daemon with an active device session', async () => {
    const server = await daemon()
    await open(server.endpoint)
    expect((await sendRequest(server.endpoint, request('__shutdown__'))).ok).toBe(false)
    expect(server.service.activeSessionCount).toBe(1)
  })

  it('returns JSON errors for malformed input without creating a phone session', async () => {
    const server = await daemon()
    const socket = createConnection(server.endpoint)
    const output = new Promise<string>(resolve => socket.once('data', chunk => resolve(String(chunk))))
    socket.once('connect', () => socket.write('{broken}\n'))
    expect(JSON.parse(await output).ok).toBe(false)
    socket.destroy()
    expect(server.service.activeSessionCount).toBe(0)
    expect(await readdir(join(server.root, 'observations'))).toEqual([])
  })
})
