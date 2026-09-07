import type { CommandInvocation } from '@deepseek-ai/dsh-commands'
import type { ContentBlock } from '@deepseek-ai/dsh-llm'
import { describe, expect, it, vi } from 'vitest'
import { BrowserLeaseConflictError, CoremateTaskCoordinator, OpenGuiTaskManager, runPreparedOpenGuiTask } from '../src/phone-task.ts'
import type { OpenGuiTaskLease } from '../src/phone-task.ts'
import { AsyncSemaphore } from '../src/concurrency.ts'

const invocation = (
  rawInput: string,
  signal = new AbortController().signal,
  sessionId = 'session-owner',
): CommandInvocation => ({
  commandId: 'command-test' as CommandInvocation['commandId'],
  agent: { id: `agent-${sessionId}`, session: { id: sessionId } } as CommandInvocation['agent'],
  rawInput,
  signal,
})

const result = (runId: string, output: ContentBlock[] = [{ type: 'text', text: 'done' }]) => ({ runId, output })

function taskRef<Context>(manager: OpenGuiTaskManager<Context>, sessionId = 'session-owner'): { sessionId: string, taskId: string } {
  const state = manager.state(sessionId)
  if (!state.taskId) throw new Error('expected an active task')
  return { sessionId, taskId: state.taskId }
}

describe('OpenGUI task entry points', () => {
  it('queues shared model preparation across sessions and cancels only the exact waiting task', async () => {
    const manager = new OpenGuiTaskManager()
    const preparation = new AsyncSemaphore(1)
    const entered: string[] = []
    let finishFirst!: () => void
    const firstPreparation = new Promise<void>(resolve => { finishFirst = resolve })
    const start = (sessionId: string) => {
      const command = invocation('', new AbortController().signal, sessionId)
      return manager.runRoot(command.agent, command.signal, 'waiting-for-device', lease => runPreparedOpenGuiTask(
        command,
        lease,
        {
          prepare: async interaction => {
            const release = await preparation.acquire(interaction.signal)
            try {
              interaction.signal.throwIfAborted()
              entered.push(sessionId)
              if (sessionId === 'a') await firstPreparation
              return 'vision'
            } finally {
              release()
            }
          },
          waitForTargets: async () => [],
          context: () => undefined,
          execute: async () => sessionId,
          recover: async () => undefined,
        },
      ))
    }

    const first = start('a')
    await vi.waitFor(() => expect(entered).toEqual(['a']))
    const second = start('b')
    const third = start('c')
    expect(manager.states().map(state => state.sessionId)).toEqual(['a', 'b', 'c'])
    const thirdRejection = expect(third).rejects.toThrow('OpenGUI task stopped by user')
    expect(manager.cancel('c', manager.state('c').taskId!)).toBe(true)
    await thirdRejection
    expect(entered).toEqual(['a'])
    expect(manager.isActive('a')).toBe(true)
    expect(manager.isActive('b')).toBe(true)
    finishFirst()
    await expect(Promise.all([first, second])).resolves.toEqual(['a', 'b'])
    expect(entered).toEqual(['a', 'b'])
  })

  it('rejects a root task without an explicit DSH session identity', async () => {
    const manager = new OpenGuiTaskManager()
    const parent = { id: 'resident-agent-only' } as CommandInvocation['agent']

    await expect(manager.runRoot(parent, new AbortController().signal, 'running', async () => 'never'))
      .rejects.toThrow('sessionId must not be empty')
  })

  it.each(['prepare', 'wait', 'recover'] as const)('cancels the lease-scoped %s phase', async (phase) => {
    const manager = new OpenGuiTaskManager<{ route: string, targets: string[] }>()
    const parentSignal = new AbortController().signal
    let phaseSignal: AbortSignal | undefined
    const waitForCancellation = (signal: AbortSignal): Promise<never> => {
      phaseSignal = signal
      return new Promise((_resolve, reject) => {
        signal.addEventListener('abort', () => reject(signal.reason), { once: true })
      })
    }
    const running = manager.runRoot(invocation('').agent, parentSignal, 'waiting-for-device', lease => runPreparedOpenGuiTask(
      { agent: invocation('').agent, signal: parentSignal },
      lease,
      {
        prepare: interaction => phase === 'prepare' ? waitForCancellation(interaction.signal) : Promise.resolve('vision'),
        waitForTargets: interaction => phase === 'wait' ? waitForCancellation(interaction.signal) : Promise.resolve(['phone-a']),
        context: (route, targets) => ({ route, targets }),
        execute: async () => {
          if (phase === 'recover') throw new Error('model capability failed')
          return 'done'
        },
        recover: (_error, interaction) => phase === 'recover' ? waitForCancellation(interaction.signal) : Promise.resolve(undefined),
      },
    ))

    await vi.waitFor(() => expect(phaseSignal).toBeDefined())
    expect(phaseSignal).not.toBe(parentSignal)
    const active = taskRef(manager)
    expect(manager.cancel(active.sessionId, active.taskId)).toBe(true)
    await expect(running).rejects.toThrow('OpenGUI task stopped by user')
    expect(phaseSignal?.aborted).toBe(true)
    expect(manager.state('session-owner')).toEqual({ sessionId: 'session-owner', active: false, phase: 'idle', selectionLocked: false, deviceIds: [] })
  })

  it.each(['prepare', 'wait'] as const)('never advances after cancelled %s work settles late', async (phase) => {
    const manager = new OpenGuiTaskManager<{ route: string, targets: string[] }>()
    let release!: () => void
    const late = new Promise<void>(resolve => { release = resolve })
    const entered = vi.fn()
    const waitForTargets = vi.fn(async () => {
      if (phase === 'wait') {
        entered()
        await late
      }
      return ['phone-a']
    })
    const execute = vi.fn(async () => 'done')
    const running = manager.runRoot(invocation('').agent, new AbortController().signal, 'waiting-for-device', lease => runPreparedOpenGuiTask(
      { agent: invocation('').agent, signal: new AbortController().signal },
      lease,
      {
        prepare: async () => {
          if (phase === 'prepare') {
            entered()
            await late
          }
          return 'vision'
        },
        waitForTargets,
        context: (route, targets) => ({ route, targets }),
        execute,
        recover: async () => undefined,
      },
    ))

    await vi.waitFor(() => expect(entered).toHaveBeenCalledOnce())
    const active = manager.state('session-owner')
    expect(manager.cancel('session-owner', active.taskId!)).toBe(true)
    release()

    await expect(running).rejects.toThrow('OpenGUI task stopped by user')
    if (phase === 'prepare') expect(waitForTargets).not.toHaveBeenCalled()
    expect(execute).not.toHaveBeenCalled()
  })

  it('admits one root task while allowing only explicitly bound nested agents', async () => {
    const manager = new OpenGuiTaskManager<{ targets: string[] }>()
    let release!: () => void
    const gate = new Promise<void>(resolve => { release = resolve })
    const router = {}
    const stranger = {}
    const running = manager.runRoot(invocation('').agent, new AbortController().signal, 'routing', async lease => {
      lease.bindAgent(router)
      lease.context = { targets: ['phone-a'] }
      await gate
      return 'done'
    })

    await vi.waitFor(() => expect(manager.state('session-owner').phase).toBe('routing'))
    expect(manager.nestedLease(router)?.context).toEqual({ targets: ['phone-a'] })
    expect(manager.nestedLease(stranger)).toBeUndefined()
    await expect(manager.runRoot(invocation('').agent, new AbortController().signal, 'running', async () => 'second'))
      .rejects.toThrow('another OpenGUI task is already running')
    release()
    await expect(running).resolves.toBe('done')
    expect(manager.state('session-owner')).toEqual({ sessionId: 'session-owner', active: false, phase: 'idle', selectionLocked: false, deviceIds: [] })
  })

  it('attributes the root task to the actual session rather than the resident agent id', async () => {
    const manager = new OpenGuiTaskManager()
    let release!: () => void
    const gate = new Promise<void>(resolve => { release = resolve })
    const parent = { id: 'resident-agent', session: { id: 'actual-session' } } as CommandInvocation['agent']
    const running = manager.runRoot(parent, new AbortController().signal, 'running', async () => {
      await gate
      return 'done'
    })
    await vi.waitFor(() => expect(manager.state('actual-session').active).toBe(true))
    expect(manager.state('actual-session').sessionId).toBe('actual-session')
    release()
    await running
  })

  it('runs different sessions concurrently while rejecting a second root in one session', async () => {
    const ids = ['task-a', 'attempt-a', 'task-b', 'attempt-b']
    const manager = new OpenGuiTaskManager(() => ids.shift()!)
    let releaseA!: () => void
    let releaseB!: () => void
    const gateA = new Promise<void>(resolve => { releaseA = resolve })
    const gateB = new Promise<void>(resolve => { releaseB = resolve })
    const runningA = manager.runRoot(invocation('', undefined, 'session-a').agent, new AbortController().signal, 'running', async lease => {
      lease.setDeviceIds(['device-a'])
      await gateA
      return 'A'
    })
    const runningB = manager.runRoot(invocation('', undefined, 'session-b').agent, new AbortController().signal, 'running', async lease => {
      lease.setDeviceIds(['device-b'])
      await gateB
      return 'B'
    })

    expect(manager.states()).toEqual([
      expect.objectContaining({ sessionId: 'session-a', taskId: 'task-a', attemptId: 'attempt-a', deviceIds: ['device-a'] }),
      expect.objectContaining({ sessionId: 'session-b', taskId: 'task-b', attemptId: 'attempt-b', deviceIds: ['device-b'] }),
    ])
    await expect(manager.runRoot(invocation('', undefined, 'session-a').agent, new AbortController().signal, 'running', async () => 'duplicate'))
      .rejects.toThrow('already running in this session')
    releaseA()
    await expect(runningA).resolves.toBe('A')
    expect(manager.state('session-b').active).toBe(true)
    releaseB()
    await expect(runningB).resolves.toBe('B')
  })

  it('rejects a delayed stop for the previous task without aborting the replacement', async () => {
    const ids = ['task-old', 'attempt-old', 'task-new', 'attempt-new']
    const manager = new OpenGuiTaskManager(() => ids.shift()!)
    const parent = invocation('').agent
    await manager.runRoot(parent, new AbortController().signal, 'running', async () => 'old')
    let newSignal!: AbortSignal
    let release!: () => void
    const gate = new Promise<void>(resolve => { release = resolve })
    const replacement = manager.runRoot(parent, new AbortController().signal, 'running', async lease => {
      newSignal = lease.signal
      await gate
      return 'new'
    })

    expect(manager.cancel('session-owner', 'task-old')).toBe(false)
    expect(newSignal.aborted).toBe(false)
    expect(manager.state('session-owner')).toMatchObject({ taskId: 'task-new', attemptId: 'attempt-new' })
    release()
    await expect(replacement).resolves.toBe('new')
  })

  it('does not let an agent bound to an old attempt enter its replacement', async () => {
    const ids = ['task-old', 'attempt-old', 'task-new', 'attempt-new']
    const manager = new OpenGuiTaskManager(() => ids.shift()!)
    const parent = invocation('').agent
    const oldAgent = {}
    await manager.runRoot(parent, new AbortController().signal, 'running', async lease => {
      lease.bindAgent(oldAgent)
      return 'old'
    })
    let release!: () => void
    const gate = new Promise<void>(resolve => { release = resolve })
    const replacement = manager.runRoot(parent, new AbortController().signal, 'running', async () => {
      await gate
      return 'new'
    })

    expect(() => manager.nestedLease(oldAgent)).toThrow('nested agent belongs to an inactive OpenGUI task')
    release()
    await replacement
  })

  it('keeps the managed browser globally serial with exact owner release', async () => {
    const ids = ['task-a', 'attempt-a', 'task-b', 'attempt-b']
    const manager = new OpenGuiTaskManager(() => ids.shift()!)
    let releaseA!: () => void
    let releaseB!: () => void
    let browserReleaseA!: () => void
    let leaseB!: OpenGuiTaskLease
    const runningA = manager.runRoot(invocation('', undefined, 'session-a').agent, new AbortController().signal, 'running', async lease => {
      browserReleaseA = lease.acquireBrowser()
      await new Promise<void>(resolve => { releaseA = resolve })
      return 'A'
    })
    const runningB = manager.runRoot(invocation('', undefined, 'session-b').agent, new AbortController().signal, 'running', async lease => {
      leaseB = lease
      await new Promise<void>(resolve => { releaseB = resolve })
      return 'B'
    })

    expect(manager.browserOwnerIdentity()).toEqual({ sessionId: 'session-a', taskId: 'task-a', attemptId: 'attempt-a' })
    expect(() => leaseB.acquireBrowser()).toThrow(BrowserLeaseConflictError)
    browserReleaseA()
    const browserReleaseB = leaseB.acquireBrowser()
    expect(manager.browserOwnerIdentity()?.sessionId).toBe('session-b')
    browserReleaseA()
    expect(manager.browserOwnerIdentity()?.sessionId).toBe('session-b')
    browserReleaseB()
    releaseA()
    releaseB()
    await Promise.all([runningA, runningB])
  })

  it('cancels only the session that is actually disposed', async () => {
    const manager = new OpenGuiTaskManager()
    const signals = new Map<string, AbortSignal>()
    const run = (sessionId: string) => manager.runRoot(
      invocation('', undefined, sessionId).agent,
      new AbortController().signal,
      'running',
      lease => new Promise((_resolve, reject) => {
        signals.set(sessionId, lease.signal)
        lease.signal.addEventListener('abort', () => reject(lease.signal.reason), { once: true })
      }),
    )
    const runningA = run('session-a')
    const runningB = run('session-b')

    expect(manager.cancelSession('session-a')).toBe(true)
    await expect(runningA).rejects.toThrow('owning session was disposed')
    expect(signals.get('session-b')?.aborted).toBe(false)
    manager.cancelSession('session-b')
    await expect(runningB).rejects.toThrow('owning session was disposed')
  })

  it('propagates parent cancellation to already-bound nested leases', async () => {
    const manager = new OpenGuiTaskManager()
    const parent = new AbortController()
    const nestedAgent = {}
    let release!: () => void
    const gate = new Promise<void>(resolve => { release = resolve })
    const running = manager.runRoot(invocation('').agent, parent.signal, 'running', async lease => {
      lease.bindAgent(nestedAgent)
      await gate
      return 'late result'
    })
    const nested = manager.nestedLease(nestedAgent)!

    parent.abort(new Error('parent disposed'))

    expect(nested.signal.aborted).toBe(true)
    expect(manager.state('session-owner').phase).toBe('stopping')
    expect(() => manager.nestedLease(nestedAgent)).toThrow('inactive OpenGUI task')
    release()
    await expect(running).rejects.toThrow('parent disposed')
  })

  it('aborts and drains every concurrent session on plugin disposal', async () => {
    const manager = new OpenGuiTaskManager()
    const run = (sessionId: string) => manager.runRoot(
      invocation('', undefined, sessionId).agent,
      new AbortController().signal,
      'running',
      lease => new Promise((_resolve, reject) => {
        lease.signal.addEventListener('abort', () => reject(lease.signal.reason), { once: true })
      }),
    )
    const results = Promise.allSettled([run('session-a'), run('session-b')])

    await manager.dispose()

    expect((await results).map(result => result.status)).toEqual(['rejected', 'rejected'])
    expect(manager.states()).toEqual([])
  })

  it('publishes /opengui metadata and forwards trimmed input to the shared runner', async () => {
    const start = vi.fn(async () => result('run-1', [
      { type: 'text', text: 'opened ' },
      { type: 'text', text: 'settings' },
    ]))
    const coordinator = new CoremateTaskCoordinator(start)
    const command = coordinator.command()
    const call = invocation('  open settings  ')

    await expect(command.handler(call)).resolves.toEqual({ kind: 'success', text: 'opened settings' })
    expect(command).toMatchObject({
      name: 'opengui',
      input: { hint: '<task>' },
    })
    expect(start).toHaveBeenCalledWith('open settings', call.agent, expect.any(AbortSignal), 'parent-chat', undefined)
    expect(start.mock.calls[0]?.[2].aborted).toBe(false)
  })

  it('shows usage and examples for an empty command without starting a task', async () => {
    const start = vi.fn(async () => result('unused'))
    const command = new CoremateTaskCoordinator(start).command()

    await expect(command.handler(invocation('  \t'))).resolves.toEqual({
      kind: 'success',
      text: expect.stringContaining('Usage: /opengui <task>'),
    })
    expect(start).not.toHaveBeenCalled()
  })

  it('keeps /coremate as a legacy alias that points users to /opengui', async () => {
    const start = vi.fn(async () => result('unused'))
    const command = new CoremateTaskCoordinator(start).command(undefined, undefined, undefined, 'coremate')

    expect(command).toMatchObject({ name: 'coremate', description: 'Legacy alias for /opengui' })
    await expect(command.handler(invocation(''))).resolves.toEqual({
      kind: 'success',
      text: expect.stringContaining('Usage: /opengui <task>'),
    })
    expect(start).not.toHaveBeenCalled()
  })

  it('never runs interactive preparation for an empty command', async () => {
    const start = vi.fn(async () => result('unused'))
    const prepare = vi.fn(async () => ({ provider: 'current', model: 'vision' }))
    const preflight = vi.fn(async () => {})
    const command = new CoremateTaskCoordinator(start).command(preflight, prepare)
    const call = invocation('')

    await expect(command.handler(call)).resolves.toEqual({
      kind: 'success',
      text: expect.stringContaining('@OpenGUI'),
    })
    expect(preflight).not.toHaveBeenCalled()
    expect(prepare).not.toHaveBeenCalled()
    expect(start).not.toHaveBeenCalled()
  })

  it('continues the original task after interactive preparation', async () => {
    const start = vi.fn(async () => result('run-configured', [{ type: 'text', text: 'configured and done' }]))
    const route = { provider: 'current', model: 'vision', maxTokens: 4096 }
    const prepare = vi.fn(async () => route)
    const command = new CoremateTaskCoordinator(start).command(undefined, prepare)
    const call = invocation('open settings')

    await expect(command.handler(call)).resolves.toEqual({ kind: 'success', text: 'configured and done' })
    expect(prepare).toHaveBeenCalledWith(expect.objectContaining({ commandId: call.commandId, rawInput: call.rawInput }))
    expect(start).toHaveBeenCalledWith('open settings', call.agent, expect.any(AbortSignal), 'parent-chat', route)
  })

  it.each(['prepare', 'preflight', 'recover'] as const)('never advances after cancelled coordinator %s work settles late', async (phase) => {
    let release!: () => void
    const late = new Promise<void>(resolve => { release = resolve })
    const entered = vi.fn()
    const waitLate = async (): Promise<void> => {
      entered()
      await late
    }
    const start = vi.fn(async () => {
      if (phase === 'recover') throw new Error('model capability failed')
      return result('run-late')
    })
    const prepare = vi.fn(async () => {
      if (phase === 'prepare') await waitLate()
      return { provider: 'current', model: 'vision' }
    })
    const preflight = vi.fn(async () => {
      if (phase === 'preflight') await waitLate()
    })
    const recover = vi.fn(async () => {
      if (phase === 'recover') await waitLate()
      return '已切换模型，请重新提交。'
    })
    const coordinator = new CoremateTaskCoordinator(start)
    const running = coordinator.command(preflight, prepare, recover).handler(invocation('检查手机'))

    await vi.waitFor(() => expect(entered).toHaveBeenCalledOnce())
    const active = coordinator.state('session-owner')
    expect(coordinator.cancel('session-owner', active.taskId!)).toBe(true)
    release()

    await expect(running).resolves.toEqual({ kind: 'error', text: 'coremate-mobile: OpenGUI task stopped by user' })
    if (phase !== 'recover') expect(start).not.toHaveBeenCalled()
  })

  it('resolves the model before waiting for a phone and locks selection only afterwards', async () => {
    let allowPhone!: () => void
    const phoneReady = new Promise<void>(resolve => { allowPhone = resolve })
    const order: string[] = []
    const start = vi.fn(async () => {
      order.push('start')
      return result('run-ready')
    })
    const coordinator = new CoremateTaskCoordinator(start)
    const preflight = vi.fn(async () => {
      order.push('preflight')
      await phoneReady
    })
    const prepare = vi.fn(async () => {
      order.push('prepare')
      return { provider: 'current', model: 'vision' }
    })
    const running = coordinator.command(preflight, prepare).handler(invocation('检查手机'))

    await vi.waitFor(() => { expect(prepare).toHaveBeenCalledTimes(1) })
    expect(coordinator.state('session-owner')).toMatchObject({ sessionId: 'session-owner', active: true, phase: 'waiting-for-device', selectionLocked: false, deviceIds: [] })
    expect(preflight).toHaveBeenCalledTimes(1)
    allowPhone()
    await expect(running).resolves.toEqual({ kind: 'success', text: 'done' })
    expect(order).toEqual(['prepare', 'preflight', 'start'])
    expect(coordinator.state('session-owner')).toEqual({ sessionId: 'session-owner', active: false, phase: 'idle', selectionLocked: false, deviceIds: [] })
  })

  it('can cancel while waiting for a phone after resolving the model without starting work', async () => {
    const prepare = vi.fn(async () => ({ provider: 'current', model: 'vision' }))
    const start = vi.fn(async () => result('unused'))
    const coordinator = new CoremateTaskCoordinator(start)
    const preflight = vi.fn((_invocation: CommandInvocation, signal: AbortSignal) => new Promise<void>((_resolve, reject) => {
      signal.addEventListener('abort', () => { reject(signal.reason) }, { once: true })
    }))
    const running = coordinator.command(preflight, prepare).handler(invocation('浏览网页'))

    await vi.waitFor(() => { expect(coordinator.state('session-owner').phase).toBe('waiting-for-device') })
    const active = coordinator.state('session-owner')
    expect(coordinator.cancel('session-owner', active.taskId!)).toBe(true)
    await expect(running).resolves.toEqual({ kind: 'error', text: 'coremate-mobile: OpenGUI task stopped by user' })
    expect(prepare).toHaveBeenCalledTimes(1)
    expect(start).not.toHaveBeenCalled()
  })

  it('allows capability recovery without retrying the original task', async () => {
    const route = { provider: 'coremate-inherited', model: 'encoded' }
    const start = vi.fn(async () => { throw new Error('image input is not supported') })
    const recover = vi.fn(async () => '已切换模型，请重新提交。')
    const call = invocation('observe phone')
    const command = new CoremateTaskCoordinator(start).command(undefined, async () => route, recover)

    await expect(command.handler(call)).resolves.toEqual({ kind: 'error', text: '已切换模型，请重新提交。' })
    expect(start).toHaveBeenCalledTimes(1)
    expect(recover).toHaveBeenCalledWith(expect.any(Error), expect.objectContaining({ commandId: call.commandId }), route)
  })

  it('renders task failures as command errors and preserves non-Error rejections', async () => {
    const expected = new CoremateTaskCoordinator(async () => { throw new Error('device unavailable') }).command()
    await expect(expected.handler(invocation('observe phone'))).resolves.toEqual({
      kind: 'error',
      text: 'device unavailable',
    })

    const unexpected = new CoremateTaskCoordinator(async () => { throw 'bad rejection' }).command()
    await expect(unexpected.handler(invocation('observe phone'))).rejects.toBe('bad rejection')
  })

  it('allows only one root task per session across command and tool entry points', async () => {
    let release!: () => void
    const firstDone = new Promise<void>((resolve) => { release = resolve })
    const start = vi.fn(async (task: string) => {
      if (task === 'first') await firstDone
      return result(`run-${task}`)
    })
    const coordinator = new CoremateTaskCoordinator(start)
    const first = coordinator.run('first', invocation('').agent, new AbortController().signal)

    await expect(coordinator.command().handler(invocation('second'))).resolves.toEqual({
      kind: 'error',
      text: 'coremate-mobile: another OpenGUI task is already running in this session',
    })
    release()
    await expect(first).resolves.toEqual(result('run-first'))
    await expect(coordinator.run('third', invocation('').agent, new AbortController().signal))
      .resolves.toEqual(result('run-third'))
  })

  it('aborts and drains the active task during plugin disposal', async () => {
    let activeSignal: AbortSignal | undefined
    const coordinator = new CoremateTaskCoordinator((_task, _agent, signal) => new Promise((_resolve, reject) => {
      activeSignal = signal
      signal.addEventListener('abort', () => reject(signal.reason), { once: true })
    }))
    const running = coordinator.run('long task', invocation('').agent, new AbortController().signal)

    await coordinator.dispose()

    expect(activeSignal?.aborted).toBe(true)
    await expect(running).rejects.toThrow('coremate-mobile: plugin disposed during OpenGUI task')
    await expect(coordinator.run('late task', invocation('').agent, new AbortController().signal))
      .rejects.toThrow('coremate-mobile: task runner is disposed')
  })

  it('cancels the active phone batch from the UI control and becomes idle after settlement', async () => {
    let activeSignal: AbortSignal | undefined
    const coordinator = new CoremateTaskCoordinator((_task, _agent, signal) => new Promise((_resolve, reject) => {
      activeSignal = signal
      signal.addEventListener('abort', () => reject(signal.reason), { once: true })
    }))
    const running = coordinator.run('long task', invocation('').agent, new AbortController().signal)

    expect(coordinator.isActive()).toBe(true)
    const active = coordinator.state('session-owner')
    expect(coordinator.cancel('session-owner', active.taskId!)).toBe(true)
    expect(coordinator.state('session-owner')).toMatchObject({ sessionId: 'session-owner', taskId: active.taskId, active: true, phase: 'stopping', selectionLocked: true, deviceIds: [] })
    expect(coordinator.cancel('session-owner', active.taskId!)).toBe(false)
    expect(activeSignal?.aborted).toBe(true)
    await expect(running).rejects.toThrow('coremate-mobile: OpenGUI task stopped by user')
    expect(coordinator.isActive()).toBe(false)
  })

  it('returns a stable completion message when the child has no text output', async () => {
    const command = new CoremateTaskCoordinator(async () => result('run-image', [])).command()

    await expect(command.handler(invocation('take screenshot'))).resolves.toEqual({
      kind: 'success',
      text: 'OpenGUI task completed (run run-image).',
    })
  })
})
