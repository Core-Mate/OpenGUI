import type { CommandInvocation } from '@deepseek-ai/dsh-commands'
import type { ContentBlock } from '@deepseek-ai/dsh-llm'
import { describe, expect, it, vi } from 'vitest'
import { CoremateTaskCoordinator, OpenGuiTaskManager, runPreparedOpenGuiTask } from '../src/phone-task.ts'

const invocation = (rawInput: string, signal = new AbortController().signal): CommandInvocation => ({
  commandId: 'command-test' as CommandInvocation['commandId'],
  agent: { id: 'session-owner' } as CommandInvocation['agent'],
  rawInput,
  signal,
})

const result = (runId: string, output: ContentBlock[] = [{ type: 'text', text: 'done' }]) => ({ runId, output })

describe('OpenGUI task entry points', () => {
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
    expect(manager.cancel()).toBe(true)
    await expect(running).rejects.toThrow('OpenGUI task stopped by user')
    expect(phaseSignal?.aborted).toBe(true)
    expect(manager.state()).toEqual({ active: false, phase: 'idle', selectionLocked: false })
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

    await vi.waitFor(() => expect(manager.state().phase).toBe('routing'))
    expect(manager.nestedLease(router)?.context).toEqual({ targets: ['phone-a'] })
    expect(manager.nestedLease(stranger)).toBeUndefined()
    await expect(manager.runRoot(invocation('').agent, new AbortController().signal, 'running', async () => 'second'))
      .rejects.toThrow('another OpenGUI task is already running')
    release()
    await expect(running).resolves.toBe('done')
    expect(manager.state()).toEqual({ active: false, phase: 'idle', selectionLocked: false })
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
    await vi.waitFor(() => expect(manager.state().active).toBe(true))
    expect(manager.state().ownerSessionId).toBe('actual-session')
    release()
    await running
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
    expect(coordinator.state()).toEqual({ active: true, phase: 'waiting-for-device', selectionLocked: false, ownerSessionId: 'session-owner' })
    expect(preflight).toHaveBeenCalledTimes(1)
    allowPhone()
    await expect(running).resolves.toEqual({ kind: 'success', text: 'done' })
    expect(order).toEqual(['prepare', 'preflight', 'start'])
    expect(coordinator.state()).toEqual({ active: false, phase: 'idle', selectionLocked: false })
  })

  it('can cancel while waiting for a phone after resolving the model without starting work', async () => {
    const prepare = vi.fn(async () => ({ provider: 'current', model: 'vision' }))
    const start = vi.fn(async () => result('unused'))
    const coordinator = new CoremateTaskCoordinator(start)
    const preflight = vi.fn((_invocation: CommandInvocation, signal: AbortSignal) => new Promise<void>((_resolve, reject) => {
      signal.addEventListener('abort', () => { reject(signal.reason) }, { once: true })
    }))
    const running = coordinator.command(preflight, prepare).handler(invocation('浏览网页'))

    await vi.waitFor(() => { expect(coordinator.state().phase).toBe('waiting-for-device') })
    expect(coordinator.cancel()).toBe(true)
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

  it('allows only one task across command and tool entry points', async () => {
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
      text: 'coremate-mobile: another OpenGUI task is already running',
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
    expect(coordinator.cancel()).toBe(true)
    expect(coordinator.state()).toEqual({ active: true, phase: 'stopping', selectionLocked: true, ownerSessionId: 'session-owner' })
    expect(coordinator.cancel()).toBe(false)
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
