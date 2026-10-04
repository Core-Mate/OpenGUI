import { BASE_EXECUTION_BUDGET } from './execution-budget.ts'
import { createHash, randomBytes, randomUUID } from 'node:crypto'
import { createControlTask, type ControlTask, type WorkBuddyOpenGuiService } from './service.ts'
import { errorInfo, OpenGuiError } from './errors.ts'

export interface AutomationTask {
  readonly id: string
  readonly hostSession: string
  readonly rootSession: string
  readonly execution: ControlTask
  readonly controller: AbortController
  readonly sessions: Set<string>
  started: boolean
  controlStarted: boolean
  continuations: number
  /** Host continuations spent waiting for the person's 开始执行. */
  startWaits: number
  /** Host continuations parked on a long status wait while the person controls the phone. */
  controlWaits: number
  outcome: 'active' | 'completed' | 'blocked' | 'unknown' | 'cancelled' | 'stopped'
  lastError?: ReturnType<typeof errorInfo>
  recoveryDeadline?: number
}

interface Claim { task: AutomationTask; digest: string; expiresAt: number }
export interface HostEvent {
  stop_before_submit?: true
  hook_event_name: string
  session_id: string
  agent_id?: string
  tool_name?: string
  tool_input?: Record<string, unknown>
  final_stop_reason?: string
  prompt?: string
}

function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`
  if (value && typeof value === 'object') return `{${Object.keys(value).sort().map(key => `${JSON.stringify(key)}:${canonical((value as Record<string, unknown>)[key])}`).join(',')}}`
  return JSON.stringify(value) ?? 'null'
}
function digest(name: string, input: Record<string, unknown>): string {
  const { hostContext: _context, ...args } = input
  return createHash('sha256').update(canonical({ name, args })).digest('hex')
}

/** Ephemeral host-task bookkeeping. Hooks never grant action approval or restore a control lock. */
export class AutomationCoordinator {
  private readonly current = new Map<string, AutomationTask>()
  private readonly tasks = new Map<string, AutomationTask>()
  private readonly bySession = new Map<string, AutomationTask>()
  private readonly claims = new Map<string, Claim>()
  private readonly prompts = new Map<string, string>()

  constructor(private readonly service: WorkBuddyOpenGuiService, private readonly now = Date.now) {}

  private create(hostSession: string, rootSession: string): AutomationTask {
    if ([...this.tasks.values()].filter(task => task.outcome === 'active').length >= 1000) throw new OpenGuiError('too_many_tasks', 'opengui: too many active host tasks')
    const task: AutomationTask = { id: randomUUID(), hostSession, rootSession, execution: createControlTask(), controller: new AbortController(), sessions: new Set(), started: false, controlStarted: false, startWaits: 0, controlWaits: 0, continuations: 0, outcome: 'active' }
    this.current.set(hostSession, task)
    this.tasks.set(task.id, task)
    this.prune()
    return task
  }

  private prune(): void {
    for (const [token, claim] of this.claims) if (claim.expiresAt <= this.now()) this.claims.delete(token)
    const ended = [...this.tasks.values()].filter(task => task.outcome !== 'active')
    for (const task of ended.slice(0, Math.max(0, ended.length - 100))) {
      this.tasks.delete(task.id)
      if (this.current.get(task.hostSession) === task) this.current.delete(task.hostSession)
      for (const id of task.sessions) if (this.bySession.get(id) === task) this.bySession.delete(id)
    }
  }

  /** The hook identity comes from authenticated local IPC, never from model task parameters. */
  async event(event: HostEvent): Promise<Record<string, unknown>> {
    if (!event.session_id || event.session_id.length > 300) throw new OpenGuiError('invalid_host_context', 'opengui: missing or invalid host session identity')
    if (event.agent_id !== undefined && (typeof event.agent_id !== 'string' || event.agent_id.length > 300)) throw new OpenGuiError('invalid_host_context', 'opengui: invalid host agent identity')
    for (const task of this.tasks.values()) this.refreshInternalOutcome(task)
    const identity = JSON.stringify([event.session_id, event.agent_id ?? null])
    if (event.hook_event_name === 'SessionEnd') {
      // A native agent-scoped end must not cancel siblings sharing parentSessionId.
      await Promise.all([...this.tasks.values()].filter(task => task.rootSession === event.session_id && (event.agent_id === undefined || task.hostSession === identity) && task.outcome === 'active').map(task => this.finish(task, 'cancelled')))
      return {}
    }
    const existing = this.current.get(identity)
    if (event.hook_event_name === 'UserPromptSubmit') {
      if (typeof event.prompt === 'string' && event.prompt.trim()) {
        this.prompts.delete(identity); this.prompts.set(identity, event.prompt.trim().slice(0, 4000))
        while (this.prompts.size > 1000) this.prompts.delete(this.prompts.keys().next().value!)
      }
      // Host serializes final-stop before a new prompt. Do not forcibly steal a still-active task.
      if (existing && (existing.outcome !== 'active' || (!existing.controlStarted && !this.service.awaitingDeviceTask(existing.execution)))) {
        if (existing.outcome === 'active') await this.finish(existing, 'unknown')
        if (this.current.get(identity) === existing) this.current.delete(identity)
      }
      if (event.stop_before_submit === true) this.service.restrictTask(this.current.get(identity)?.execution ?? this.create(identity, event.session_id).execution)
      return {}
    }
    if (event.hook_event_name === 'PreToolUse' && event.tool_name && event.tool_input) {
      this.prune()
      let task = existing
      const sessionId = event.tool_input.sessionId
      if (typeof sessionId === 'string' && event.tool_name !== 'opengui_resume_mirror') {
        const owner = this.bySession.get(sessionId)
        if (!owner || owner.hostSession !== identity) throw new OpenGuiError('foreign_task', 'opengui: this control session belongs to another host task')
        task = owner
      }
      task ??= this.create(identity, event.session_id)
      task.execution.request ??= this.prompts.get(identity)
      if (task.outcome !== 'active' && !['opengui_list_devices', 'opengui_history', 'opengui_status', 'opengui_cancel', 'opengui_close_session', 'opengui_close_mirror', 'opengui_viewer_status', 'opengui_close_viewer'].includes(event.tool_name)) {
        throw new OpenGuiError('task_ended', 'opengui: this task ended; only a new explicit user request may start another task')
      }
      if (event.tool_name === 'opengui_open_session' && event.tool_input.purpose !== 'mirror') {
        task.controlStarted = true
        if (typeof event.tool_input.objective === 'string') task.execution.objective ??= event.tool_input.objective
        if (typeof event.tool_input.successCriteria === 'string') task.execution.successCriteria ??= event.tool_input.successCriteria
      }
      if (this.claims.size >= 1000) throw new OpenGuiError('too_many_requests', 'opengui: too many pending host tool claims')
      const token = randomBytes(32).toString('base64url')
      this.claims.set(token, { task, digest: digest(event.tool_name, event.tool_input), expiresAt: this.now() + 60_000 })
      return { hostContext: token }
    }
    if (!existing) return {}
    if (event.hook_event_name === 'Stop' || event.hook_event_name === 'SubagentStop') {
      // Keep the turn alive (bounded) while the person confirms model and device in the workbench.
      if (existing.outcome === 'active' && this.service.awaitingTaskStart(existing.execution)) {
        if (existing.startWaits >= 6) return {}
        existing.startWaits++
        return { decision: 'block', reason: `OpenGUI is waiting for the user to confirm the request, model and device and click 开始执行 in the workbench (${existing.startWaits}/6). Call opengui_viewer_status with the existing viewerId and waitMs 600000; it returns as soon as the task starts. Do not open a control session, observe or act until it returns startRequired false and a visible first frame. If waiting runs out, tell the user the task starts after they click 开始执行 and send any message here.` }
      }
      if (!existing.controlStarted || existing.outcome !== 'active') return {}
      const states = this.states(existing)
      // Takeover is a pause, not the end of the task: park the turn on one long status wait so that
      // 恢复控制 resumes the model. The wait captures nothing and makes no model call.
      const controlled = states.find(state => state.state === 'active' && state.controlMode === 'manual')
      if (controlled) {
        if (existing.controlWaits >= 12) return {}
        existing.controlWaits++
        return { decision: 'block', reason: `The user has taken over the phone (接管) (${existing.controlWaits}/12). Do not observe or act. Call opengui_status with sessionId ${JSON.stringify(controlled.sessionId)} and waitMs 600000; it returns as soon as the user clicks 恢复控制. Then observe the same device with the current stepId, reconcile the page and continue the task.` }
      }
      // Human review is an intentional wait, not unfinished autonomous work.
      if (this.awaitingUser(existing)) return {}
      if (states.some(state => state.result?.outcome === 'blocked') || states.some(state => state.devices.some(device => device.remainingOperations === 0))) {
        await this.finish(existing, 'blocked')
        return {}
      }
      if (existing.lastError?.recovery === 'stop' || existing.continuations >= 10 || (existing.recoveryDeadline && this.now() >= existing.recoveryDeadline)) {
        await this.finish(existing, existing.lastError?.executionState === 'outcome_unknown' ? 'unknown' : 'blocked')
        return {}
      }
      existing.continuations++
      const active = states.filter(state => state.state === 'active').map(state => state.sessionId)
      return {
        decision: 'block',
        reason: `OpenGUI task is unfinished. Continue autonomously (${existing.continuations}/10). Goal: ${existing.execution.objective ?? 'the current user phone task'}. Verify: ${existing.execution.successCriteria ?? 'the actual result image'}. Active control sessions: ${JSON.stringify(active)}. ${states.some(state => state.state === 'active' && state.executor?.mode === 'configured') ? 'The selected configured model owns phone execution. Call opengui_execute with the existing sessionId and waitMs 30000 to await progress; read status and communicate it. Do not dispatch parallel observe/act or close its active run.' : active.length ? 'Use the existing owned session. Read a fresh image, verify any uncertain previous action without replaying it, then continue within the original task.' : 'Open a NEW control session for the same frozen deviceIds; old control authority is revoked.'} Frozen deviceIds: ${JSON.stringify(existing.execution.selectedDeviceIds ?? [])}. Next recovery: ${existing.lastError?.recovery ?? 'observe'}. Close with an evidence-backed outcome when finished. Do not call opengui_start or reopen closed displays during recovery. Do not ask the user to say continue.`,
      }
    }
    if (['FinalStop', 'SessionEnd', 'StopFailure'].includes(event.hook_event_name)) {
      if (event.hook_event_name === 'FinalStop' && event.final_stop_reason !== 'interrupted' && this.awaitingUser(existing)) return {}
      const outcome = event.final_stop_reason === 'interrupted' || event.hook_event_name === 'SessionEnd' ? 'cancelled' : 'unknown'
      await this.finish(existing, existing.outcome === 'active' ? outcome : existing.outcome)
    }
    return {}
  }

  consume(token: unknown, name: string, args: Record<string, unknown>): AutomationTask | undefined {
    if (token === undefined) {
      if (typeof args.sessionId === 'string' && this.bySession.has(args.sessionId)) throw new OpenGuiError('host_hook_required', 'opengui: the host hook must bind this task call')
      return undefined
    }
    const claim = typeof token === 'string' ? this.claims.get(token) : undefined
    if (typeof token === 'string') this.claims.delete(token)
    if (!claim || claim.expiresAt <= this.now() || claim.digest !== digest(name, args)) throw new OpenGuiError('invalid_host_context', 'opengui: expired, reused, changed or invalid host context')
    if (name !== 'opengui_resume_mirror' && typeof args.sessionId === 'string' && this.bySession.get(args.sessionId) !== claim.task) throw new OpenGuiError('foreign_task', 'opengui: host task cannot access another control session')
    return claim.task
  }

  attach(task: AutomationTask | undefined, sessionId: string, control: boolean): void {
    if (!task) return
    task.sessions.add(sessionId)
    task.controlStarted ||= control
    task.started = true
    this.bySession.set(sessionId, task)
  }

  success(task: AutomationTask | undefined, name: string, args: Record<string, unknown>): void {
    if (!task) return
    this.refreshInternalOutcome(task)
    if (name === 'opengui_start') task.started = true
    if (name === 'opengui_observe' || name === 'opengui_act') { delete task.lastError; delete task.recoveryDeadline }
    if ((name === 'opengui_cancel' || name === 'opengui_close_session') && typeof args.sessionId === 'string') {
      const state = this.service.findSession(args.sessionId)
      if (state?.purpose === 'control' && !this.states(task).some(state => state.purpose === 'control' && state.state === 'active')) {
        task.outcome = state.result?.outcome ?? 'unknown'
        this.service.endViewerTask(task.id)
      }
    }
  }

  failure(task: AutomationTask | undefined, error: unknown): void {
    if (!task) return
    task.lastError = errorInfo(error)
    if (['connection_lost', 'device_offline', 'device_busy'].includes(task.lastError.code)) task.recoveryDeadline ??= this.now() + 30_000
  }

  status(task?: AutomationTask): Record<string, unknown> {
    if (!task) return { available: false, reason: 'WorkBuddy host hook context was not received; automatic continuation is unavailable.' }
    this.refreshInternalOutcome(task)
    return {
      available: true, taskId: task.id, outcome: task.outcome, continuations: task.continuations, maxContinuations: 10,
      remainingOperations: Object.fromEntries((task.execution.selectedDeviceIds ?? []).map(id => {
        const states = this.states(task).reverse()
        const device = states.flatMap(state => state.devices).find(device => device.id === id)
        return [id, device?.remainingOperations ?? BASE_EXECUTION_BUDGET]
      })),
      ...(task.lastError ? { lastError: task.lastError } : {}),
    }
  }

  private refreshInternalOutcome(task: AutomationTask): void {
    if (!task.controlStarted || task.outcome !== 'active') return
    const states = this.states(task).filter(state => state.purpose === 'control')
    if (states.some(state => state.state === 'active')) return
    const latest = states.at(-1)
    if (latest?.executor?.mode !== 'configured' && latest?.result?.outcome !== 'stopped') return
    task.outcome = latest.result?.outcome ?? 'unknown'
    this.service.endViewerTask(task.id)
  }

  private async finish(task: AutomationTask, outcome: AutomationTask['outcome']): Promise<void> {
    task.outcome = outcome
    this.service.endViewerTask(task.id)
    task.controller.abort(new OpenGuiError('cancelled', 'opengui: host task ended'))
    for (const [token, claim] of this.claims) if (claim.task === task) this.claims.delete(token)
    // Snapshot exact owned ids before awaiting; obsolete cleanup cannot target a later task.
    await Promise.allSettled([...task.sessions].map(id => {
      if (this.bySession.get(id) !== task || this.service.findSession(id)?.state !== 'active') return Promise.resolve()
      if (this.service.retainsMirror(id)) return Promise.resolve()
      return outcome === 'cancelled' ? this.service.cancel(id) : this.service.closeSession(id, { outcome: outcome === 'active' ? 'unknown' : outcome })
    }))
  }

  private states(task: AutomationTask) {
    return [...task.sessions].flatMap(id => {
      const state = this.service.findSession(id)
      return state ? [state] : []
    })
  }

  private awaitingUser(task: AutomationTask): boolean {
    return this.service.awaitingDeviceTask(task.execution) || this.states(task).some(state => state.state === 'active' && (
      state.controlMode === 'paused' || state.controlMode === 'manual'
      || state.reviews?.some(review => review.status === 'pending')
      || state.replacementPending
      || state.apk?.status === 'prepared' && Boolean(state.apk.existingApp) && !state.apk.updateApprovedAt
    ))
  }

  closeableSessions(owned: ReadonlySet<string>, task?: AutomationTask): ReadonlySet<string> {
    return new Set([...owned].filter(id => task ? this.bySession.get(id) === task : !this.bySession.has(id)))
  }
}
