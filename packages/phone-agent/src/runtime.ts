import { GoalRuntime } from './goals.ts'
import { randomUUID } from 'node:crypto'
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { acquireDeviceLease } from '../../device-runtime/src/device-lease.ts'
import { ViewerServer } from '../../device-runtime/src/viewer.ts'
import { OpenGuiError } from '../../device-runtime/src/errors.ts'
import type { RawPhoneObservation } from '../../device-runtime/src/phone-controller.ts'
import { newestTaskFirst, terminal, type Check, type Credentials, type Executor, type Hardware, type Host, type ModelProfile, type StartTask, type Task } from './contracts.ts'
import { TaskStore } from './store.ts'
import { confirmPhoneAction, type ConfirmPhoneAction } from './confirmation.ts'

interface ModelInput { protocol: string; baseUrl: string; model: string; secret: string; allowRemoteHttp?: boolean }
interface Running { controller: AbortController; done: Promise<void>; steer?: (text: string) => void; pending: string[]; resume?: (text: string) => void; stopRequested?: boolean }
export class PhoneRuntime {
  readonly goals: GoalRuntime
  readonly tasks = new Map<string, Task>()
  readonly profiles = new Map<string, ModelProfile>()
  readonly viewers: ViewerServer
  private readonly running = new Map<string, Running>()
  private readonly store: TaskStore
  private admissions = Promise.resolve()
  private modelWrites = Promise.resolve()
  private closing = false
  constructor(readonly options: { root: string; host: Host; hardware: Hardware; credentials: Credentials; executor: Executor; leaseRoot?: string; viewers?: ViewerServer; confirmAction?: ConfirmPhoneAction }) {
    this.goals = new GoalRuntime(this)
    this.store = new TaskStore(join(options.root, 'tasks-v1'))
    if (!options.viewers && !options.hardware.videoStreams) throw new Error('Video streams required')
    this.viewers = options.viewers ?? new ViewerServer(options.hardware.videoStreams!)
  }
  async initialize(): Promise<void> {
    await mkdir(join(this.options.root, 'evidence-v1'), { recursive: true, mode: 0o700 })
    for (const task of await this.store.load()) {
      delete task.viewerUrl; delete task.viewerId
      this.tasks.set(task.id, task)
      if (!terminal(task.phase)) {
        // Older journals wrote not_executed before dispatch. An intent without
        // a recorded result cannot prove that the device received no action.
        if (task.lastAction && task.lastExecutionState === 'not_executed') {
          const events = await this.store.events(task.id)
          const lastActionEvent = events.findLast(e => ['action_intent', 'action_delivered', 'action_rejected', 'action_outcome_unknown'].includes(e.event))
          if (lastActionEvent?.event === 'action_intent') task.lastExecutionState = 'unknown'
        }
        task.phase = 'unknown'; task.summary = '后台中断；未自动恢复手机操作。'; await this.record(task, 'interrupted')
      }
    }
    let profiles: ModelProfile[] = []
    try { profiles = JSON.parse(await readFile(join(this.options.root, 'models-v1.json'), 'utf8')) as ModelProfile[] }
    catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error }
    for (const profile of profiles) this.profiles.set(profile.id, profile)
    await this.goals.initialize()
  }
  get hostDriven(): boolean { return this.options.executor.mode === 'host' }
  get defaultProfile(): ModelProfile | undefined {
    return this.hostDriven ? { id: 'host', protocol: 'openai-responses', baseUrl: '', model: '宿主当前模型', credentialRef: '' } : [...this.profiles.values()].at(-1)
  }
  get activeCount(): number { return [...this.tasks.values()].filter(t => !terminal(t.phase)).length }
  list(owner?: string): Task[] { return structuredClone([...this.tasks.values()].filter(t => !owner || t.owner === owner).sort(newestTaskFirst)) }
  async events(id: string, owner?: string) { this.get(id, owner); return this.store.events(id) }
  async preview(deviceId: string) {
    if (!deviceId) throw new Error('Choose a phone')
    const signal = AbortSignal.timeout(60_000)
    const devices = await this.options.hardware.resolveDevices([deviceId], signal)
    return this.viewers.open('workbench-preview:' + deviceId, devices, signal)
  }
  get(id: string, owner?: string): Task {
    const task = this.tasks.get(id)
    if (!task || (owner && task.owner !== owner)) throw new Error('Unknown task or task belongs to another host conversation')
    return structuredClone(task)
  }
  saveModel(input: ModelInput): Promise<ModelProfile> {
    if (this.hostDriven) return Promise.reject(new Error('Model configuration is disabled in host mode'))
    const next = this.modelWrites.then(() => this.configureModel(input))
    this.modelWrites = next.then(() => {}, () => {})
    return next
  }
  private async configureModel(input: ModelInput): Promise<ModelProfile> {
    if (typeof input.secret !== 'string' || !input.secret.trim() || input.secret.length > 8192 || /[\r\n\0]/.test(input.secret)) throw new Error('A valid model credential is required')
    if (!['openai-completions', 'openai-responses'].includes(input.protocol)) throw new Error('Unsupported model protocol')
    const url = new URL(input.baseUrl)
    const remoteHttp = url.protocol === 'http:' && !['localhost', '127.0.0.1', '[::1]'].includes(url.hostname)
    if (url.username || url.password || url.search || url.hash || (url.protocol !== 'https:' && url.protocol !== 'http:')) throw new Error('Use an HTTP or HTTPS model endpoint without credentials in its URL')
    if (remoteHttp && input.allowRemoteHttp !== true) throw new Error('Confirm unencrypted transfer for this remote HTTP model endpoint')
    if (!input.model?.trim() || input.model.length > 200) throw new Error('Model name required')
    const profile: ModelProfile = { id: randomUUID(), protocol: input.protocol as ModelProfile['protocol'], baseUrl: url.href.replace(/\/$/, ''), model: input.model, credentialRef: randomUUID(), ...(remoteHttp ? { allowRemoteHttp: true } : {}) }
    await this.options.executor.probe(profile, input.secret, AbortSignal.timeout(60_000))
    await this.options.credentials.set(profile.credentialRef, input.secret)
    const path = join(this.options.root, 'models-v1.json')
    await writeFile(path + '.tmp', JSON.stringify([...this.profiles.values(), profile]), { mode: 0o600 })
    await rename(path + '.tmp', path)
    this.profiles.set(profile.id, profile)
    return structuredClone(profile)
  }
  submit(input: StartTask, owner: string, frozenModel?: ModelProfile): Promise<Task> {
    const next = this.admissions.then(async () => {
      if (this.closing) throw new Error('Runtime stopping')
      for (const field of ['requestId', 'goal', 'successCriteria'] as const) if (typeof input[field] !== 'string' || !input[field].trim() || input[field].length > (field === 'requestId' ? 200 : 8000)) throw new Error(`${field} is required and must be bounded`)
      const previous = [...this.tasks.values()].find(t => t.owner === owner && t.requestId === input.requestId)
      if (previous) {
        if (previous.goal !== input.goal || previous.successCriteria !== input.successCriteria || (input.deviceId && previous.deviceId !== input.deviceId) || (input.modelProfileId && previous.modelProfile.id !== input.modelProfileId)) throw new Error('Request id already used with different arguments')
        return structuredClone(previous)
      }
      const profile = frozenModel ?? (this.hostDriven ? this.defaultProfile : input.modelProfileId ? this.profiles.get(input.modelProfileId) : this.defaultProfile)
      if (!profile) throw new Error('Configure and test a visual model in the workbench first')
      const devices = await this.options.hardware.resolveDevices(input.deviceId ? [input.deviceId] : undefined, AbortSignal.timeout(15_000))
      if (devices.length !== 1) throw new Error('Choose exactly one authorized phone or Android emulator')
      const device = devices[0]!
      const now = new Date().toISOString()
      const task: Task = { id: randomUUID(), owner, ...(input.parentId ? { parentId: input.parentId } : {}), requestId: input.requestId, goal: input.goal, successCriteria: input.successCriteria, deviceId: device.id, deviceName: device.name, modelProfile: structuredClone(profile), phase: 'queued', createdAt: now, updatedAt: now, sequence: 0, steps: 0, summary: '等待手机可用', evidence: [], checks: [] }
      await this.record(task, 'accepted')
      this.tasks.set(task.id, task)
      this.schedule()
      return structuredClone(task)
    })
    this.admissions = next.then(() => {}, () => {})
    return next
  }
  async manage(id: string, action: string, text?: string, owner?: string): Promise<Task> {
    this.get(id, owner)
    const task = this.tasks.get(id)!
    if (action === 'status') return this.get(id, owner)
    if (terminal(task.phase)) return this.get(id, owner)
    const running = this.running.get(id)
    if (action === 'resume' && task.phase === 'waiting' && running?.resume) {
      running.resume(text?.trim() || '用户已处理，请重新观察原手机后继续。')
      return this.get(id, owner)
    }
    if (action === 'steer') {
      if (!text?.trim() || text.length > 8000) throw new Error('A bounded instruction is required')
      if (!running && task.phase === 'queued') {
        const pending = [...(task.pendingInstructions ?? []), text]
        if (pending.join('\n').length > 16000) throw new Error('Pending instruction budget exhausted')
        task.pendingInstructions = pending; await this.record(task, 'instruction_accepted'); return this.get(id, owner)
      }
      if (!running || task.phase === 'stopping') throw new Error('Wait until the task is preparing or running')
      task.summary = text
      await this.record(task, 'instruction_accepted')
      if (running.resume) running.resume(text); else if (running.steer) running.steer(text); else running.pending.push(text)
    } else if (action === 'stop') {
      if (running) running.stopRequested = true
      task.phase = running ? 'stopping' : 'cancelled'
      await this.record(task, 'stop_requested')
      running?.controller.abort(new Error('Explicit stop'))
      await running?.done
    } else throw new Error('Unknown task operation')
    return this.get(id, owner)
  }
  async close(): Promise<void> {
    this.closing = true
    await this.goals.close()
    for (const run of this.running.values()) run.controller.abort(new Error('Runtime interrupted'))
    await Promise.allSettled([...this.running.values()].map(r => r.done))
    await this.viewers.dispose()
    await this.options.hardware.dispose()
  }
  private async record(task: Task, event: string): Promise<void> {
    task.sequence++; task.updatedAt = new Date().toISOString()
    // Viewer grants are ephemeral capabilities, never journal them.
    const saved = structuredClone(task); delete saved.viewerUrl; delete saved.viewerId
    await this.store.append(saved, event)
    if (task.parentId && ['user_help_requested', 'user_help_resolved'].includes(event)) await this.goals.reconcile(task.parentId)
  }
  private schedule(): void {
    if (this.closing) return
    const devices = new Set([...this.running.keys()].map(id => this.tasks.get(id)!.deviceId))
    for (const task of this.tasks.values()) {
      if (this.running.size >= 4) break
      if (task.phase !== 'queued' || devices.has(task.deviceId)) continue
      devices.add(task.deviceId)
      const run: Running = { controller: new AbortController(), done: Promise.resolve(), pending: [...(task.pendingInstructions ?? [])] }
      this.running.set(task.id, run)
      run.done = Promise.resolve().then(() => this.execute(task, run)).finally(() => { this.running.delete(task.id); this.schedule() })
      void run.done.catch(() => {})
    }
  }
  private async execute(task: Task, run: Running): Promise<void> {
    const signal = AbortSignal.any([run.controller.signal, AbortSignal.timeout(30 * 60_000)])
    let lease: Awaited<ReturnType<typeof acquireDeviceLease>> | undefined
    let serial: string | undefined
    let outcome: Task['phase'] = 'blocked'
    const actor = {}
    let last: RawPhoneObservation | undefined
    let finishing = false
    let declined = false
    let terminalObservation = false
    const capture = async (observation: RawPhoneObservation): Promise<RawPhoneObservation> => {
      const id = observation.observationId
      const file = `${randomUUID()}.jpg`
      await writeFile(join(this.options.root, 'evidence-v1', file), observation.image.data, { mode: 0o600 })
      task.evidence.push({ id, file, capturedAt: new Date().toISOString(), width: observation.image.width, height: observation.image.height })
      last = observation
      await this.record(task, 'observation')
      signal.throwIfAborted()
      return observation
    }
    const observe = async () => { signal.throwIfAborted(); this.viewers.assertReady(task.viewerId!); const value = await capture(await this.options.hardware.observe(actor, signal)); terminalObservation = true; return value }
    try {
      signal.throwIfAborted()
      task.phase = 'preparing'; await this.record(task, 'preparing')
      const device = (await this.options.hardware.resolveDevices([task.deviceId], signal))[0]!
      serial = device.serial
      lease = await acquireDeviceLease(serial, `${this.options.host}:${task.id}`, this.options.leaseRoot)
      this.options.hardware.assignTarget(actor, serial)
      const viewer = await this.viewers.open(task.id, [device], signal)
      task.viewerId = viewer.viewerId; task.viewerUrl = viewer.url
      await this.record(task, 'display_wait')
      await this.viewers.status(viewer.viewerId, task.id, 30_000, signal)
      this.viewers.assertReady(viewer.viewerId)
      signal.throwIfAborted()
      const key = this.hostDriven ? '' : await this.options.credentials.get(task.modelProfile.credentialRef)
      signal.throwIfAborted()
      task.phase = 'running'; task.summary = '正在执行'; await this.record(task, 'started')
      await this.options.executor.run({ task: structuredClone(task), key, signal, observe,
        act: async input => {
          signal.throwIfAborted()
          if (finishing || task.phase !== 'running') throw new Error('Task no longer accepts actions')
          if (!last || input.observationId !== last.observationId) throw new Error('stale_observation: observe again')
          const effect = input.externalSideEffect ?? 'none'
          if (!['none', 'send', 'publish', 'purchase', 'delete'].includes(String(effect))) throw new Error('Invalid external side effect')
          if (effect !== 'none') {
            if (declined) throw new Error('user_declined: 此任务的外部操作已被拒绝，请报告受阻。')
            task.summary = '等待确认手机上的一次外部操作'; await this.record(task, 'confirmation_requested')
            const allowed = await (this.options.confirmAction ?? confirmPhoneAction)(String(effect), `目标：${task.goal}\n手机：${task.deviceName}\n动作：${JSON.stringify(input)}`, signal)
            signal.throwIfAborted()
            await this.record(task, allowed ? 'confirmation_allowed' : 'confirmation_declined')
            if (!allowed) { declined = true; throw new Error('user_declined: 此操作未获确认，请报告受阻。') }
          }
          if (++task.steps > 100) throw new Error('operation_budget_exhausted')
          terminalObservation = false
          task.lastAction = structuredClone(input)
          task.lastExecutionState = 'unknown'
          await this.record(task, 'action_intent')
          try {
            const action = { ...input }; delete action.externalSideEffect
            const next = await this.options.hardware.act(actor, action, signal)
            task.lastExecutionState = 'delivered'; await this.record(task, 'action_delivered')
            return await capture(next)
          } catch (error) {
            last = undefined
            const known = error instanceof OpenGuiError && error.executionState === 'not_executed'
            task.lastExecutionState = known ? 'not_executed' : 'unknown'
            await this.record(task, known ? 'action_rejected' : 'action_outcome_unknown')
            // Keep the controller reason so hosts can distinguish invalid arguments
            // from a changed screen without weakening the fresh-observation gate.
            const reason = error instanceof OpenGuiError
              ? ` [${error.code}] ${error.message.replace(/https?:\/\/\S+/gu, '[redacted URL]').slice(0, 400)}` : ''
            throw new Error(known ? `stale_observation: action rejected before dispatch; observe again.${reason}` : `outcome_unknown: observe the phone before deciding; do not replay this action.${reason}`)
          }
        },
        finish: async (summary: string, checks: Check[], requested) => {
          signal.throwIfAborted()
          // Completion must refer to a fresh observation obtained after all actions.
          if (!terminalObservation || !last || !checks.length || checks.some(c => c.evidenceId !== last!.observationId)) throw new Error('Fresh terminal observation and criterion checks required')
          if (requested === 'completed' && (checks.some(c => c.status !== 'passed') || !checks.some(c => c.criterion === task.successCriteria))) throw new Error('Every success criterion must pass against terminal evidence')
          finishing = true; task.checks = checks; task.summary = summary; outcome = requested
          await this.record(task, 'result_proposed')
        },
        waitForUser: async reason => {
          signal.throwIfAborted()
          if (!reason.trim() || reason.length > 8000 || finishing) throw new Error('A bounded help request is required')
          last = undefined; terminalObservation = false
          task.phase = 'waiting'; task.summary = reason
          // Install the resolver before journaling exposes the waiting state.
          let resume!: (text: string) => void
          const answer = new Promise<string>((resolve, reject) => {
            const aborted = () => reject(signal.reason)
            signal.addEventListener('abort', aborted, { once: true })
            resume = text => { signal.removeEventListener('abort', aborted); resolve(text) }
          })
          void answer.catch(() => {})
          run.resume = resume
          try {
            await this.record(task, 'user_help_requested')
            const text = await answer
            signal.throwIfAborted()
            task.phase = 'running'; task.summary = '用户已处理，正在重新观察原手机'
            await this.record(task, 'user_help_resolved')
            return text
          } finally { delete run.resume }
        },
        bindSteer: fn => { run.steer = fn; for (const text of run.pending.splice(0)) fn(text) },
        usage: (input, output) => { if (Number.isFinite(input) && Number.isFinite(output)) task.usage = { input: (task.usage?.input ?? 0) + input, output: (task.usage?.output ?? 0) + output } },
      })
      if (!finishing) { outcome = 'blocked'; task.summary = '模型已停止，但没有提供完整终态证据。' }
    } catch (error) {
      outcome = this.closing ? 'unknown' : run.stopRequested ? 'cancelled' : task.steps ? 'unknown' : 'blocked'
      const message = error instanceof Error ? error.message : 'Execution failed'
      // Provider errors can include credentials or request payloads. Persist only known local failures.
      task.error = /^(device_busy|display_timeout|waiting_for_frame|stale_observation|operation_budget|outcome_unknown)/.test(message) ? message.slice(0, 240) : this.hostDriven ? '执行中断，请检查手机连接，并在宿主会话中查看执行状态。' : '执行中断，请检查手机连接和模型配置。'
      task.summary = task.error
    } finally {
      if (run.stopRequested) outcome = 'cancelled'
      try {
        if (serial && lease) await this.options.hardware.releaseDevice(serial)
        if (lease) await lease.release()
      } catch { outcome = 'unknown'; task.error = '资源清理未确认，设备锁保留。' }
      if (outcome === 'cancelled') {
        // Only report a stop after cleanup, retaining any uncertain action outcome.
        if (task.lastExecutionState === 'unknown') {
          task.error = '任务已停止；最后一次动作结果未知，请检查手机画面。'
          task.summary = task.error
        } else {
          delete task.error
          task.summary = '任务已停止'
        }
      }
      if (task.viewerId) this.viewers.endTask(task.viewerId)
      task.phase = outcome
      await this.record(task, 'settled')
      if (task.parentId) await this.goals.reconcile(task.parentId)
    }
  }
}
