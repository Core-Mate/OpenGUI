import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createConnection } from 'node:net'
import type { PhoneTasks } from '../../packages/task-service/src/client.ts'
import { TaskHost } from '../../packages/phone-agent/src/host.ts'
import { PhoneRuntime } from '../../packages/phone-agent/src/runtime.ts'
import { HostExecutor } from '../../packages/phone-agent/src/host-executor.ts'
import { ReadyViewer } from './ready-viewer.ts'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { startBroker } from '../src/broker.ts'
import { BrokerClient } from '../src/broker-client.ts'
import { WorkBuddyOpenGuiService } from '../src/service.ts'
import { VERSION } from '../src/state.ts'
import { FakeHost } from './fake-host.ts'

const disposers: Array<() => unknown> = []
afterEach(async () => { for (const dispose of disposers.splice(0).reverse()) await dispose() })
const signal = () => AbortSignal.timeout(5000)

async function setup(host = new FakeHost(), tasks?: PhoneTasks) {
  const service = new WorkBuddyOpenGuiService({ viewers: new ReadyViewer(), host })
  const broker = await startBroker({ port: 0, token: 'test-secret', service, ...(tasks ? { tasks } : {}) })
  disposers.push(broker.close)
  const a = await BrokerClient.connect(broker.port, 'test-secret')
  const b = await BrokerClient.connect(broker.port, 'test-secret')
  disposers.push(() => a.close(), () => b.close())
  return { host, service, broker, a, b }
}

async function open(client: BrokerClient, device = 'phone-a') {
  return await client.call('opengui_open_session', { deviceIds: [device] }, signal()) as { sessionId: string; deviceWallUrl: string }
}

describe('WorkBuddy broker isolation', () => {
  it('allows only the installer to retire an idle broker without executing tools', async () => {
    const { a, broker, host } = await setup()
    await expect(a.prepareUpgrade(signal())).rejects.toThrow('installer')
    const installer = await BrokerClient.connect(broker.port, 'test-secret', VERSION, 'installer')
    disposers.push(() => installer.close())
    await expect(installer.call('opengui_list_devices', {}, signal())).rejects.toThrow('cannot execute')
    await expect(installer.prepareUpgrade(signal())).resolves.toEqual({ ready: true })
    await vi.waitFor(async () => { await expect(BrokerClient.connect(broker.port, 'test-secret')).rejects.toMatchObject({ code: 'ECONNREFUSED' }) })
    expect(host.released).toEqual([])
  })

  it('refuses retirement while a legacy session is active and preserves that session', async () => {
    const { a, broker, host } = await setup()
    const session = await open(a)
    const installer = await BrokerClient.connect(broker.port, 'test-secret', VERSION, 'installer')
    disposers.push(() => installer.close())
    await expect(installer.prepareUpgrade(signal())).rejects.toThrow('upgrade_blocked')
    await expect(a.call('opengui_status', { sessionId: session.sessionId }, signal())).resolves.toMatchObject({ state: 'active' })
    expect(host.released).toEqual([])
  })

  it('refuses retirement while a tool is still opening a session', async () => {
    const { a, broker, service } = await setup()
    const original = service.openSession.bind(service)
    let release!: () => void
    const gate = new Promise<void>(resolve => { release = resolve })
    let entered = false
    vi.spyOn(service, 'openSession').mockImplementation(async (...args) => { entered = true; await gate; return original(...args) })
    const pending = open(a)
    const installer = await BrokerClient.connect(broker.port, 'test-secret', VERSION, 'installer')
    disposers.push(() => installer.close())
    try {
      await vi.waitFor(() => expect(entered).toBe(true))
      await expect(installer.prepareUpgrade(signal())).rejects.toThrow('upgrade_blocked')
    } finally { release(); await pending }
  })
  it('binds native host tasks, continues initial recoverable failure, and rejects cross-task display closure', async () => {
    const { a, broker, host } = await setup()
    const hook = await BrokerClient.connect(broker.port, 'test-secret', VERSION, 'hook')
    disposers.push(() => hook.close())
    const call = async (hostId: string, name: string, args: Record<string, unknown>) => {
      const bound = await hook.hostEvent({ hook_event_name: 'PreToolUse', session_id: hostId, tool_name: name, tool_input: args }, signal()) as { hostContext: string }
      return a.call(name, { ...args, hostContext: bound.hostContext }, signal())
    }
    const first = await call('host-a', 'opengui_open_session', { deviceId: 'phone-a' }) as { sessionId: string }
    await expect(call('host-b', 'opengui_open_session', { deviceId: 'phone-a' })).rejects.toThrow('already locked')
    await expect(hook.hostEvent({ hook_event_name: 'Stop', session_id: 'host-b' }, signal())).resolves.toMatchObject({ decision: 'block' })
    await expect(call('host-b', 'opengui_close_mirror', { deviceId: 'phone-a' })).rejects.toThrow('another task')
    await expect(a.call('opengui_close_mirror', { deviceId: 'phone-a' }, signal())).rejects.toThrow('another task')
    await expect(call('host-b', 'opengui_observe', { sessionId: first.sessionId })).rejects.toThrow('another host task')
    expect(host.released).toEqual([])
  })

  it('cancels a control session that finishes opening after native final stop', async () => {
    const { a, broker, service, host } = await setup()
    const hook = await BrokerClient.connect(broker.port, 'test-secret', VERSION, 'hook')
    disposers.push(() => hook.close())
    const original = service.openSession.bind(service)
    let release!: () => void
    const gate = new Promise<void>(resolve => { release = resolve })
    let entered = false
    vi.spyOn(service, 'openSession').mockImplementation(async (...args) => {
      const created = await original(...args)
      entered = true
      await gate
      return created
    })
    const args = { deviceId: 'phone-a' }
    const { hostContext } = await hook.hostEvent({ hook_event_name: 'PreToolUse', session_id: 'host', tool_name: 'opengui_open_session', tool_input: args }, signal()) as { hostContext: string }
    const pending = a.call('opengui_open_session', { ...args, hostContext }, signal())
    const rejected = expect(pending).rejects.toThrow('ended')
    await vi.waitFor(() => expect(entered).toBe(true))
    await hook.hostEvent({ hook_event_name: 'FinalStop', session_id: 'host', final_stop_reason: 'interrupted' }, signal())
    release()
    await rejected
    expect(host.released).toEqual(['serial-a'])
    await expect(open(a)).resolves.toHaveProperty('sessionId')
  })
  it('keeps standalone mirroring across turn teardown and resumes only with its capability', async () => {
    const host = Object.assign(new FakeHost(), {
      openMirror: async () => {}, closeMirror: async () => {},
      mirrorStatus: () => ({ phase: 'running' as const }),
      hasMirrors: () => true,
    })
    const onIdle = vi.fn()
    const service = new WorkBuddyOpenGuiService({ viewers: new ReadyViewer(), host })
    const broker = await startBroker({ port: 0, token: 'test', service, idleMs: 20, onIdle })
    disposers.push(broker.close)
    const a = await BrokerClient.connect(broker.port, 'test')
    const session = await a.call('opengui_open_session', { purpose: 'mirror', deviceIds: ['phone-a'] }, signal()) as { sessionId: string; mirrorResumeToken: string }
    await a.call('opengui_open_mirror', { sessionId: session.sessionId }, signal())
    a.close()
    await new Promise(resolve => setTimeout(resolve, 80))
    expect(host.released).toEqual([])
    expect(onIdle).not.toHaveBeenCalled()
    const b = await BrokerClient.connect(broker.port, 'test')
    disposers.push(() => b.close())
    await expect(b.call('opengui_status', { sessionId: session.sessionId }, signal())).rejects.toThrow('another WorkBuddy connection')
    await expect(b.call('opengui_resume_mirror', { sessionId: session.sessionId, mirrorResumeToken: 'wrong' }, signal())).rejects.toThrow()
    await expect(b.call('opengui_resume_mirror', { sessionId: session.sessionId, mirrorResumeToken: session.mirrorResumeToken }, signal())).resolves.toMatchObject({ state: 'active', purpose: 'mirror' })
    await b.call('opengui_close_session', { sessionId: session.sessionId }, signal())
    expect(host.released).toEqual([])
  })
  it('shares leases across independent socket clients and permits disjoint phones', async () => {
    const { a, b } = await setup()
    await open(a)
    await expect(open(b)).rejects.toThrow('already locked')
    await expect(open(b, 'phone-b')).resolves.toHaveProperty('sessionId')
  })

  it('rejects other connections reading, acting on, or cancelling a session', async () => {
    const { a, b } = await setup()
    const { sessionId } = await open(a)
    for (const name of ['opengui_open_mirror', 'opengui_close_mirror', 'opengui_status', 'opengui_observe', 'opengui_cancel', 'opengui_close_session']) {
      await expect(b.call(name, { sessionId }, signal())).rejects.toThrow('another WorkBuddy connection')
    }
  })

  it('releases only a disconnected connection and does not close another client', async () => {
    const { a, b, host } = await setup()
    await open(a)
    const ownedB = await open(b, 'phone-b')
    a.close()
    await vi.waitFor(() => expect(host.released).toContain('serial-a'))
    expect(host.released).not.toContain('serial-b')
    await expect(b.call('opengui_status', { sessionId: ownedB.sessionId }, signal())).resolves.toMatchObject({ state: 'active' })
    await expect(open(b)).resolves.toHaveProperty('sessionId')
  })

  it('does not clean a newly acquired phone when an old session closes again', async () => {
    const { a, b, host } = await setup()
    const old = await open(a)
    await a.call('opengui_close_session', { sessionId: old.sessionId }, signal())
    await open(b)
    await a.call('opengui_close_session', { sessionId: old.sessionId }, signal())
    expect(host.released).toEqual(['serial-a'])
  })

  it('aborts a cancelled request and releases its session', async () => {
    const { a, b, host } = await setup()
    const session = await open(a)
    host.observe = async (_actor, abort?: AbortSignal) => new Promise((_resolve, reject) => {
      abort!.addEventListener('abort', () => reject(abort!.reason), { once: true })
    })
    const controller = new AbortController()
    const pending = a.call('opengui_observe', { sessionId: session.sessionId }, controller.signal)
    const rejected = expect(pending).rejects.toMatchObject({ code: 'cancelled', executionState: 'not_executed' })
    await new Promise(resolve => setTimeout(resolve, 25))
    controller.abort(new Error('stop'))
    await rejected
    await vi.waitFor(() => expect(host.released).toContain('serial-a'))
    await expect(open(b)).resolves.toHaveProperty('sessionId')
  })

  it('fails closed on invalid credentials and incompatible runtime versions', async () => {
    const { broker } = await setup()
    await expect(BrokerClient.connect(broker.port, 'wrong')).rejects.toThrow('authentication failed')
    await expect(BrokerClient.connect(broker.port, 'test-secret', '0.0.0')).rejects.toThrow('version differs')
  })

  it('rejects removed internal permission flags', async () => {
    const { a } = await setup()
    const session = await open(a)
    await expect(a.call('opengui_act', {
      sessionId: session.sessionId, action: 'key', key: 'Enter', observationId: 'old', confirmedExternalSideEffect: true,
    }, signal())).rejects.toThrow('invalid arguments')
  })

  it('exits after the last client leaves and the idle deadline expires', async () => {
    const onIdle = vi.fn()
    const broker = await startBroker({ port: 0, token: 'test', service: new WorkBuddyOpenGuiService({ viewers: new ReadyViewer(), host: new FakeHost() }), idleMs: 20, onIdle })
    disposers.push(broker.close)
    await vi.waitFor(() => expect(onIdle).toHaveBeenCalledOnce())
    await expect(BrokerClient.connect(broker.port, 'test')).rejects.toThrow()
  })

  it('does not let repeated upgrade port probes postpone idle exit', async () => {
    const onIdle = vi.fn()
    const broker = await startBroker({ port: 0, token: 'test', service: new WorkBuddyOpenGuiService({ viewers: new ReadyViewer(), host: new FakeHost() }), idleMs: 180, onIdle })
    disposers.push(broker.close)
    let connected = 0
    const probe = () => {
      const socket = createConnection({ host: '127.0.0.1', port: broker.port })
      socket.once('connect', () => { connected++; socket.destroy() })
      socket.once('error', () => socket.destroy())
    }
    const timer = setInterval(probe, 20)
    try {
      await vi.waitFor(() => expect(onIdle).toHaveBeenCalledOnce(), { timeout: 800, interval: 20 })
      expect(connected).toBeGreaterThanOrEqual(3)
    } finally { clearInterval(timer) }
  })
})


it('keeps conversation ownership and does not cancel tasks when the host turn ends', async () => {
  const owners: string[] = []
  let interrupts = 0
  const tasks: PhoneTasks = {
    get activeCount() { return 0 }, get watching() { return false }, snapshot: async () => {}, prepareMaintenance: () => true,
    call: async (_name, _args, owner) => { owners.push(owner); return { tasks: [] } },
    interruptOwner: async () => { interrupts += 1 },
    close: async () => {},
  }
  const { a, broker } = await setup(new FakeHost(), tasks)
  const hook = await BrokerClient.connect(broker.port, 'test-secret', VERSION, 'hook')
  disposers.push(() => hook.close())
  const invoke = async (session: string) => {
    const bound = await hook.hostEvent({ hook_event_name: 'PreToolUse', session_id: session, tool_name: 'opengui_list_tasks', tool_input: {} }, signal()) as { hostContext: string }
    await a.call('opengui_list_tasks', { hostContext: bound.hostContext }, signal())
    return owners.at(-1)
  }
  const first = await invoke('same-chat')
  await hook.hostEvent({ hook_event_name: 'FinalStop', session_id: 'same-chat' }, signal())
  expect(interrupts).toBe(0)
  await hook.hostEvent({ hook_event_name: 'UserPromptSubmit', session_id: 'same-chat' }, signal())
  expect(await invoke('same-chat')).toBe(first)
  expect(await invoke('other-chat')).not.toBe(first)
  await hook.hostEvent({ hook_event_name: 'FinalStop', session_id: 'same-chat', final_stop_reason: 'interrupted' }, signal())
  expect(interrupts).toBe(0)
})


it('keeps a web task bound to its hook conversation over a shared MCP connection', async () => {
  const root = await mkdtemp(join(tmpdir(), 'opengui-workbench-owner-'))
  const previous = process.env.OPENGUI_WORKBUDDY_HOME
  process.env.OPENGUI_WORKBUDDY_HOME = root
  disposers.push(async () => {
    if (previous === undefined) delete process.env.OPENGUI_WORKBUDDY_HOME
    else process.env.OPENGUI_WORKBUDDY_HOME = previous
    await rm(root, { recursive: true, force: true })
  })
  const host = Object.assign(new FakeHost(), { videoStreams: {
    async prepare() { throw new Error('This ownership test must not start video') },
    async subscribe() { throw new Error('This ownership test must not start video') },
    async dispose() {},
  } })
  const service = new WorkBuddyOpenGuiService({ viewers: new ReadyViewer(), host })
  const runtime = new PhoneRuntime({ root: join(root, 'phone-agent'), host: 'workbuddy', hardware: service.phoneHardware, credentials: { get: async () => '', set: async () => {} }, executor: new HostExecutor(), leaseRoot: join(root, 'leases') })
  const tasks = new TaskHost(() => runtime)
  disposers.push(() => tasks.close())
  const broker = await startBroker({ port: 0, token: 'test-secret', service, tasks })
  disposers.push(broker.close)
  const a = await BrokerClient.connect(broker.port, 'test-secret')
  disposers.push(() => a.close())
  const hook = await BrokerClient.connect(broker.port, 'test-secret', VERSION, 'hook')
  disposers.push(() => hook.close())
  const invoke = async (session: string, name: string, args: Record<string, unknown> = {}) => {
    const bound = await hook.hostEvent({ hook_event_name: 'PreToolUse', session_id: session, tool_name: name, tool_input: args }, signal()) as { hostContext: string }
    return await a.call(name, { ...args, hostContext: bound.hostContext }, signal()) as Record<string, any>
  }
  const first = await invoke('chat-a', 'opengui_open_workbench')
  const second = await invoke('chat-b', 'opengui_open_workbench')
  expect(first.url).not.toBe(second.url)
  const response = await fetch(first.url + 'run', { method: 'POST',
    headers: { origin: new URL(first.url).origin, 'content-type': 'application/json' },
    body: JSON.stringify({ requestId: 'originating-chat', goal: 'Inspect settings' }),
  })
  expect(response.status).toBe(200)
  const task = await response.json() as { id: string }
  const foreign = await invoke('chat-b', 'opengui_manage_task', { action: 'next', taskId: task.id })
  expect(foreign.decision).toBeNull()
  expect(foreign.tasks).toEqual([])
  const owned = await invoke('chat-a', 'opengui_manage_task', { action: 'next', taskId: task.id })
  expect(owned.decision).toMatchObject({ taskId: task.id, kind: 'plan' })
  expect(owned.workbenchUrl).toBe(first.url)
  await invoke('chat-a', 'opengui_manage_task', { action: 'stop', taskId: task.id })
}, 15000)
