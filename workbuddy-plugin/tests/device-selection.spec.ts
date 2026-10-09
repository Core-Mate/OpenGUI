import { describe, expect, it, vi } from 'vitest'
import { WorkBuddyOpenGuiService, createControlTask } from '../src/service.ts'
import { callOpenGuiTool, validateToolArguments } from '../src/tools.ts'
import { AutomationCoordinator } from '../src/automation.ts'
import { FakeHost } from './fake-host.ts'
import { setup, connect } from './viewer-fixture.ts'

function fixture() {
  const f = setup(), host = new FakeHost(), signal = AbortSignal.timeout(10_000)
  host.devices.splice(0, 2,
    { id: 'phone-a', name: 'Pixel', model: 'Pixel 9', manufacturer: 'Google', os: 'android', osVersion: '15', sdk: 35, connection: 'usb', serialSuffix: '1111', serial: 'private-1111', state: 'device', connected: true, authorized: true },
    { id: 'phone-b', name: 'Pixel', model: 'Pixel 9', manufacturer: 'Google', os: 'android', osVersion: '14', sdk: 34, connection: 'usb', serialSuffix: '2222', serial: 'private-2222', state: 'device', connected: true, authorized: true },
  )
  const service = new WorkBuddyOpenGuiService({ host, viewers: f.viewer })
  return { ...f, host, service, signal }
}
function action(url: string, workbenchUrl: string, input: Record<string, unknown>, token = new URL(workbenchUrl).hash.slice(7)) {
  return fetch(`${url}board`, { method: 'POST', headers: { Origin: new URL(url).origin, 'Content-Type': 'application/json', 'X-OpenGUI-Board': token }, body: JSON.stringify(input) })
}

describe('task-preserving graphical device selection', () => {
  it('keeps the original host task across a waiting final stop and device confirmation, while honoring explicit interruption', async () => {
    const f = fixture(), coordinator = new AutomationCoordinator(f.service)
    try {
      const args = { objective: 'Preserve the host request', successCriteria: 'Stop before submit' }
      const prepare = await coordinator.event({ session_id: 'host-wait', hook_event_name: 'PreToolUse', tool_name: 'opengui_open_viewer', tool_input: args })
      const task = coordinator.consume(prepare.hostContext, 'opengui_open_viewer', args)!
      const opened = await f.service.openViewer(undefined, f.signal, { ...args, owner: task.id, task: task.execution })
      expect(await coordinator.event({ session_id: 'host-wait', hook_event_name: 'FinalStop' })).toEqual({})
      expect(task.outcome).toBe('active'); expect(task.controller.signal.aborted).toBe(false)
      expect((await action(opened.url, opened.workbenchUrl, { action: 'select_device', deviceId: 'phone-b' })).status).toBe(200)
      await coordinator.event({ session_id: 'host-wait', hook_event_name: 'UserPromptSubmit' })
      const nextArgs = { viewerId: opened.viewerId }
      const next = await coordinator.event({ session_id: 'host-wait', hook_event_name: 'PreToolUse', tool_name: 'opengui_open_session', tool_input: nextArgs })
      expect(coordinator.consume(next.hostContext, 'opengui_open_session', nextArgs)).toBe(task)
      const session = await f.service.openSession(undefined, f.signal, 'control', { owner: task.id, task: task.execution, viewerId: opened.viewerId })
      coordinator.attach(task, session.sessionId, true)
      expect(session).toMatchObject({ objective: args.objective, successCriteria: args.successCriteria, devices: [{ id: 'phone-b' }] })
      await coordinator.event({ session_id: 'host-wait', hook_event_name: 'FinalStop', final_stop_reason: 'interrupted' })
      expect(task.outcome).toBe('cancelled'); expect(task.controller.signal.aborted).toBe(true)
      expect(f.service.findSession(session.sessionId)?.state).toBe('cancelled')
    } finally { await f.service.dispose() }
  })

  it('lists distinct metadata without serials and binds only the human-selected phone before a fresh display', async () => {
    const f = fixture(), observe = vi.spyOn(f.host, 'observe'), act = vi.spyOn(f.host, 'act')
    try {
      const opened = await f.service.openViewer(undefined, f.signal, { objective: 'Check the original form', successCriteria: 'Stop before submit' })
      expect(opened).toMatchObject({ selectionRequired: true, selectionRequested: true, firstDisplayEstablished: false, devices: [], board: { objective: 'Check the original form' } })
      expect(f.prepare).not.toHaveBeenCalled()
      const inventory = await fetch(`${opened.url}devices?refresh=1`).then(r => r.json())
      expect(inventory.devices).toEqual(expect.arrayContaining([
        expect.objectContaining({ id: 'phone-a', osVersion: '15', serialSuffix: '1111', selectable: true }),
        expect.objectContaining({ id: 'phone-b', osVersion: '14', serialSuffix: '2222', selectable: true }),
        expect.objectContaining({ id: 'locked', selectionStatus: 'requires_authorization', selectable: false }),
      ]))
      expect(JSON.stringify(inventory)).not.toContain('private-')
      expect(inventory.devices.find((device: { id: string }) => device.id === 'locked').connectionHint).toMatchObject({ label: '需要手机授权', warning: true })
      expect((await action(opened.url, opened.workbenchUrl, { action: 'select_device', deviceId: 'phone-b' }, '')).status).toBe(403)
      expect((await action(opened.url, opened.workbenchUrl, { action: 'select_device', deviceId: 'phone-b', deviceIds: ['phone-a'] })).status).toBe(400)
      const chosen = await action(opened.url, opened.workbenchUrl, { action: 'select_device', deviceId: 'phone-b' }).then(r => r.json())
      expect(chosen).toMatchObject({ viewerId: opened.viewerId, state: 'waiting_for_frame', firstDisplayEstablished: false, selectionRequired: false, board: { objective: 'Check the original form', successCriteria: 'Stop before submit' }, devices: [{ id: 'phone-b', osVersion: '14' }] })
      expect(f.prepare).toHaveBeenCalledTimes(1)
      expect(observe).not.toHaveBeenCalled(); expect(act).not.toHaveBeenCalled()
      const session = await f.service.openSession(undefined, f.signal, 'control', { viewerId: opened.viewerId })
      expect(session).toMatchObject({ objective: 'Check the original form', successCriteria: 'Stop before submit', devices: [{ id: 'phone-b' }] })
      const boundInventory = await fetch(`${opened.url}devices`).then(r => r.json())
      expect(boundInventory.devices.find((device: { id: string }) => device.id === 'phone-b')).toMatchObject({ busy: true, selected: true, selectable: false, connectionHint: { label: '已连接', warning: false } })
      await expect(f.service.observe(session.sessionId, undefined, f.signal)).rejects.toThrow('waiting_for_frame')
      const page = await connect(opened.url, 'phone-b')
      f.sinks.get('phone-b')!.sendBinary(Buffer.from([2])); expect((await page.receipt()).status).toBe(200)
      await f.service.observe(session.sessionId, undefined, f.signal)
      expect(observe).toHaveBeenCalledTimes(1)
      expect((await action(opened.url, opened.workbenchUrl, { action: 'select_device', deviceId: 'phone-a' })).status).toBe(400)
      await expect(f.service.openViewer(['phone-a'], f.signal)).rejects.toThrow('device_frozen')
    } finally { await f.service.dispose() }
  })

  it('preserves a waiting goal and plan when detecting a single newly connected phone', async () => {
    const f = fixture()
    try {
      const saved = f.host.devices.splice(0), task = createControlTask()
      const opened = await f.service.openViewer(undefined, f.signal, { task, objective: 'Continue this test', successCriteria: 'Navigation only' })
      const plan = f.viewer.writeTodos(opened.viewerId, 'local', [{ content: 'Inspect the original page', status: 'pending' }])
      f.host.devices.push(saved[1]!)
      const refresh = await fetch(`${opened.url}devices?refresh=1`).then(r => r.json())
      expect(refresh.devices).toHaveLength(1)
      const rebound = await f.service.openViewer(undefined, f.signal, { task })
      expect(rebound).toMatchObject({ viewerId: opened.viewerId, board: { objective: 'Continue this test', successCriteria: 'Navigation only' }, devices: [{ id: 'phone-b' }], todos: plan.todos })
      expect(task.selectedDeviceIds).toEqual(['phone-b'])
      expect(rebound.firstDisplayEstablished).toBe(false)
    } finally { await f.service.dispose() }
  })

  it('does not freeze an unbound guide on failed control and preserves goals supplied through the tool', async () => {
    const f = fixture(), task = createControlTask()
    try {
      validateToolArguments('opengui_open_guide', { objective: 'Keep this request', successCriteria: 'No submission' })
      const opened = await callOpenGuiTool(f.service, 'opengui_open_guide', { objective: 'Keep this request', successCriteria: 'No submission' }, f.signal, { task }) as Awaited<ReturnType<typeof f.service.openGuide>>
      await expect(f.service.openSession(['phone-a'], f.signal, 'control', { task, viewerId: opened.viewerId })).rejects.toThrow('display_required')
      expect(task.selectedDeviceIds).toBeUndefined()
      expect((await action(opened.url, opened.workbenchUrl, { action: 'select_device', deviceId: 'phone-b' })).status).toBe(200)
      expect(task.selectedDeviceIds).toEqual(['phone-b'])
      expect(f.viewer.board(opened.viewerId).objective).toBe('Keep this request')
    } finally { await f.service.dispose() }
  })

  it('rejects unavailable, unauthorized, occupied and incompatible phones without preparing video', async () => {
    const f = fixture()
    try {
      f.host.devices.push({ id: 'old', name: 'Old phone', os: 'android', sdk: 19, osVersion: '4.4', serial: 'old-private', state: 'device', connected: true, authorized: true })
      const opened = await f.service.openGuide(f.signal)
      for (const id of ['missing', 'locked', 'old']) expect((await action(opened.url, opened.workbenchUrl, { action: 'select_device', deviceId: id })).status).toBe(400)
      expect(f.prepare).not.toHaveBeenCalled()
      const other = await f.service.openViewer(['phone-a'], f.signal, { owner: 'other-task' })
      await f.service.openSession(['phone-a'], f.signal, 'control', { owner: 'other-task', viewerId: other.viewerId })
      const inventory = await fetch(`${opened.url}devices`).then(r => r.json())
      expect(inventory.devices.find((d: {id: string}) => d.id === 'phone-a')).toMatchObject({ busy: true, selectable: false })
      expect((await action(opened.url, opened.workbenchUrl, { action: 'select_device', deviceId: 'phone-a' })).status).toBe(400)
      expect(f.viewer.selectedDeviceIds(opened.viewerId)).toEqual([])
    } finally { await f.service.dispose() }
  })

  it('does not reset a failed first-display gate by confirming again', async () => {
    const f = fixture()
    try {
      const opened = await f.service.openGuide(f.signal)
      expect((await action(opened.url, opened.workbenchUrl, { action: 'select_device', deviceId: 'phone-b' })).status).toBe(200)
      f.advance(30_001)
      expect((await action(opened.url, opened.workbenchUrl, { action: 'select_device', deviceId: 'phone-b' })).status).toBe(400)
      expect(await f.viewer.status(opened.viewerId, 'local')).toMatchObject({ state: 'error', errorCode: 'display_timeout' })
      await expect(f.service.openSession(undefined, f.signal, 'control', { viewerId: opened.viewerId })).rejects.toThrow('display_timeout')
      expect(f.prepare).toHaveBeenCalledTimes(1)
    } finally { await f.service.dispose() }
  })

  it('leaves the guide unbound on preparation failure and refuses binding if the task ends during preparation', async () => {
    const f = fixture()
    try {
      const opened = await f.service.openGuide(f.signal)
      f.prepare.mockRejectedValueOnce(new Error('prepare failed'))
      expect((await action(opened.url, opened.workbenchUrl, { action: 'select_device', deviceId: 'phone-b' })).status).toBe(400)
      expect(f.viewer.selectedDeviceIds(opened.viewerId)).toEqual([])
      let release!: () => void
      f.prepare.mockImplementationOnce(() => new Promise<void>(resolve => { release = resolve }))
      const pending = action(opened.url, opened.workbenchUrl, { action: 'select_device', deviceId: 'phone-b' })
      await vi.waitFor(() => expect(release).toBeTypeOf('function'))
      f.viewer.endTask(opened.viewerId); release()
      expect((await pending).status).toBe(400)
      expect(f.viewer.selectedDeviceIds(opened.viewerId)).toEqual([])
    } finally { await f.service.dispose() }
  })
})
