import { mkdtempSync, rmSync } from 'node:fs'
import { request } from 'node:http'
import type { Duplex } from 'node:stream'
import sharp from 'sharp'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { WorkBuddyOpenGuiService } from '../src/service.ts'
import { CoreMateClient } from '../src/coremate-client.ts'
import { AutomationCoordinator } from '../src/automation.ts'
import { FakeHost } from './fake-host.ts'
import { setup, connect } from './viewer-fixture.ts'

const cleanups: Array<() => unknown> = []
afterEach(async () => { for (const cleanup of cleanups.splice(0).reverse()) await cleanup() })

async function fixture(signedIn = true) {
  const directory = mkdtempSync(join(tmpdir(), 'opengui-start-')); cleanups.push(() => rmSync(directory, { recursive: true, force: true }))
  const catalog = { success: true, data: [{ id: 63, agentName: 'gui-agent-core', phoneModelKind: 'text', configName: 'Deepseek', modelName: 'deepseek-v4.1-flash', baseUrl: 'https://provider.example/v1', hasApiKey: true, apiKey: null, isActive: true, updatedAt: '2026-09-16T11:53:56.433Z', extra: {} }] }
  const account = new CoreMateClient(directory, (async (url: string) => new Response(JSON.stringify(url.endsWith('/desktop-text-models') ? catalog : { token: 'fixture-session', user: { id: 42, phoneNumber: '13800001234' } }))) as typeof fetch)
  account.configure('https://backend.example.test')
  if (signedIn) await account.login('13800001234', '123456')
  const { viewer, sinks } = setup(account), host = new FakeHost()
  const service = new WorkBuddyOpenGuiService({ host, viewers: viewer, account, confirmStart: true }), signal = AbortSignal.timeout(5000)
  cleanups.push(() => service.dispose())
  const opened = await service.openViewer(['phone-b'], signal, { owner: 'host-task', objective: 'Check the login page' })
  const action = (body: Record<string, unknown>) => fetch(`${opened.url}board`, { method: 'POST', headers: { Origin: new URL(opened.url).origin, 'Content-Type': 'application/json', 'X-OpenGUI-Board': new URL(opened.workbenchUrl).hash.slice(7) }, body: JSON.stringify(body) })
  return { account, viewer, sinks, host, service, signal, opened, action }
}

function previewStream(url: string, deviceId: string): Promise<Duplex> {
  return new Promise((resolve, reject) => {
    const req = request(`${url}preview-stream?deviceId=${deviceId}`, { headers: { Origin: new URL(url).origin, Upgrade: 'websocket', Connection: 'Upgrade', 'Sec-WebSocket-Key': 'MDEyMzQ1Njc4OWFiY2RlZg==', 'Sec-WebSocket-Version': '13' } })
    req.on('upgrade', (_res, socket) => { cleanups.push(() => socket.destroy()); socket.resume(); resolve(socket) })
    req.on('response', res => { res.resume(); reject(new Error(String(res.statusCode))) })
    req.on('error', reject); req.end()
  })
}

describe('start confirmation before execution', () => {
  it('opens the workbench without binding a device or allowing control until the person starts', async () => {
    const f = await fixture()
    expect(f.opened).toMatchObject({ startRequired: true, suggestedDeviceId: 'phone-b', nextAction: 'wait_for_user_start', devices: [] })
    const prepare = vi.spyOn(f.host, 'observe')
    await expect(f.service.openSession(['phone-b'], f.signal, 'control', { owner: 'host-task', viewerId: f.opened.viewerId })).rejects.toThrow('start_required')
    expect(prepare).not.toHaveBeenCalled()
    expect(f.service.viewers.awaitingDeviceTask(f.opened.viewerId)).toBe(true)
    // A bounded status wait returns while still waiting for the person.
    expect(await f.service.viewers.status(f.opened.viewerId, 'host-task', 0)).toMatchObject({ startRequired: true, firstDisplayEstablished: false })
  })

  it('starts with WorkBuddy and the confirmed device, then requires the first frame', async () => {
    const f = await fixture()
    expect((await f.action({ action: 'start', modelId: '63', deviceId: 'phone-a' })).status).toBe(400)
    expect((await f.action({ action: 'start', modelId: 'host', deviceId: 'phone-a' })).status).toBe(200)
    const status = await f.service.viewers.status(f.opened.viewerId, 'host-task', 0)
    expect(status).toMatchObject({ startRequired: false, devices: [{ id: 'phone-a' }], state: 'waiting_for_frame', board: { model: '跟随 WorkBuddy' } })
    expect(await f.account.selectedModel(AbortSignal.timeout(1000))).toBeUndefined()
    expect(f.account.preferredDeviceId).toBe('phone-a')
    expect((await f.action({ action: 'start', modelId: 'host', deviceId: 'phone-a' })).status).toBe(400)
    const page = await connect(f.opened.url, 'phone-a')
    f.sinks.get('phone-a')!.sendBinary(Buffer.from([2])); await page.receipt()
    const session = await f.service.openSession(['phone-a'], f.signal, 'control', { owner: 'host-task', viewerId: f.opened.viewerId })
    expect(session.executor).toMatchObject({ mode: 'workbuddy' })
  })

  it('requires sign-in before starting and keeps the host turn waiting for the start', async () => {
    const f = await fixture(false)
    const rejected = await f.action({ action: 'start', modelId: 'host', deviceId: 'phone-b' })
    expect(rejected.status).toBe(400)
    expect((await rejected.json()).error).toContain('请先登录')
    expect(f.service.viewers.awaitingStart(f.opened.viewerId)).toBe(true)
    // The host's Stop hook is held (bounded) while the workbench waits for 开始执行.
    const automation = new AutomationCoordinator(f.service)
    const claim = await automation.event({ hook_event_name: 'PreToolUse', session_id: 'host', tool_name: 'opengui_open_viewer', tool_input: { objective: 'Another check' } })
    const task = automation.consume(claim.hostContext, 'opengui_open_viewer', { objective: 'Another check' })!
    await f.service.openViewer(undefined, f.signal, { task: task.execution, owner: task.id, objective: 'Another check' })
    const stop = await automation.event({ hook_event_name: 'Stop', session_id: 'host' })
    expect(stop).toMatchObject({ decision: 'block' })
    expect(String(stop.reason)).toContain('开始执行')
  })

  it('records 发内容前需要审核 from the start page, off unless the person checks it', async () => {
    const f = await fixture()
    expect((await f.action({ action: 'start', modelId: 'host', deviceId: 'phone-a', contentReview: 'yes' })).status).toBe(400)
    expect((await f.action({ action: 'start', modelId: 'host', deviceId: 'phone-a', contentReview: true })).status).toBe(200)
    expect(f.service.viewers.board(f.opened.viewerId).contentReview).toBe(true)
    const g = await fixture()
    expect((await g.action({ action: 'start', modelId: 'host', deviceId: 'phone-a' })).status).toBe(200)
    expect(g.service.viewers.board(g.opened.viewerId).contentReview).toBeUndefined()
  })

  it('shows a candidate device live only while the person is choosing', async () => {
    const f = await fixture()
    const socket = await previewStream(f.opened.url, 'phone-a')
    await vi.waitFor(() => expect(f.sinks.has('phone-a')).toBe(true))
    // The preview never counts as the task's display.
    expect(await f.service.viewers.status(f.opened.viewerId, 'host-task', 0)).toMatchObject({ startRequired: true, devices: [], firstDisplayEstablished: false })
    await expect(previewStream(f.opened.url, 'phone-unknown')).rejects.toThrow('403')
    vi.spyOn(f.host, 'preview').mockResolvedValue(await sharp({ create: { width: 1080, height: 2340, channels: 3, background: '#fff' } }).png().toBuffer())
    const frame = await fetch(`${f.opened.url}device-preview?deviceId=phone-a`)
    expect(frame.status).toBe(200); expect(frame.headers.get('content-type')).toBe('image/jpeg')
    expect((await sharp(Buffer.from(await frame.arrayBuffer())).metadata()).height).toBe(640)
    const closed = new Promise(resolve => socket.once('close', resolve))
    expect((await f.action({ action: 'start', modelId: 'host', deviceId: 'phone-a' })).status).toBe(200)
    await closed
    expect((await fetch(`${f.opened.url}device-preview?deviceId=phone-a`)).status).toBe(409)
    await expect(previewStream(f.opened.url, 'phone-a')).rejects.toThrow('403')
  })
})
