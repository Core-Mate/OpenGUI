import { join } from 'node:path'
import { HostExecutor } from './host-executor.ts'
import { PhoneRuntime } from './runtime.ts'
import { Workbench } from './workbench.ts'
import { newestTaskFirst, type StartTask } from './contracts.ts'

const string = { type: 'string', minLength: 1, maxLength: 8000 }
const definitions = [
  { name: 'opengui_run_task', description: 'Submit a host-driven Android task. Open the workbench URL, then repeatedly call opengui_manage_task action next to receive decisions and screenshots. YOU, the host model, plan and execute via action decide; no separate model is configured. Do not end your turn before completion or a user-help wait. Host termination interrupts execution.', properties: { requestId: { ...string, maxLength: 200 }, goal: string, successCriteria: string, deviceId: string }, required: ['requestId', 'goal'] },
  { name: 'opengui_manage_task', description: 'Manage host-driven work. Use next with the parent taskId to advance all branches, or a branch taskId to poll only that branch. Keep using the returned decision.taskId for the whole task. Omit taskId only to claim available workbench decisions. Inspect returned context and image. Use decide with decisionId and decision: a branch plan, or {operation: observe|act|help|finish, ...}. Never execute actions through other paths. Continue next/decide until all branches finish. status/stop/steer/resume require taskId.', properties: { taskId: string, action: { type: 'string', enum: ['status', 'stop', 'steer', 'resume', 'next', 'decide'] }, text: string, decisionId: string, decision: { type: 'object', additionalProperties: true } }, required: ['action'] },
  { name: 'opengui_list_tasks', description: 'List durable host-driven tasks for this conversation. An interrupted run is unknown and never automatically replayed.', properties: {}, required: [] },
  { name: 'opengui_open_workbench', description: 'Open the host-driven phone workbench for task submission, live view and evidence. No model setup is needed. Use opengui_manage_task next to pick up tasks submitted here.', properties: {}, required: [] },
]
export const TASK_TOOLS = definitions.map(tool => ({
  name: tool.name, title: 'OpenGUI Phone Tasks', description: tool.description,
  inputSchema: { type: 'object', additionalProperties: false, properties: tool.properties, required: tool.required },
  outputSchema: { type: 'object' },
  annotations: { readOnlyHint: tool.name === 'opengui_list_tasks', destructiveHint: tool.name === 'opengui_run_task', idempotentHint: true, openWorldHint: tool.name === 'opengui_run_task' },
}))
export const isTaskTool = (name: string): boolean => TASK_TOOLS.some(t => t.name === name)

/** Durable records belong to the daemon; execution remains bound to its host. */
export class TaskHost {
  private ready: Promise<PhoneRuntime> | undefined
  private runtime: PhoneRuntime | undefined
  private workbench: Workbench | undefined
  constructor(private readonly factory: () => PhoneRuntime) {}
  get watching(): boolean { return this.workbench?.active ?? false }
  get activeCount(): number { return (this.runtime?.activeCount ?? 0) + (this.runtime?.goals.activeCount ?? 0) }
  prepareMaintenance(): boolean {
    if ((this.ready && !this.runtime) || this.activeCount) return false
    return this.workbench?.prepareMaintenance() ?? true
  }
  private load(): Promise<PhoneRuntime> {
    this.ready ??= (async () => { const runtime = this.factory(); await runtime.initialize(); this.runtime = runtime; this.workbench = new Workbench(runtime); return runtime })()
    return this.ready
  }
  async call(name: string, args: Record<string, unknown>, owner: string): Promise<unknown> {
    if (process.platform !== 'darwin') throw new Error('Autonomous phone tasks currently support macOS only')
    const runtime = await this.load()
    const url = await this.workbench!.open(owner)
    const claimed = (id: string): boolean => runtime.options.executor instanceof HostExecutor && runtime.options.executor.owns(owner, id)
    const visibleGoals = () => runtime.goals.list().filter(task => task.owner === owner || claimed(task.id))
    if (name === 'opengui_open_workbench') {
      if (runtime.options.host === 'dsh' && typeof args.embedOrigin === 'string') this.workbench!.allowEmbedding(args.embedOrigin)
      return { url }
    }
    if (name === 'opengui_manage_task' && ['next', 'decide'].includes(String(args.action))) {
      const executor = runtime.options.executor
      if (!(executor instanceof HostExecutor)) throw new Error('Host decision bridge unavailable')
      if (args.action === 'decide') {
        if (!args.decision || typeof args.decision !== 'object' || Array.isArray(args.decision)) throw new Error('Decision object required')
        executor.respond(owner, String(args.decisionId), args.decision as Record<string, unknown>)
      }
      // Allow the executor to publish the next step without keeping a host tool open indefinitely.
      for (let i = 0; i < 20; i++) {
        const decision = executor.next(owner, typeof args.taskId === 'string' ? args.taskId : undefined)
        if (decision) {
          if (runtime.options.host === 'codex' && decision.context.image && typeof decision.context.branchId === 'string') {
            const proof = runtime.get(decision.context.branchId).evidence.at(-1)
            if (!proof) throw new Error('Observation evidence missing')
            decision.context.imagePath = join(runtime.options.root, 'evidence-v1', proof.file)
            delete decision.context.image
          }
          return { decision, workbenchUrl: url }
        }
        await new Promise(resolve => setTimeout(resolve, 100))
      }
      return { decision: null, tasks: visibleGoals(), instruction: 'Check task states. If unfinished and not waiting for user help, call next again; do not report completion from an empty mailbox.' }
    }
    if (name === 'opengui_list_tasks') return { tasks: [...visibleGoals(), ...runtime.list(owner).filter(t => !t.parentId)].sort(newestTaskFirst) }
    if (name === 'opengui_manage_task') {
      const id = String(args.taskId)
      const manager = runtime.goals.tasks.has(id) ? runtime.goals : runtime
      const task = manager.get(id)
      // A mailbox claim delegates only this webpage task and its bound branches.
      const effectiveOwner = task.owner === 'workbench' && claimed(task.parentId ?? task.id) ? task.owner : owner
      return manager.manage(id, String(args.action), typeof args.text === 'string' ? args.text : undefined, effectiveOwner)
    }
    if (name === 'opengui_run_task') { const task = await runtime.goals.submit(args as unknown as StartTask, owner); return { ...task, workbenchUrl: url + '#' + task.id } }
    throw new Error('Unknown task tool')
  }
  async interruptOwner(owner: string, preserveUserWait = false): Promise<void> {
    const runtime = this.runtime
    if (!runtime || !(runtime.options.executor instanceof HostExecutor)) return
    const executor = runtime.options.executor
    await Promise.all(runtime.goals.list().filter(t => (t.owner === owner || executor.owns(owner, t.id)) && !(preserveUserWait && (t.phase === 'waiting' || (t.phase === 'blocked' && t.group?.plan?.kind === 'clarification')))).map(t => runtime.goals.manage(t.id, 'stop')))
  }
  async close(): Promise<void> { if (this.ready) { await this.ready; await this.runtime?.close(); await this.workbench?.close() } }
}
