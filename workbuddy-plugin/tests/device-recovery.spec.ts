import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import sharp from 'sharp'
import { afterEach, describe, expect, it, vi } from 'vitest'
const io = vi.hoisted(() => ({ adb: vi.fn(), mirror: { open: vi.fn(), inspect: vi.fn(), status: vi.fn(), stop: vi.fn(), dispose: vi.fn() } }))
vi.mock('../src/adb.ts', async original => ({ ...await original<object>(), assertAdbReady: async () => {}, runAdb: io.adb }))
vi.mock('../src/mirror.ts', () => ({ NativeMirror: class { constructor() { return io.mirror } } }))
import { LocalAdbPhoneHost, WorkBuddyOpenGuiService } from '../src/service.ts'
import { TaskStore, type StoredTask } from '../src/task-store.ts'
import { Workbench } from '../src/workbench.ts'
import { setup, connect } from './viewer-fixture.ts'

const roots: string[] = []
afterEach(() => { for (const path of roots.splice(0)) rmSync(path, { recursive: true, force: true }); vi.clearAllMocks() })
const taskId = 'cccccccc-cccc-cccc-cccc-cccccccccccc'
async function fixture() {
  const directory = mkdtempSync(join(tmpdir(), 'opengui-device-recovery-')); roots.push(directory)
  const store = new TaskStore(join(directory, 'reports'))
  const image = await sharp({ create: { width: 100, height: 200, channels: 3, background: '#334155' } }).png().toBuffer()
  let rows = 'private-original device model:Same_Model\nprivate-other device model:Same_Model\n'
  io.adb.mockImplementation(async (_path: string, args: string[]) => {
    if (args[0] === 'devices') return 'List of devices attached\n' + rows
    if (args.at(-1) === 'ro.product.manufacturer') return 'Test'
    if (args.at(-1) === 'ro.build.version.release') return '15'
    if (args.at(-1) === 'ro.build.version.sdk') return '35'
    if (args.includes('screencap')) return image
    if (args.includes('wm')) return 'Physical size: 100x200\n'
    if (args.includes('dumpsys')) return 'mCurrentFocus=Window{ u0 com.example/.Main }\n'
    return ''
  })
  const oldHost = new LocalAdbPhoneHost({ stateDir: directory }), signal = AbortSignal.timeout(10_000)
  const [original] = (await oldHost.inspectDevices(signal)).filter(d => d.serial === 'private-original')
  await oldHost.dispose()
  const board = new Workbench()
  board.objective = 'Inspect the original form'; board.successCriteria = 'Stop before submit'
  const review = board.requestReview({ account: 'qa', target: 'post:1', context: 'Source', draft: 'Original draft' }); board.decide(review.id, 'approve', 'Human final text')
  const trace = board.begin(original!.id, 'observe', Date.now()); board.finish(trace, Date.now(), 'executed', 'old-observation')
  const saved: StoredTask = { version: 1, id: taskId, owner: 'old-host', devices: [original!], board: board.snapshot(), todos: [{ stepId: 'original-step', content: 'Inspect the page', status: 'in_progress' }], updatedAt: new Date().toISOString() }
  store.save(saved, board.markdown(saved.todos))
  const f = setup(undefined, store), host = new LocalAdbPhoneHost({ stateDir: directory }), service = new WorkBuddyOpenGuiService({ host, viewers: f.viewer })
  return { ...f, host, service, store, signal, original: original!, saved, setRows: (value: string) => { rows = value } }
}

describe('original-phone archive recovery across host instances', () => {
  it('restores an unbound connection guide without losing its goal or disabling selection', async () => {
    const f = await fixture()
    try {
      f.saved.devices = []; f.saved.board.traces = []; f.saved.board.reviews = []
      f.saved.todos = [{ stepId: 'original-step', content: 'Inspect the page', status: 'pending' }]
      f.store.save(f.saved, 'Waiting for connection')
      const opened = await f.service.openViewer(undefined, f.signal, { resumeTaskId: taskId })
      expect(opened).toMatchObject({ viewerId: taskId, selectionRequired: true, selectionRequested: true, canSelectDevice: true, board: { objective: f.saved.board.objective, control: 'idle' }, todos: f.saved.todos })
      const response = await fetch(`${opened.url}board`, { method: 'POST', headers: { Origin: new URL(opened.url).origin, 'Content-Type': 'application/json', 'X-OpenGUI-Board': new URL(opened.workbenchUrl).hash.slice(7) }, body: JSON.stringify({ action: 'select_device', deviceId: f.original.id }) })
      expect(response.status).toBe(200)
      expect(await response.json()).toMatchObject({ viewerId: taskId, firstDisplayEstablished: false, selectionRequired: false, board: { objective: f.saved.board.objective }, todos: f.saved.todos })
    } finally { await f.service.dispose() }
  })

  it('resolves the original device with a new host and requires fresh viewing, review and observations', async () => {
    const f = await fixture()
    try {
      expect((await f.host.inspectDevices(f.signal)).find(d => d.serial === f.original.serial)?.id).toBe(f.original.id)
      const opened = await f.service.openViewer(undefined, f.signal, { resumeTaskId: taskId, owner: 'new-host' })
      expect(opened).toMatchObject({ viewerId: taskId, firstDisplayEstablished: false, devices: [{ id: f.original.id }], board: { objective: f.saved.board.objective, successCriteria: f.saved.board.successCriteria, reviews: [{ status: 'pending', draft: 'Human final text' }] }, todos: f.saved.todos })
      const session = await f.service.openSession(undefined, f.signal, 'control', { owner: 'new-host', viewerId: taskId })
      expect(session.devices[0]).toMatchObject({ id: f.original.id, operationCount: 1, remainingOperations: 99 })
      await expect(f.service.observe(session.sessionId, undefined, f.signal, undefined, undefined, 'original-step')).rejects.toThrow('waiting_for_frame')
      const page = await connect(opened.url, f.original.id)
      f.sinks.get(f.original.id)!.sendBinary(Buffer.from([2])); await page.receipt()
      await expect(f.service.act(session.sessionId, undefined, { action: 'key', key: 'Home', observationId: 'old-observation', stepId: 'original-step' }, f.signal)).rejects.toMatchObject({ code: 'observation_required' })
      const fresh = await f.service.observe(session.sessionId, undefined, f.signal, undefined, undefined, 'original-step')
      expect(fresh.observationId).not.toBe('old-observation')
      expect((await f.service.status(session.sessionId, f.signal)).devices[0]).toMatchObject({ connected: true, authorized: true, operationCount: 2 })
      expect(JSON.stringify(opened)).not.toContain(f.original.serial)
      expect(io.adb.mock.calls.filter(([, args]) => args.includes('keyevent'))).toHaveLength(0)
    } finally { await f.service.dispose() }
  })

  it('restores a legacy random id by exact serial and remaps trace budget without changing goals', async () => {
    const f = await fixture()
    try {
      const oldId = 'old-random-phone-id'
      f.saved.devices = [{ ...f.original, id: oldId }]; f.saved.board.traces[0]!.deviceId = oldId
      f.saved.board.connectionRecovery = { deviceId: oldId, detectedAt: new Date().toISOString(), status: 'waiting_observation' }
      f.store.save(f.saved, 'Legacy report')
      const opened = await f.service.openViewer([oldId], f.signal, { resumeTaskId: taskId })
      expect(opened.devices[0]?.id).toBe(f.original.id)
      expect(opened.board.traces[0]?.deviceId).toBe(f.original.id)
      expect(opened.board.objective).toBe(f.saved.board.objective)
      expect(opened.board.connectionRecovery).toMatchObject({ deviceId: f.original.id, status: 'waiting_recheck' })
      expect(opened.todos).toEqual(f.saved.todos)
      const session = await f.service.openSession(undefined, f.signal, 'control', { viewerId: taskId })
      expect(session.controlMode).toBe('paused')
      expect(session.devices[0]).toMatchObject({ operationCount: 1, remainingOperations: 99 })
      expect(f.store.load(taskId).devices[0]).toMatchObject({ id: f.original.id, serial: f.original.serial })
    } finally { await f.service.dispose() }
  })

  it('does not substitute a same-model phone when the original is missing or unauthorized', async () => {
    const f = await fixture(), resolve = vi.spyOn(f.host, 'resolveArchivedDevices')
    try {
      f.setRows('private-other device model:Same_Model\n')
      await expect(f.service.openViewer(undefined, f.signal, { resumeTaskId: taskId })).rejects.toMatchObject({ code: 'device_offline' })
      f.setRows('private-original unauthorized model:Same_Model\nprivate-other device model:Same_Model\n')
      await expect(f.service.openViewer(undefined, f.signal, { resumeTaskId: taskId })).rejects.toMatchObject({ code: 'device_unauthorized' })
      f.setRows('private-original device model:Same_Model\nprivate-other device model:Same_Model\n')
      const other = (await f.host.inspectDevices(f.signal)).find(d => d.serial === 'private-other')!
      await expect(f.service.openViewer([other.id], f.signal, { resumeTaskId: taskId })).rejects.toThrow('device_frozen')
      await expect(f.service.openViewer(undefined, f.signal, { resumeTaskId: taskId, objective: 'Change the goal' })).rejects.toThrow('task_goal_frozen')
      expect(resolve).toHaveBeenCalledTimes(4)
      expect(f.prepare).not.toHaveBeenCalled()
      expect(f.store.load(taskId).owner).toBe('old-host')
    } finally { await f.service.dispose() }
  })

  it('checks account, terminal outcome and failed display before resolving any archived phone', async () => {
    const f = await fixture(), resolve = vi.spyOn(f.host, 'resolveArchivedDevices')
    try {
      f.saved.principal = 'other-account'; f.store.save(f.saved, 'Foreign report')
      await expect(f.service.openViewer(undefined, f.signal, { resumeTaskId: taskId })).rejects.toThrow('foreign_account')
      f.saved.principal = 'local'; f.saved.board.result = { outcome: 'completed' }; f.store.save(f.saved, 'Ended report')
      await expect(f.service.openViewer(undefined, f.signal, { resumeTaskId: taskId })).rejects.toThrow('task_ended')
      f.saved.board.result = undefined; f.saved.displayError = 'display_timeout: old failure'; f.store.save(f.saved, 'Timed-out report')
      await expect(f.service.openViewer(undefined, f.signal, { resumeTaskId: taskId })).rejects.toThrow('display_timeout')
      expect(resolve).not.toHaveBeenCalled(); expect(f.prepare).not.toHaveBeenCalled()
    } finally { await f.service.dispose() }
  })
})
