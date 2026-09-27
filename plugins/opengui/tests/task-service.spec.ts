import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createConnection } from 'node:net'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { Executor, Hardware, ModelProfile } from '../../../packages/phone-agent/src/contracts.ts'
import type { RawPhoneObservation } from '../../../packages/device-runtime/src/phone-controller.ts'
import { startTaskService } from '../../../packages/task-service/src/server.ts'
import { sharedPhoneTasks } from '../../../packages/task-service/src/client.ts'
import { taskServicePlist } from '../../../packages/task-service/src/launchd.ts'
import { archiveLegacyTasks } from '../../../packages/task-service/src/migrate.ts'
import { TASK_SERVICE_LABEL, dataPath } from '../../../packages/task-service/src/paths.ts'

const cleanups: Array<() => Promise<unknown>> = []
afterEach(async () => { for (const cleanup of cleanups.splice(0).reverse()) await cleanup(); delete process.env.OPENGUI_TASK_SERVICE_AUTOSTART })
const deferred = () => { let resolve!: () => void; const promise = new Promise<void>(r => { resolve = r }); return { promise, resolve } }

function hardware(): Hardware {
  const device = { id: 'phone-a', serial: 'phone-a', name: 'phone-a', authorized: true, connected: true, state: 'device' }
  return {
    listDevices: async () => [device], resolveDevices: async () => [device], assignTarget() {},
    observe: async () => ({ observationId: 'frame-1' as RawPhoneObservation['observationId'], serial: 'phone-a', width: 10, height: 10, foregroundPackage: 'settings', image: { data: Buffer.from('jpeg'), mediaType: 'image/jpeg' as const, bytes: 4, width: 10, height: 10, name: 'phone.jpg' } }),
    act: async () => { throw new Error('unused') }, releaseDevice: async () => {}, dispose: async () => {},
  }
}
const viewers = { open: async () => ({ viewerId: 'v', url: 'http://127.0.0.1/v/' }), status: async () => ({ firstDisplayEstablished: true }), assertReady() {}, endTask() {}, dispose: async () => {}, allowEmbedding() {} }

async function boot(root: string, executor: Executor, profiles: ModelProfile[] = []) {
  await mkdir(dataPath(root), { recursive: true })
  if (profiles.length) await writeFile(join(dataPath(root), 'models-v1.json'), JSON.stringify(profiles), { mode: 0o600 })
  const service = await startTaskService({ root, hardware: hardware(), executor, credentials: { get: async () => 'secret', set: async () => {} }, viewers: viewers as never, leaseRoot: join(root, 'leases') })
  cleanups.push(() => service.close())
  process.env.OPENGUI_TASK_SERVICE_AUTOSTART = '0'
  return service
}

describe('shared task service', () => {
  it('runs a submitted task after the client leaves and hides it from another host', async () => {
    const root = await mkdtemp(join(tmpdir(), 'opengui-task-service-'))
    cleanups.push(() => rm(root, { recursive: true, force: true }))
    const gate = deferred()
    const profile: ModelProfile = { id: 'model', protocol: 'openai-completions', baseUrl: 'http://127.0.0.1:9/v1', model: 'vision', credentialRef: 'ref' }
    const executor: Executor = {
      probe: async () => {},
      plan: async input => ({ kind: 'branches', branches: [{ goal: input.goal, successCriteria: input.goal, eligibleDeviceIds: input.devices.map(device => device.id) }] }),
      run: async execution => { await gate.promise; const observed = await execution.observe(); await execution.finish('done', [{ criterion: execution.task.successCriteria, status: 'passed', evidenceId: observed.observationId }], 'completed') },
    }
    const service = await boot(root, executor, [profile])
    const denied = await new Promise<string>((resolve, reject) => {
      const socket = createConnection(service.endpoint)
      socket.setEncoding('utf8')
      socket.once('error', reject)
      socket.once('data', resolve)
      socket.end(JSON.stringify({ protocol: 1, token: 'nope', host: 'codex', name: 'opengui_list_tasks', args: {}, owner: 'a' }) + '\n')
    })
    expect(denied).toContain('authentication failed')
    const codex = sharedPhoneTasks('codex', root)
    const workbuddy = sharedPhoneTasks('workbuddy', root)
    const task = await codex.call('opengui_run_task', { requestId: 'order-1', goal: 'Open settings', successCriteria: 'Settings visible' }, 'chat-a') as { id: string; phase: string }
    expect(task.phase).toBe('preparing')
    const hidden = await workbuddy.call('opengui_list_tasks', {}, 'chat-a') as { tasks: { id: string }[] }
    expect(hidden.tasks.map(item => item.id)).not.toContain(task.id)
    const again = await codex.call('opengui_run_task', { requestId: 'order-1', goal: 'Open settings', successCriteria: 'Settings visible' }, 'chat-a') as { id: string }
    expect(again.id).toBe(task.id)
    gate.resolve()
    await vi.waitFor(async () => {
      const status = await codex.call('opengui_manage_task', { action: 'status', taskId: task.id }, 'chat-a') as { phase: string }
      expect(status.phase).toBe('completed')
    })
  })

  it('rejects execution until a model is configured and archives old journals without credentials', async () => {
    const root = await mkdtemp(join(tmpdir(), 'opengui-task-migrate-'))
    cleanups.push(() => rm(root, { recursive: true, force: true }))
    const legacy = join(root, 'old-codex')
    await mkdir(join(legacy, 'goals-v1'), { recursive: true })
    await writeFile(join(legacy, 'goals-v1', 'task.json'), '{"id":"old"}')
    expect(await archiveLegacyTasks(root, [{ host: 'codex', root: legacy }])).toEqual(['codex'])
    expect(await readFile(join(root, 'legacy', 'codex', 'READ-ONLY.txt'), 'utf8')).toContain('does not copy model credentials')
    const serviceRoot = join(root, 'service')
    await boot(serviceRoot, { probe: async () => {}, run: async () => {} })
    const tasks = sharedPhoneTasks('codex', serviceRoot)
    await expect(tasks.call('opengui_run_task', { requestId: 'missing-model', goal: 'Look', successCriteria: 'Seen' }, 'chat')).rejects.toThrow('Configure a planning-capable model')
    const plist = taskServicePlist({ node: '/usr/local/bin/node', entry: '/opt/opengui/lib/task-service.js', root: serviceRoot })
    expect(plist).toContain(TASK_SERVICE_LABEL)
    expect(plist).toContain('/opt/opengui/lib/task-service.js')
    expect(plist).not.toContain('--experimental-strip-types')
    expect(plist).not.toContain('secret')
  })
})
