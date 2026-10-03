import { validatePlan } from './planner.ts'
import { randomUUID } from 'node:crypto'
import { join } from 'node:path'
import type { PhoneRuntime } from './runtime.ts'
import { newestTaskFirst, terminal, type Task, type StartTask } from './contracts.ts'
import { TaskStore } from './store.ts'

interface PlanningRun { controller: AbortController; done: Promise<void> }
/** Parent business goals own planning and independent, device-bound executions. */
export class GoalRuntime {
  readonly tasks = new Map<string, Task>()
  private readonly store: TaskStore
  private admissions = Promise.resolve()
  private readonly planning = new Map<string, PlanningRun>()
  private closing = false
  constructor(private readonly runtime: PhoneRuntime) { this.store = new TaskStore(join(runtime.options.root, 'goals-v1')) }
  async initialize(): Promise<void> {
    for (const task of await this.store.load()) {
      this.tasks.set(task.id, task)
      if (!terminal(task.phase)) { task.phase = 'unknown'; task.summary = '后台中断，未重新规划或重放分支。'; await this.record(task, 'interrupted') }
    }
  }
  get activeCount(): number { return [...this.tasks.values()].filter(t => !terminal(t.phase)).length }
  private children(task: Task): Task[] { return [...this.runtime.tasks.values()].filter(t => t.parentId === task.id) }
  get(id: string, owner?: string): Task {
    const task = this.tasks.get(id)
    if (!task || owner && task.owner !== owner) throw new Error('Unknown goal')
    const view = structuredClone(task)
    const children = this.children(task)
    view.steps = children.reduce((sum, child) => sum + child.steps, 0)
    if (view.usage && children.length && children.every(child => child.usage)) {
      view.usage = children.reduce((sum, child) => ({ input: sum.input + child.usage!.input, output: sum.output + child.usage!.output }), view.usage)
    } else delete view.usage
    return view
  }
  list(owner?: string): Task[] { return [...this.tasks.values()].filter(t => !owner || t.owner === owner).sort(newestTaskFirst).map(t => this.get(t.id)) }
  events(id: string, owner?: string) { this.get(id, owner); return this.store.events(id) }
  submit(input: Partial<StartTask> & { requestId: string; goal: string }, owner: string): Promise<Task> {
    const next = this.admissions.then(async () => {
      if (this.closing) throw new Error('Runtime stopping')
      if (typeof input.goal !== 'string' || !input.goal.trim() || input.goal.length > 8000 || typeof input.requestId !== 'string' || !input.requestId.trim() || input.requestId.length > 200) throw new Error('Bounded goal and request ID required')
      const previous = [...this.tasks.values()].find(t => t.owner === owner && t.requestId === input.requestId)
      const goal = input.goal.trim()
      if (previous) {
        if (previous.goal !== goal || previous.successCriteria !== (input.successCriteria?.trim() || goal) || previous.deviceId !== (input.deviceId || '') || (input.modelProfileId && previous.modelProfile.id !== input.modelProfileId)) throw new Error('Request ID already used')
        return this.get(previous.id)
      }
      const profile = this.runtime.hostDriven ? this.runtime.defaultProfile : input.modelProfileId ? this.runtime.profiles.get(input.modelProfileId) : this.runtime.defaultProfile
      if (!profile || !this.runtime.options.executor.plan) throw new Error('Configure a planning-capable model first')
      const now = new Date().toISOString()
      const task: Task = { id: randomUUID(), owner, requestId: input.requestId, goal, successCriteria: input.successCriteria?.trim() || goal,
        deviceId: input.deviceId || '', deviceName: '自动分配', modelProfile: structuredClone(profile), phase: 'preparing', createdAt: now, updatedAt: now,
        sequence: 0, steps: 0, summary: this.runtime.hostDriven ? '等待宿主接手并安排执行分支' : '正在理解任务并安排执行分支', evidence: [], checks: [], group: { children: [] } }
      await this.record(task, 'accepted'); this.tasks.set(task.id, task)
      this.startPlanning(task)
      return this.get(task.id)
    })
    this.admissions = next.then(() => {}, () => {})
    return next
  }
  private startPlanning(task: Task): void {
    const run: PlanningRun = { controller: new AbortController(), done: Promise.resolve() }
    this.planning.set(task.id, run)
    run.done = Promise.resolve().then(() => this.plan(task, run)).finally(async () => { this.planning.delete(task.id); await this.reconcile(task.id) })
    void run.done.catch(() => {})
  }
  private async plan(task: Task, run: PlanningRun): Promise<void> {
    const signal = AbortSignal.any([run.controller.signal, AbortSignal.timeout(this.runtime.hostDriven ? 300_000 : 60_000)])
    try {
      const devices = (await this.runtime.options.hardware.listDevices(signal)).filter(d => d.authorized && d.connected && (!task.deviceId || task.deviceId === d.id))
      signal.throwIfAborted()
      if (!devices.length) throw new Error('No authorized phones')
      const key = this.runtime.hostDriven ? '' : await this.runtime.options.credentials.get(task.modelProfile.credentialRef)
      signal.throwIfAborted()
      const planningInput = { owner: task.owner, taskId: task.id, goal: task.goal, successCriteria: task.successCriteria, devices,
        ...(task.group!.clarification ? { clarification: task.group!.clarification } : {}), profile: task.modelProfile, key, signal,
        usage: (input: number, output: number) => { if (Number.isFinite(input) && Number.isFinite(output)) task.usage = { input: (task.usage?.input ?? 0) + input, output: (task.usage?.output ?? 0) + output } } }
      const proposal = await this.runtime.options.executor.plan!(planningInput)
      const plan = validatePlan(proposal as unknown as Record<string, unknown>, planningInput)
      signal.throwIfAborted()
      task.group!.plan = plan
      if (plan.kind === 'clarification') { task.phase = 'blocked'; task.summary = plan.question; await this.record(task, 'clarification_requested'); return }
      await this.record(task, 'plan_recorded')
      for (const [index, branch] of plan.branches.entries()) {
        signal.throwIfAborted()
        // All candidates were validated by the planner. Prefer the shortest local queue.
        const candidates = [...branch.eligibleDeviceIds].sort((a, b) => this.load(a) - this.load(b) || a.localeCompare(b))
        if (!candidates.length) throw new Error('No eligible phone')
        const child = await this.runtime.submit({ requestId: task.id + ':' + index, parentId: task.id,
          goal: branch.goal, successCriteria: branch.successCriteria, deviceId: candidates[0]!, modelProfileId: task.modelProfile.id }, task.owner, task.modelProfile)
        task.group!.children.push(child.id)
        await this.record(task, 'branch_created')
      }
      signal.throwIfAborted()
      task.phase = 'running'; task.summary = '执行分支已分配'; await this.record(task, 'started')
      await this.reconcile(task.id)
    } catch (error) {
      if (task.phase === 'stopping') return
      task.phase = this.closing ? 'unknown' : 'blocked'
      task.summary = this.runtime.hostDriven
        ? error instanceof Error && error.message === 'No authorized phones'
          ? '没有找到当前已授权的目标手机。请刷新设备；宿主提交任务时不要复用旧设备 ID。尚未执行手机动作。'
          : '宿主规划或分配未完成。请回到宿主查看任务状态；已创建的分支将停止，保留记录。'
        : '规划或分配未完成，请检查连接与模型。已创建的分支将停止，保留记录。'
      await Promise.allSettled(this.children(task).filter(t => !terminal(t.phase)).map(t => this.runtime.manage(t.id, 'stop')))
      if (this.children(task).some(t => t.phase === 'unknown')) task.phase = 'unknown'
      await this.record(task, 'planning_interrupted')
    }
  }
  private load(id: string): number { return [...this.runtime.tasks.values()].filter(t => t.deviceId === id && !terminal(t.phase)).length }
  async reconcile(parentId: string): Promise<void> {
    const task = this.tasks.get(parentId)
    if (!task || this.planning.has(parentId) || terminal(task.phase) || task.phase === 'stopping') return
    const children = this.children(task)
    if (!children.length) return
    task.steps = children.reduce((sum, t) => sum + t.steps, 0)
    if (children.every(t => terminal(t.phase))) {
      task.phase = children.some(t => t.phase === 'unknown') ? 'unknown' : children.every(t => t.phase === 'completed') ? 'completed' : 'blocked'
      task.summary = children.map(t => t.deviceName + ': ' + t.summary).join('\n')
      task.checks = children.flatMap(t => t.checks)
      await this.record(task, 'settled')
    } else {
      const unfinished = children.filter(t => !terminal(t.phase))
      task.phase = unfinished.every(t => t.phase === 'waiting') ? 'waiting' : 'running'
      if (task.phase === 'waiting') task.summary = unfinished.map(t => t.deviceName + ': ' + t.summary).join('\n')
      await this.record(task, 'branch_progress')
    }
  }
  async manage(id: string, action: string, text?: string, owner?: string): Promise<Task> {
    this.get(id, owner); const task = this.tasks.get(id)!
    if (action === 'status') { await this.reconcile(id); return this.get(id) }
    if (action === 'stop') {
      if (terminal(task.phase) && !(task.phase === 'blocked' && task.group?.plan?.kind === 'clarification')) return this.get(id)
      task.phase = 'stopping'; await this.record(task, 'stop_requested')
      const planning = this.planning.get(id); planning?.controller.abort(new Error('Explicit stop'))
      await planning?.done
      await Promise.allSettled(this.children(task).filter(t => !terminal(t.phase)).map(t => this.runtime.manage(t.id, 'stop')))
      task.phase = this.children(task).some(t => !terminal(t.phase) || t.phase === 'unknown') ? 'unknown' : 'cancelled'
      task.summary = task.phase === 'cancelled' ? '所有执行分支已停止' : '部分分支清理未确认'
      await this.record(task, 'settled')
    } else if (action === 'steer' || action === 'resume') {
      if (action === 'resume' && !text) text = '用户已处理，请重新观察原手机后继续。'
      if (!text?.trim() || text.length > 8000) throw new Error('Bounded instruction required')
      if (task.phase === 'blocked' && task.group?.plan?.kind === 'clarification') {
        const answer = (task.group.clarification ? task.group.clarification + '\n' : '') + text
        if (answer.length > 16000) throw new Error('Clarification budget exhausted')
        task.group.clarification = answer
        task.phase = 'preparing'; task.summary = '已收到补充，继续安排任务'; await this.record(task, 'instruction_accepted'); this.startPlanning(task)
      } else {
        if (terminal(task.phase) || this.planning.has(id) || task.phase === 'stopping') throw new Error('Wait for planning to finish')
        await Promise.all(this.children(task).filter(t => !terminal(t.phase)).map(t => this.runtime.manage(t.id, 'steer', text)))
        await this.record(task, 'instruction_accepted')
      }
    } else throw new Error('Unknown task operation')
    return this.get(id)
  }
  private async record(task: Task, event: string): Promise<void> { task.sequence++; task.updatedAt = new Date().toISOString(); await this.store.append(structuredClone(task), event) }
  async close(): Promise<void> {
    this.closing = true
    await this.admissions
    for (const run of this.planning.values()) run.controller.abort(new Error('Runtime interrupted'))
    await Promise.allSettled([...this.planning.values()].map(run => run.done))
  }
}
