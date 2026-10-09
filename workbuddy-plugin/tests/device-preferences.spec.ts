import { mkdtempSync, readFileSync, rmSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { CoreMateClient } from '../src/coremate-client.ts'
import { WorkBuddyOpenGuiService, createControlTask } from '../src/service.ts'
import { FakeHost } from './fake-host.ts'
import { setup } from './viewer-fixture.ts'

const resources: Array<() => Promise<void> | void> = []
afterEach(async () => { for (const close of resources.splice(0).reverse()) await close() })
async function fixture() {
  const directory = mkdtempSync(join(tmpdir(), 'opengui-device-preference-'))
  resources.push(() => rmSync(directory, { recursive: true, force: true }))
  let userId = 42
  const request = vi.fn(async (url: string) => new Response(JSON.stringify(url.endsWith('verify-otp')
    ? { token: 'fixture-session', user: { id: userId, phoneNumber: '13800001234' } }
    : url.endsWith('/runtime') ? { revision: 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb' } : { success: true }))) as unknown as typeof fetch
  const client = new CoreMateClient(directory, request)
  client.configure('http://127.0.0.1:1'); await client.login('13800001234', '123456')
  const create = (account = client) => {
    const view = setup(account), host = new FakeHost(), service = new WorkBuddyOpenGuiService({ viewers: view.viewer, host, account })
    resources.push(() => service.dispose())
    return { ...view, host, service }
  }
  const action = (opened: { url: string; workbenchUrl: string }, deviceId: string) => fetch(`${opened.url}board`, {
    method: 'POST', headers: { Origin: new URL(opened.url).origin, 'Content-Type': 'application/json', 'X-OpenGUI-Board': new URL(opened.workbenchUrl).hash.slice(7) }, body: JSON.stringify({ action: 'select_device', deviceId }),
  })
  return { client, request, create, directory, action, signal: AbortSignal.timeout(5000), switchUser: (id: number) => { userId = id } }
}

describe('account-scoped original device preferences', () => {
  it.each(['discovery', 'resolution', 'preparation'] as const)('rejects an account change during %s instead of inheriting its device preference', async stage => {
    const f = await fixture(), run = f.create(), task = createControlTask(); f.client.selectDevice('phone-b')
    if (stage === 'discovery') {
      const original = run.host.listDevices.bind(run.host)
      run.host.listDevices = async () => { await f.client.logout(); return original() }
    } else if (stage === 'resolution') {
      const original = run.host.resolveDevices.bind(run.host)
      run.host.resolveDevices = async ids => { await f.client.logout(); return original(ids) }
    } else run.prepare.mockImplementationOnce(async () => { await f.client.logout() })
    await expect(run.service.openViewer(undefined, f.signal, { owner: 'account-race', task })).rejects.toThrow('account_changed')
    expect(task.selectedDeviceIds).toBeUndefined(); expect(f.client.preferredDeviceId).toBeUndefined()
    expect(run.sinks.size).toBe(0)
  })

  it('persists the confirmed opaque device id and reuses it after restart without granting display or control', async () => {
    const f = await fixture(), first = f.create(), opening = await first.service.openViewer(undefined, f.signal, { owner: 'first', objective: 'Inspect the selected phone' })
    expect(opening.devices).toEqual([]); expect(f.client.preferredDeviceId).toBeUndefined()
    expect((await f.action(opening, 'phone-b')).status).toBe(200)
    expect(f.client.preferredDeviceId).toBe('phone-b')
    const restarted = new CoreMateClient(f.directory, f.request), next = f.create(restarted), act = vi.spyOn(next.host, 'act'), observe = vi.spyOn(next.host, 'observe')
    const opened = await next.service.openViewer(undefined, f.signal, { owner: 'next' })
    expect(opened).toMatchObject({ firstDisplayEstablished: false, devices: [{ id: 'phone-b' }] })
    const catalog = await fetch(`${opened.url}devices`).then(r => r.json())
    expect(catalog.preferredDeviceId).toBe('phone-b'); expect(catalog.devices.find((device: { id: string }) => device.id === 'phone-b').preferred).toBe(true)
    const session = await next.service.openSession(undefined, f.signal, 'control', { owner: 'next', viewerId: opened.viewerId })
    await expect(next.service.observe(session.sessionId, undefined, f.signal)).rejects.toThrow('waiting_for_frame')
    expect(observe).not.toHaveBeenCalled(); expect(act).not.toHaveBeenCalled()
    const stored = readFileSync(join(f.directory, 'account.json'), 'utf8')
    expect(stored).not.toContain('serial-b'); expect(stored).not.toContain('13800001234')
    if (process.platform !== 'win32') expect(statSync(join(f.directory, 'account.json')).mode & 0o077).toBe(0)
  })

  it('preserves device preferences while ignoring retired model choices across account logout and service changes', async () => {
    const f = await fixture()
    f.client.selectModel('Published fixture'); f.client.selectDevice('phone-b'); f.client.selectModel()
    expect(f.client.preferredDeviceId).toBe('phone-b'); f.client.selectModel('Other fixture')
    await f.client.logout(); expect(f.client.preferredDeviceId).toBeUndefined()
    await f.client.login('13800001234', '123456'); expect(f.client.preferredDeviceId).toBe('phone-b')
    const saved = JSON.parse(readFileSync(join(f.directory, 'account.json'), 'utf8'))
    expect(saved.preferences[f.client.scope]).toEqual({ device: 'phone-b' })
    await f.client.logout(); f.switchUser(43); await f.client.login('13800001234', '123456')
    expect(f.client.preferredDeviceId).toBeUndefined(); f.client.selectDevice('phone-a')
    f.client.configure('http://127.0.0.1:2'); await f.client.login('13800001234', '123456'); expect(f.client.preferredDeviceId).toBeUndefined()
    f.client.configure('http://127.0.0.1:1'); await f.client.login('13800001234', '123456'); expect(f.client.preferredDeviceId).toBe('phone-a')
    await f.client.logout(); f.switchUser(42); await f.client.login('13800001234', '123456'); expect(f.client.preferredDeviceId).toBe('phone-b')
  })

  it.each(['offline', 'unauthorized', 'missing', 'incompatible'] as const)('requires an explicit new selection when the preferred device is %s even if one alternative is usable', async condition => {
    const f = await fixture(), run = f.create(); f.client.selectDevice('phone-b')
    const preferred = run.host.devices.find(device => device.id === 'phone-b')!
    if (condition === 'offline') { preferred.connected = false; preferred.state = 'offline' }
    if (condition === 'unauthorized') preferred.authorized = false
    if (condition === 'missing') run.host.devices.splice(run.host.devices.indexOf(preferred), 1)
    if (condition === 'incompatible') Object.assign(preferred, { os: 'android', sdk: 19 })
    const opened = await run.service.openViewer(undefined, f.signal, { objective: 'Keep the original request' })
    expect(opened).toMatchObject({ selectionRequired: true, devices: [], board: { objective: 'Keep the original request' } })
    expect(run.prepare).not.toHaveBeenCalled(); expect(f.client.preferredDeviceId).toBe('phone-b')
    expect((await f.action(opened, 'phone-a')).status).toBe(200)
    expect(run.viewer.selectedDeviceIds(opened.viewerId)).toEqual(['phone-a']); expect(f.client.preferredDeviceId).toBe('phone-a')
  })

  it('keeps an occupied preference instead of silently choosing the remaining phone', async () => {
    const f = await fixture(), run = f.create(), occupied = await run.service.openViewer(['phone-b'], f.signal, { owner: 'occupied' })
    await run.service.openSession(['phone-b'], f.signal, 'control', { owner: 'occupied', viewerId: occupied.viewerId })
    const opening = await run.service.openViewer(undefined, f.signal, { owner: 'waiting', objective: 'Wait for the original phone' })
    expect(opening.devices).toEqual([]); expect(f.client.preferredDeviceId).toBe('phone-b')
    const inventory = await fetch(`${opening.url}devices`).then(r => r.json())
    expect(inventory.devices.find((device: { id: string }) => device.id === 'phone-b')).toMatchObject({ preferred: true, busy: true, selectable: false })
  })

  it('honors an explicit device and a frozen task before a later preference change', async () => {
    const f = await fixture(), run = f.create(); f.client.selectDevice('phone-b')
    const task = createControlTask(), opened = await run.service.openViewer(['phone-a'], f.signal, { owner: 'original', task })
    expect(f.client.preferredDeviceId).toBe('phone-a'); f.client.selectDevice('phone-b')
    const same = await run.service.openViewer(undefined, f.signal, { owner: 'original', task })
    expect(same.viewerId).toBe(opened.viewerId); expect(same.devices.map(device => device.id)).toEqual(['phone-a'])
    await expect(run.service.openViewer(['phone-b'], f.signal, { owner: 'original', task })).rejects.toThrow('device_frozen')
  })

  it('does not save failed preparation or conceal a preference write failure after successful binding', async () => {
    const f = await fixture(), run = f.create(), opened = await run.service.openGuide(f.signal)
    run.prepare.mockRejectedValueOnce(new Error('fixture preparation failed'))
    expect((await f.action(opened, 'phone-b')).status).toBe(400); expect(f.client.preferredDeviceId).toBeUndefined()
    vi.spyOn(f.client, 'selectDevice').mockImplementation(() => { throw new Error('private disk failure detail') })
    const reply = await f.action(opened, 'phone-b').then(r => r.json())
    expect(reply.devices.map((device: { id: string }) => device.id)).toEqual(['phone-b'])
    expect(reply.devicePreferenceError).toContain('偏好未保存'); expect(JSON.stringify(reply)).not.toContain('private disk failure detail')
    expect(f.client.preferredDeviceId).toBeUndefined()
  })

  it('does not project the current account preference into a viewer from another account', async () => {
    const f = await fixture(), run = f.create(), old = await run.service.openGuide(f.signal)
    await f.client.logout(); f.switchUser(43); await f.client.login('13800001234', '123456'); f.client.selectDevice('phone-b')
    const inventory = await fetch(`${old.url}devices`).then(r => r.json())
    expect(inventory.preferredDeviceId).toBeUndefined(); expect(inventory.devices.every((device: { preferred: boolean }) => !device.preferred)).toBe(true)
    expect((await f.action(old, 'phone-b')).status).toBe(400)
  })
})
