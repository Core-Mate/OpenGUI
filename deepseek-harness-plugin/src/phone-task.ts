/**
 * Shared OpenGUI task execution and the direct `/opengui` command adapter.
 * @module dsh-coremate-mobile/phone-task
 */

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
  readonly active: boolean
  readonly phase: CoremateTaskPhase
  readonly selectionLocked: boolean
  readonly ownerSessionId?: string
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

/** Pause a non-empty command until its external prerequisites are ready. */
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
 * A second task fails before target access.
 */
export class CoremateTaskCoordinator {
  private readonly tasks = new OpenGuiTaskManager<void>()

  /** @param start Establishes and settles the child run. */
  constructor(private readonly start: CoremateTaskStart) {}

  /**
   * Run one non-empty task while excluding every other plugin entry point.
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
  isActive(): boolean {
    return this.tasks.isActive()
  }

  state(): CoremateTaskState {
    return this.tasks.state()
  }

  /** Request cancellation of the active task without waiting for settlement. */
  cancel(): boolean {
    return this.tasks.cancel()
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
            await preflight?.(invocation, lease.signal)
            lease.setPhase('routing')
            const agentOptions = await prepare?.({ ...invocation, signal: lease.signal })
            lease.setPhase('running')
            try {
              return await this.start(task, invocation.agent, lease.signal, 'parent-chat', agentOptions)
            } catch (error) {
              if (error instanceof Error && agentOptions !== undefined && recover !== undefined) {
                const recovered = await recover(error, { ...invocation, signal: lease.signal }, agentOptions)
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
  readonly signal: AbortSignal
  readonly ownerSessionId: string | undefined
  context: Context | undefined
  setPhase(phase: Exclude<CoremateTaskPhase, 'idle'>): void
  bindAgent(agent: object): void
  recordCapabilityFailure(error: Error): void
  capabilityFailure(): Error | undefined
}

interface ActiveOpenGuiTask<Context> {
  readonly controller: AbortController
  readonly agents: WeakSet<object>
  readonly ownerSessionId?: string
  phase: Exclude<CoremateTaskPhase, 'idle'>
  result: Promise<unknown>
  capabilityError?: Error
  context: Context | undefined
}

/**
 * Plugin-wide admission gate. A root command/tool owns the task while router
 * delegates explicitly bound to its lease may re-enter without opening a
 * second task. Unbound callers always compete for the single root slot.
 */
export class OpenGuiTaskManager<Context = unknown> {
  private active: ActiveOpenGuiTask<Context> | undefined
  private readonly lifetime = new AbortController()

  async runRoot<Result>(
    parent: CommandInvocation['agent'],
    signal: AbortSignal,
    phase: Exclude<CoremateTaskPhase, 'idle'>,
    operation: (lease: OpenGuiTaskLease<Context>) => Promise<Result>,
  ): Promise<Result> {
    if (this.lifetime.signal.aborted) throw new Error('coremate-mobile: task runner is disposed')
    if (this.active !== undefined) throw new Error('coremate-mobile: another OpenGUI task is already running')
    const controller = new AbortController()
    const sessionIdentity = parent.session?.id ?? parent.id
    const ownerSessionId = sessionIdentity === undefined ? undefined : String(sessionIdentity)
    const active: ActiveOpenGuiTask<Context> = {
      controller,
      agents: new WeakSet(),
      phase,
      result: undefined as unknown as Promise<unknown>,
      context: undefined,
      ...(ownerSessionId === undefined ? {} : { ownerSessionId }),
    }
    this.active = active
    const combinedSignal = AbortSignal.any([signal, this.lifetime.signal, controller.signal])
    const lease = this.lease(active, combinedSignal)
    active.result = operation(lease)
    try {
      return await active.result as Result
    } finally {
      if (this.active === active) this.active = undefined
    }
  }

  /** Return the active lease only for a router agent explicitly bound by its root task. */
  nestedLease(agent: object, signal?: AbortSignal): OpenGuiTaskLease<Context> | undefined {
    const active = this.active
    if (active === undefined || !active.agents.has(agent)) return undefined
    return this.lease(active, AbortSignal.any([
      this.lifetime.signal,
      active.controller.signal,
      ...(signal === undefined ? [] : [signal]),
    ]))
  }

  isActive(): boolean { return this.active !== undefined }

  state(): CoremateTaskState {
    const phase = this.active?.phase ?? 'idle'
    return {
      active: phase !== 'idle',
      phase,
      selectionLocked: phase === 'routing' || phase === 'running' || phase === 'stopping',
      ...(this.active?.ownerSessionId === undefined ? {} : { ownerSessionId: this.active.ownerSessionId }),
    }
  }

  cancel(): boolean {
    const active = this.active
    if (active === undefined || active.controller.signal.aborted) return false
    active.phase = 'stopping'
    active.controller.abort(new Error('coremate-mobile: OpenGUI task stopped by user'))
    return true
  }

  async dispose(): Promise<void> {
    if (!this.lifetime.signal.aborted) {
      this.lifetime.abort(new Error('coremate-mobile: plugin disposed during OpenGUI task'))
    }
    const active = this.active
    if (active !== undefined) await Promise.allSettled([active.result])
  }

  private lease(active: ActiveOpenGuiTask<Context>, signal: AbortSignal): OpenGuiTaskLease<Context> {
    return {
      signal,
      get ownerSessionId() { return active.ownerSessionId },
      get context() { return active.context },
      set context(value: Context | undefined) { active.context = value },
      setPhase: phase => { if (this.active === active) active.phase = phase },
      bindAgent: agent => { active.agents.add(agent) },
      recordCapabilityFailure: error => { active.capabilityError ??= error },
      capabilityFailure: () => active.capabilityError,
    }
  }
}
