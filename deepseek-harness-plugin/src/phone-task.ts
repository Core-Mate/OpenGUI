/**
 * Shared OpenGUI task execution and the direct `/opengui` command adapter.
 * @module dsh-coremate-mobile/phone-task
 */

import { randomUUID } from 'node:crypto'
import type { CommandDefinition, CommandInvocation, CommandResult } from '@deepseek-ai/dsh-commands'
import type { AgentOptions } from '@deepseek-ai/dsh-agent'
import type { CallId, ContentBlock } from '@deepseek-ai/dsh-llm'
import { cleanCoremateSuggestionBlocks } from './suggestions.ts'

export const OPENGUI_USAGE = `Usage: /opengui <task>

也可以输入 @OpenGUI 后描述任务。

常用示例：
- QA 助手：走查当前已连接 Android 手机上的 APP，先产出测试用例，再逐项执行并汇总问题。
- 运营助手：运营目标平台并完成基础互动；发布、私信或账号修改前先确认。
- 手游助手：领取多款游戏的每日福利；付费、抽卡或资源消耗前先确认。`

export type CoremateTaskPhase = 'idle' | 'waiting-for-device' | 'routing' | 'running' | 'stopping'

export interface CoremateTaskState {
  readonly sessionId: string
  readonly active: boolean
  readonly phase: CoremateTaskPhase
  readonly selectionLocked: boolean
  readonly taskId?: string
  readonly attemptId?: string
  readonly deviceIds: readonly string[]
}

/** Exact identity shared by task cancellation and process-local resource leases. */
export interface OpenGuiTaskIdentity {
  readonly sessionId: string
  readonly taskId: string
  readonly attemptId: string
}

/** Completed child run returned to the parent tool or command adapter. */
export interface CoremateTaskResult {
  /** Published child-run identity. */
  readonly runId: string
  /** Final child content; the tool preserves every block while commands render text only. */
  readonly output: ContentBlock[]
  /** Parent-session assistant message that authoritatively owns this command result. */
  readonly sourceEventSeq?: number
}

/** How a caller wants the child run presented. */
export type CoremateTaskPresentation = 'result-only' | 'parent-chat' | {
  /** Present child tool calls live beneath this currently running outer tool call. */
  readonly nestedUnderCallId: CallId
}

/**
 * Start one validated OpenGUI task against the exact receiving parent agent.
 * @param task Trimmed non-empty human task.
 * @param parent Exact receiving parent agent.
 * @param signal Cancellation fused from the caller and plugin lifetime.
 * @returns The completed child identity and final content.
 */
export type CoremateTaskStart = (
  task: string,
  parent: CommandInvocation['agent'],
  signal: AbortSignal,
  presentation: CoremateTaskPresentation,
  agentOptions?: AgentOptions,
) => Promise<CoremateTaskResult>

/** Resolve the model route before a non-empty direct command starts. */
export type CoremateTaskPrepare = (invocation: CommandInvocation) => Promise<AgentOptions>

/** Pause a non-empty command until its external device prerequisites are ready. */
export type CoremateTaskPreflight = (invocation: CommandInvocation, signal: AbortSignal) => Promise<void>

/** Convert an inherited-model capability failure into a safe next action. */
export type CoremateTaskRecover = (
  error: Error,
  invocation: CommandInvocation,
  agentOptions: AgentOptions,
) => Promise<string | undefined>

function textFrom(output: readonly ContentBlock[]): string {
  return output
    .filter((block): block is Extract<ContentBlock, { type: 'text' }> => block.type === 'text')
    .map(block => block.text)
    .join('')
    .trim()
}

/**
 * Owns one plugin instance's task lifetime across tool and command callers.
 * A second root task in the same session fails before target access.
 */
export class CoremateTaskCoordinator {
  private readonly tasks = new OpenGuiTaskManager<void>()

  /** @param start Establishes and settles the child run. */
  constructor(private readonly start: CoremateTaskStart) {}

  /**
   * Run one non-empty task while excluding other root entries in its session.
   * @param task Human-authored task.
   * @param parent Exact receiving parent agent.
   * @param signal Caller-owned cancellation signal.
   * @returns The completed child identity and final content.
   */
  async run(
    task: string,
    parent: CommandInvocation['agent'],
    signal: AbortSignal,
    presentation: CoremateTaskPresentation = 'result-only',
    agentOptions?: AgentOptions,
  ): Promise<CoremateTaskResult> {
    const normalized = task.trim()
    if (normalized.length === 0) throw new Error('coremate-mobile: task must not be empty')
    return this.tasks.runRoot(parent, signal, 'running', lease => agentOptions === undefined
      ? this.start(normalized, parent, lease.signal, presentation)
      : this.start(normalized, parent, lease.signal, presentation, agentOptions))
  }

  /** Whether a command or tool currently owns this coordinator. */
  isActive(sessionId?: string): boolean {
    return this.tasks.isActive(sessionId)
  }

  state(sessionId: string): CoremateTaskState {
    return this.tasks.state(sessionId)
  }

  /** Request cancellation of one exact task without waiting for settlement. */
  cancel(sessionId: string, taskId: string): boolean {
    return this.tasks.cancel(sessionId, taskId)
  }

  /**
   * Build the global direct-UI command backed by {@link run}.
   * @param name Public command name. The legacy `coremate` alias shares the same coordinator.
   * @returns A direct task command definition.
   */
  command(
    preflight?: CoremateTaskPreflight,
    prepare?: CoremateTaskPrepare,
    recover?: CoremateTaskRecover,
    name = 'opengui',
  ): CommandDefinition {
    return {
      name,
      description: name === 'opengui'
        ? 'Run a phone or local-browser task with OpenGUI'
        : 'Legacy alias for /opengui',
      input: { hint: '<task>' },
      handler: async (invocation): Promise<CommandResult> => {
        const task = invocation.rawInput.trim()
        if (task.length === 0) return { kind: 'success', text: OPENGUI_USAGE }
        try {
          const result = await this.tasks.runRoot(invocation.agent, invocation.signal, 'waiting-for-device', async lease => {
            const agentOptions = await prepare?.({ ...invocation, signal: lease.signal })
            lease.signal.throwIfAborted()
            await preflight?.(invocation, lease.signal)
            lease.signal.throwIfAborted()
            lease.setPhase('routing')
            lease.setPhase('running')
            lease.signal.throwIfAborted()
            try {
              return await this.start(task, invocation.agent, lease.signal, 'parent-chat', agentOptions)
            } catch (error) {
              if (error instanceof Error && agentOptions !== undefined && recover !== undefined) {
                lease.signal.throwIfAborted()
                const recovered = await recover(error, { ...invocation, signal: lease.signal }, agentOptions)
                lease.signal.throwIfAborted()
                if (recovered !== undefined) throw new CoremateRecoveredError(recovered)
              }
              throw error
            }
          })
          const cleaned = cleanCoremateSuggestionBlocks(result.output)
          const text = textFrom(cleaned.output)
          return {
            kind: 'success',
            text: text.length > 0 ? text : `OpenGUI task completed (run ${result.runId}).`,
          }
        } catch (error: unknown) {
          if (error instanceof CoremateRecoveredError) return { kind: 'error', text: error.message }
          if (error instanceof Error) return { kind: 'error', text: error.message }
          throw error
        }
      },
    }
  }

  /** Abort the active task and await its settlement before plugin teardown completes. */
  async dispose(): Promise<void> {
    await this.tasks.dispose()
  }
}

class CoremateRecoveredError extends Error {}

/** Mutable data owned by one root OpenGUI task and shared with its nested delegates. */
export interface OpenGuiTaskLease<Context = unknown> {
  readonly identity: OpenGuiTaskIdentity
  readonly signal: AbortSignal
  readonly deviceIds: readonly string[]
  context: Context | undefined
  setPhase(phase: Exclude<CoremateTaskPhase, 'idle'>): void
  setDeviceIds(deviceIds: readonly string[]): void
  bindAgent(agent: object): void
  acquireBrowser(): () => void
  recordCapabilityFailure(error: Error): void
  capabilityFailure(): Error | undefined
}

/** Lifecycle hooks for preparing and executing one admitted OpenGUI root task. */
export interface PreparedOpenGuiTaskHooks<Interaction, Route, Targets, Context, Result> {
  prepare(interaction: Interaction): Promise<Route>
  waitForTargets(interaction: Interaction): Promise<Targets>
  context(route: Route, targets: Targets): Context
  execute(lease: OpenGuiTaskLease<Context>): Promise<Result>
  recover(error: Error, interaction: Interaction, route: Route): Promise<string | undefined>
}

/**
 * Run every cancellable stage with the admitted task's fused lease signal.
 * The caller's original signal alone cannot observe cancellation from the
 * workbench stop control.
 */
export async function runPreparedOpenGuiTask<
  Interaction extends { readonly signal: AbortSignal },
  Route,
  Targets,
  Context,
  Result,
>(
  interaction: Interaction,
  lease: OpenGuiTaskLease<Context>,
  hooks: PreparedOpenGuiTaskHooks<Interaction, Route, Targets, Context, Result>,
): Promise<Result> {
  const scopedInteraction = { ...interaction, signal: lease.signal }
  const route = await hooks.prepare(scopedInteraction)
  lease.signal.throwIfAborted()
  const targets = await hooks.waitForTargets(scopedInteraction)
  lease.signal.throwIfAborted()
  lease.setPhase('routing')
  lease.context = hooks.context(route, targets)
  lease.setPhase('running')
  lease.signal.throwIfAborted()
  try {
    return await hooks.execute(lease)
  } catch (error) {
    if (error instanceof Error) {
      lease.signal.throwIfAborted()
      const recovered = await hooks.recover(error, scopedInteraction, route)
      lease.signal.throwIfAborted()
      if (recovered !== undefined) throw new Error(recovered)
    }
    throw error
  }
}

interface ActiveOpenGuiTask<Context> {
  readonly identity: OpenGuiTaskIdentity
  readonly controller: AbortController
  readonly signal: AbortSignal
  readonly agents: WeakSet<object>
  phase: Exclude<CoremateTaskPhase, 'idle'>
  result: Promise<unknown>
  capabilityError?: Error
  context: Context | undefined
  deviceIds: readonly string[]
}

/** The single managed browser is already owned by another task attempt. */
export class BrowserLeaseConflictError extends Error {
  readonly code = 'BROWSER_BUSY'
  constructor() {
    super('coremate-mobile: the managed browser is busy in another OpenGUI task')
    this.name = 'BrowserLeaseConflictError'
  }
}

function requireTaskIdentity(value: unknown, field: keyof OpenGuiTaskIdentity): string {
  const normalized = typeof value === 'string' ? value.trim() : ''
  if (normalized.length === 0) throw new Error(`coremate-mobile: ${field} must not be empty`)
  return normalized
}

function sameIdentity(left: OpenGuiTaskIdentity, right: OpenGuiTaskIdentity): boolean {
  return left.sessionId === right.sessionId
    && left.taskId === right.taskId
    && left.attemptId === right.attemptId
}

/**
 * Session-scoped admission gate. A root command/tool owns the task while router
 * delegates explicitly bound to its lease may re-enter without opening a
 * second task. Unbound callers compete only for their own session's root slot.
 */
export class OpenGuiTaskManager<Context = unknown> {
  private readonly activeBySession = new Map<string, ActiveOpenGuiTask<Context>>()
  private readonly activeByAgent = new WeakMap<object, ActiveOpenGuiTask<Context>>()
  private readonly lifetime = new AbortController()
  private browserOwner: ActiveOpenGuiTask<Context> | undefined

  constructor(private readonly createId: () => string = randomUUID) {}

  async runRoot<Result>(
    parent: CommandInvocation['agent'],
    signal: AbortSignal,
    phase: Exclude<CoremateTaskPhase, 'idle'>,
    operation: (lease: OpenGuiTaskLease<Context>) => Promise<Result>,
  ): Promise<Result> {
    if (this.lifetime.signal.aborted) throw new Error('coremate-mobile: task runner is disposed')
    const sessionId = requireTaskIdentity(parent.session?.id, 'sessionId')
    if (this.activeBySession.has(sessionId)) {
      throw new Error('coremate-mobile: another OpenGUI task is already running in this session')
    }
    const controller = new AbortController()
    const combinedSignal = AbortSignal.any([signal, this.lifetime.signal, controller.signal])
    combinedSignal.throwIfAborted()
    const identity: OpenGuiTaskIdentity = {
      sessionId,
      taskId: requireTaskIdentity(this.createId(), 'taskId'),
      attemptId: requireTaskIdentity(this.createId(), 'attemptId'),
    }
    const active: ActiveOpenGuiTask<Context> = {
      identity,
      controller,
      signal: combinedSignal,
      agents: new WeakSet(),
      phase,
      result: undefined as unknown as Promise<unknown>,
      context: undefined,
      deviceIds: [],
    }
    this.activeBySession.set(sessionId, active)
    const markStopping = (): void => { active.phase = 'stopping' }
    combinedSignal.addEventListener('abort', markStopping, { once: true })
    const lease = this.lease(active, combinedSignal)
    try {
      active.result = Promise.resolve(operation(lease))
    } catch (error) {
      active.result = Promise.reject(error)
    }
    try {
      const result = await active.result as Result
      combinedSignal.throwIfAborted()
      return result
    } finally {
      combinedSignal.removeEventListener('abort', markStopping)
      if (this.browserOwner === active) this.browserOwner = undefined
      if (this.activeBySession.get(sessionId) === active) this.activeBySession.delete(sessionId)
    }
  }

  /** Return the active lease only for a nested agent explicitly bound by its root task. */
  nestedLease(agent: object, signal?: AbortSignal): OpenGuiTaskLease<Context> | undefined {
    const active = this.activeByAgent.get(agent)
    if (active === undefined || !active.agents.has(agent)) return undefined
    if (this.activeBySession.get(active.identity.sessionId) !== active || active.signal.aborted) {
      throw new Error('coremate-mobile: nested agent belongs to an inactive OpenGUI task')
    }
    return this.lease(active, AbortSignal.any([
      active.signal,
      ...(signal === undefined ? [] : [signal]),
    ]))
  }

  isActive(sessionId?: string): boolean {
    return sessionId === undefined
      ? this.activeBySession.size > 0
      : this.activeBySession.has(sessionId)
  }

  state(sessionIdInput: string): CoremateTaskState {
    const sessionId = requireTaskIdentity(sessionIdInput, 'sessionId')
    const active = this.activeBySession.get(sessionId)
    const phase = active?.phase ?? 'idle'
    return {
      sessionId,
      active: phase !== 'idle',
      phase,
      selectionLocked: phase === 'routing' || phase === 'running' || phase === 'stopping',
      ...(active === undefined ? {} : {
        taskId: active.identity.taskId,
        attemptId: active.identity.attemptId,
      }),
      deviceIds: active?.deviceIds ?? [],
    }
  }

  states(): readonly CoremateTaskState[] {
    return [...this.activeBySession.keys()].map(sessionId => this.state(sessionId))
  }

  cancel(sessionIdInput: string, taskIdInput: string): boolean {
    const sessionId = requireTaskIdentity(sessionIdInput, 'sessionId')
    const taskId = requireTaskIdentity(taskIdInput, 'taskId')
    const active = this.activeBySession.get(sessionId)
    if (active === undefined || active.identity.taskId !== taskId || active.signal.aborted) return false
    active.phase = 'stopping'
    active.controller.abort(new Error('coremate-mobile: OpenGUI task stopped by user'))
    return true
  }

  /** Internal lifecycle cancellation for a session that is actually being disposed. */
  cancelSession(sessionIdInput: string): boolean {
    const sessionId = requireTaskIdentity(sessionIdInput, 'sessionId')
    const active = this.activeBySession.get(sessionId)
    if (active === undefined || active.signal.aborted) return false
    active.phase = 'stopping'
    active.controller.abort(new Error('coremate-mobile: owning session was disposed'))
    return true
  }

  cancelAll(): void {
    for (const active of this.activeBySession.values()) {
      if (active.controller.signal.aborted) continue
      active.phase = 'stopping'
      active.controller.abort(new Error('coremate-mobile: plugin disposed during OpenGUI task'))
    }
  }

  browserOwnerIdentity(): OpenGuiTaskIdentity | undefined {
    return this.browserOwner === undefined ? undefined : { ...this.browserOwner.identity }
  }

  async dispose(): Promise<void> {
    if (!this.lifetime.signal.aborted) {
      this.lifetime.abort(new Error('coremate-mobile: plugin disposed during OpenGUI task'))
    }
    this.cancelAll()
    await Promise.allSettled([...this.activeBySession.values()].map(active => active.result))
  }

  private lease(active: ActiveOpenGuiTask<Context>, signal: AbortSignal): OpenGuiTaskLease<Context> {
    return {
      identity: active.identity,
      signal,
      get deviceIds() { return active.deviceIds },
      get context() { return active.context },
      set context(value: Context | undefined) { active.context = value },
      setPhase: phase => {
        if (this.activeBySession.get(active.identity.sessionId) === active) active.phase = phase
      },
      setDeviceIds: deviceIds => {
        if (this.activeBySession.get(active.identity.sessionId) === active) {
          active.deviceIds = [...new Set(deviceIds)]
        }
      },
      bindAgent: agent => {
        active.agents.add(agent)
        this.activeByAgent.set(agent, active)
      },
      acquireBrowser: () => {
        if (this.activeBySession.get(active.identity.sessionId) !== active || signal.aborted) {
          throw new Error('coremate-mobile: OpenGUI task is no longer active')
        }
        if (this.browserOwner !== undefined) throw new BrowserLeaseConflictError()
        this.browserOwner = active
        let released = false
        return () => {
          if (released) return
          released = true
          if (this.browserOwner === active && sameIdentity(this.browserOwner.identity, active.identity)) {
            this.browserOwner = undefined
          }
        }
      },
      recordCapabilityFailure: error => { active.capabilityError ??= error },
      capabilityFailure: () => active.capabilityError,
    }
  }
}
