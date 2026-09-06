import sharp from 'sharp'
import { describe, expect, it, vi } from 'vitest'
import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js'
import { FakeHost } from './fake-host.ts'
import { PhoneController } from '../src/phone-controller.ts'
import { encodeWorkBuddyPhoneScreenshot } from '../src/screenshot.ts'
import { WorkBuddyOpenGuiService, type WorkBuddyPhoneHost } from '../src/service.ts'
import { startMcp } from '../src/mcp-server.ts'
import { callOpenGuiTool } from '../src/tools.ts'
import { ConfirmationServer } from '../src/confirmation.ts'

const signal = (): AbortSignal => AbortSignal.timeout(5000)
async function fixture() {
  let failCapture = false
  let onCapture: (() => Promise<void>) | undefined
  let pixels = await sharp({ create: { width: 100, height: 200, channels: 3, background: '#334155' } }).png().toBuffer()
  const writes = vi.fn()
  const controller = new PhoneController({
    runAdb: async args => {
      if (args.includes('screencap')) {
        await onCapture?.()
        if (failCapture) { failCapture = false; throw new Error('Synthetic capture failure') }
        return pixels
      }
      if (args.includes('wm')) return 'Physical size: 100x200\n'
      if (args.includes('dumpsys')) return 'mCurrentFocus=Window{ u0 com.example/.Main }\n'
      writes(args)
      return ''
    },
    discoverTarget: async () => 'serial-a',
    pasteUnicode: async () => { throw new Error('Unexpected input') },
    encodeScreenshot: encodeWorkBuddyPhoneScreenshot,
    maxOperations: () => 100,
  })
  const host = Object.assign(new FakeHost(), {
    assignTarget: (actor: object, serial: string) => controller.assignTarget(actor, serial),
    observe: (actor: object) => controller.observe(actor, signal()),
    act: (actor: object, action: Record<string, unknown>, abort: AbortSignal) => controller.execute(actor, action, abort),
    status: (actor: object) => controller.status(actor),
    invalidate: (actor: object) => controller.invalidate(actor),
  })
  const service = new WorkBuddyOpenGuiService({ host })
  const [a, b] = InMemoryTransport.createLinkedPair()
  const server = await startMcp(b, async () => ({
    call: (name, args, abort, confirmed) => callOpenGuiTool(service, name, args, abort, confirmed), close() {},
  }))
  const client = new Client({ name: 'synthetic-confirmation-e2e', version: '1' })
  await client.connect(a)
  const call = (name: string, args: Record<string, unknown>) => client.callTool({ name, arguments: args })
  const session = (await call('opengui_open_session', { deviceIds: ['phone-a'] })).structuredContent!
  const frame = await call('opengui_observe', { sessionId: session.sessionId })
  const action = { sessionId: session.sessionId, deviceId: 'phone-a', observationId: frame.structuredContent!.observationId,
    action: 'key', key: 'Enter', externalSideEffect: 'send' }
  const pending = (await call('opengui_act', action)).structuredContent!
  return { call, action, pending, writes, frame,
    onCapture: (callback: (() => Promise<void>) | undefined) => { onCapture = callback },
    interruptDevice: () => (host as WorkBuddyPhoneHost).onDeviceUnavailable?.('serial-a'),
    failNextCapture: () => { failCapture = true },
    change: async () => { pixels = await sharp({ create: { width: 100, height: 200, channels: 3, background: '#ffffff' } }).png().toBuffer() },
    close: async () => { await client.close(); await server.close(); await service.dispose() },
  }
}

// Synthetic user input only. Never use this test helper to approve a real phone action.
async function decide(url: string, decision: string) {
  const page = await fetch(url)
  const html = await page.text()
  const csrf = html.match(/name="csrf" value="([^"]+)"/)![1]!
  return fetch(url, { method: 'POST', headers: { Origin: new URL(url).origin }, body: new URLSearchParams({ csrf, decision }) })
}

describe('MCP to local approval to real executor protocol', () => {
  it('does not dispatch an approved action interrupted during its frame recheck', async () => {
    const f = await fixture()
    let entered = false
    let release!: () => void
    const gate = new Promise<void>(resolve => { release = resolve })
    try {
      await decide(String(f.pending.confirmationUrl), 'approve')
      f.onCapture(async () => { entered = true; await gate })
      const executing = f.call('opengui_act', { ...f.action, confirmationRequestId: f.pending.requestId })
      await vi.waitFor(() => expect(entered).toBe(true))
      f.interruptDevice()
      release()
      expect((await executing).isError).toBe(true)
      expect(f.writes).not.toHaveBeenCalled()
      f.onCapture(undefined)
      const observed = await f.call('opengui_observe', { sessionId: f.action.sessionId })
      const result = await f.call('opengui_act', { ...f.action, observationId: observed.structuredContent!.observationId, externalSideEffect: 'none' })
      expect(result.isError).not.toBe(true)
      expect(f.writes).toHaveBeenCalledTimes(1)
    } finally { release(); await f.close() }
  })
  it('revokes the old confirmation when an ordinary action advances the observation', async () => {
    const f = await fixture()
    try {
      expect((await fetch(String(f.pending.confirmationUrl))).status).toBe(200)
      const result = await f.call('opengui_act', { ...f.action, externalSideEffect: 'none', key: 'Home' })
      expect(result.isError).not.toBe(true)
      expect(f.writes).toHaveBeenCalledTimes(1)
      expect((await fetch(String(f.pending.confirmationUrl))).status).toBe(404)
      expect((await f.call('opengui_status', { sessionId: f.action.sessionId })).structuredContent!.activity).toBe('ready')
    } finally { await f.close() }
  })
  it('does not let an obsolete request remove a newer confirmation', async () => {
    const f = await fixture()
    let release!: () => void
    const gate = new Promise<void>(resolve => { release = resolve })
    const original = ConfirmationServer.prototype.request
    let entered = false
    const request = vi.spyOn(ConfirmationServer.prototype, 'request').mockImplementationOnce(async function (...args) {
      entered = true
      await gate
      return original.apply(this, args)
    })
    try {
      const obsolete = f.call('opengui_act', f.action)
      await vi.waitFor(() => expect(entered).toBe(true))
      const refresh = await f.call('opengui_observe', { sessionId: f.action.sessionId })
      const current = await f.call('opengui_act', { ...f.action, observationId: refresh.structuredContent!.observationId })
      expect(current.structuredContent!.status).toBe('confirmation_required')
      release()
      expect((await obsolete).isError).toBe(true)
      expect((await fetch(String(current.structuredContent!.confirmationUrl))).status).toBe(200)
      expect(f.writes).not.toHaveBeenCalled()
    } finally { release(); request.mockRestore(); await f.close() }
  })
  it.each(['refresh', 'failed-refresh', 'cancel'] as const)('invalidates a confirmation created concurrently with %s', async interruption => {
    const f = await fixture()
    let release!: () => void
    const gate = new Promise<void>(resolve => { release = resolve })
    const original = ConfirmationServer.prototype.request
    let entered = false
    const request = vi.spyOn(ConfirmationServer.prototype, 'request').mockImplementation(async function (...args) {
      entered = true
      await gate
      return original.apply(this, args)
    })
    try {
      const pending = f.call('opengui_act', f.action)
      await vi.waitFor(() => expect(entered).toBe(true))
      if (interruption === 'failed-refresh') f.failNextCapture()
      const refresh = await f.call(interruption === 'cancel' ? 'opengui_cancel' : 'opengui_observe', { sessionId: f.action.sessionId })
      expect(refresh.isError === true).toBe(interruption === 'failed-refresh')
      release()
      expect((await pending).isError).toBe(true)
      const status = await f.call('opengui_status', { sessionId: f.action.sessionId })
      expect(status.structuredContent!.activity).not.toBe('waiting_for_confirmation')
      expect(f.writes).not.toHaveBeenCalled()
    } finally { release(); request.mockRestore(); await f.close() }
  })
  it('returns an actual JPEG and executes exactly once after local approval', async () => {
    const f = await fixture()
    try {
      expect(f.frame.content).toEqual(expect.arrayContaining([expect.objectContaining({ type: 'image', mimeType: 'image/jpeg' })]))
      expect(f.pending.status).toBe('confirmation_required')
      expect(f.writes).not.toHaveBeenCalled()
      expect((await decide(String(f.pending.confirmationUrl), 'approve')).status).toBe(200)
      const result = await f.call('opengui_act', { ...f.action, confirmationRequestId: f.pending.requestId })
      expect(result.isError).not.toBe(true)
      expect(result.structuredContent!.observationId).not.toBe(f.action.observationId)
      expect(f.writes).toHaveBeenCalledTimes(1)
      expect((await f.call('opengui_act', { ...f.action, confirmationRequestId: f.pending.requestId })).isError).toBe(true)
      expect(f.writes).toHaveBeenCalledTimes(1)
    } finally { await f.close() }
  })

  it.each(['reject', 'refresh', 'cancel', 'changed-frame', 'tamper'] as const)('never dispatches after %s', async reason => {
    const f = await fixture()
    try {
      await decide(String(f.pending.confirmationUrl), reason === 'reject' ? 'reject' : 'approve')
      if (reason === 'refresh') await f.call('opengui_observe', { sessionId: f.action.sessionId })
      if (reason === 'cancel') await f.call('opengui_cancel', { sessionId: f.action.sessionId })
      if (reason === 'changed-frame') await f.change()
      const result = await f.call('opengui_act', { ...f.action, ...(reason === 'tamper' ? { key: 'Home' } : {}), confirmationRequestId: f.pending.requestId })
      expect(result.isError).toBe(true)
      expect(f.writes).not.toHaveBeenCalled()
    } finally { await f.close() }
  })
})
