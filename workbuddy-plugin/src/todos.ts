import { randomUUID } from 'node:crypto'
import { OpenGuiError } from './errors.ts'

/** TODO status vocabulary shared with the adapted DeepSeek Harness panel. */
export interface TodoItem {
  readonly stepId?: string
  readonly content: string
  readonly status: 'pending' | 'in_progress' | 'awaiting_user' | 'completed' | 'failed' | 'skipped'
  readonly reason?: string
}
export interface TaskStep extends TodoItem { readonly stepId: string }

export function normalizeTodos(value: unknown): readonly TodoItem[] {
  if (!Array.isArray(value) || value.length > 100) throw new Error('invalid_todos: expected at most 100 items')
  const contents = new Set<string>(), ids = new Set<string>()
  return value.map(item => {
    if (!item || typeof item !== 'object' || typeof item.content !== 'string'
      || !['pending', 'in_progress', 'awaiting_user', 'completed', 'failed', 'skipped'].includes(item.status)) throw new Error('invalid_todos: invalid content or status')
    if (item.reason !== undefined && (typeof item.reason !== 'string' || !item.reason.trim() || item.reason.length > 2000)) throw new Error('invalid_todos: invalid reason')
    const content = item.content.trim()
    if (!content || content.length > 2000 || contents.has(content)) throw new Error('invalid_todos: content must be non-empty, bounded and unique')
    contents.add(content)
    if (item.stepId !== undefined) {
      if (typeof item.stepId !== 'string' || !item.stepId.trim() || item.stepId.length > 128 || ids.has(item.stepId)) throw new Error('invalid_todos: stepId must be non-empty, bounded and unique')
      ids.add(item.stepId)
    }
    return { content, status: item.status as TodoItem['status'], ...(item.reason === undefined ? {} : { reason: item.reason as string }), ...(item.stepId === undefined ? {} : { stepId: item.stepId as string }) }
  })
}

/** The board and tool responses use the same structured progress and message. */
export interface TaskProgress {
  readonly completed: number
  readonly total: number
  readonly inProgress: number
  readonly pending: number
  readonly awaitingUser?: number
  readonly failed?: number
  readonly skipped?: number
  readonly message: string
  readonly currentNodeIndex?: number
  readonly currentStepId?: string
  readonly currentNode?: string
  readonly nextStepId?: string
}

export class TaskPlan {
  private items: readonly TaskStep[] = []
  private synchronized = false
  private indexesStable = true
  private paused = false
  get todos(): readonly TaskStep[] { return this.items }
  restore(value: unknown): void {
    const items = normalizeTodos(value)
    if (items.some(item => !item.stepId)) throw new Error('invalid_saved_plan')
    this.items = items as readonly TaskStep[]
    this.synchronized = items.some(item => item.status !== 'pending')
    this.indexesStable = false
    this.paused = true
  }

  revise(value: unknown): void {
    const normalized = normalizeTodos(value)
    const existing = new Map(this.items.map(item => [item.stepId, item]))
    const candidate = normalized.map(item => {
      const prior = item.stepId === undefined ? this.items.find(old => old.content === item.content) : existing.get(item.stepId)
      if (item.stepId !== undefined && !prior) this.fail('task_step_unknown', 'use a returned stepId from this task; omit it for a new pending step')
      if (['awaiting_user', 'failed', 'skipped'].includes(item.status) && (!prior || prior.status !== item.status || prior.reason !== item.reason)) this.fail('task_status_owned', 'review, failure and skip states are assigned by the runtime; retain returned states')
      return { ...item, stepId: prior?.stepId ?? randomUUID() }
    })
    if (new Set(candidate.map(item => item.stepId)).size !== candidate.length) this.fail('task_step_duplicate', 'each task step must have one unique stepId')
    if (this.synchronized) {
      // Completed and active steps retain their proven meaning; only the pending suffix can be replanned.
      const prefixLength = this.items.findLastIndex(item => item.status !== 'pending') + 1
      if (candidate.length < prefixLength || this.items.slice(0, prefixLength).some((item, index) => {
        const next = candidate[index]
        return next?.stepId !== item.stepId || next.content !== item.content || next.status !== item.status || next.reason !== item.reason
      }) || candidate.slice(prefixLength).some(item => item.status !== 'pending' || (existing.get(item.stepId)?.status ?? 'pending') !== 'pending')) {
        this.fail('task_plan_locked', 'synchronized completed/active steps retain their content, order and status; replan only pending steps')
      }
    }
    if (this.items.some((item, index) => candidate[index]?.stepId !== item.stepId)) this.indexesStable = false
    this.items = candidate
  }

  select(index: unknown, evidenceObservationId?: string, stepId?: string): void {
    if (!this.items.length && index === undefined && stepId === undefined) return
    let selected: number
    if (stepId !== undefined) {
      selected = this.items.findIndex(item => item.stepId === stepId)
      if (selected < 0) this.fail('task_step_unknown', 'stepId does not belong to the current task plan')
      if (index !== undefined && index !== selected) this.fail('task_node_mismatch', 'stepId and taskNodeIndex refer to different steps; use the returned stepId')
    } else {
      if (!this.indexesStable) this.fail('task_node_id_required', 'the plan order changed; use stepId from the latest plan or progress')
      if (!Number.isInteger(index) || (index as number) < 0 || (index as number) >= this.items.length) this.fail('task_node_required', 'pass the returned stepId (or a compatible zero-based taskNodeIndex)')
      selected = index as number
    }
    const first = this.items.findIndex(item => !terminal(item))
    if (first < 0 || this.items.slice(first + 1).some(item => !terminal(item) && item.status !== 'pending')) this.fail('task_plan_invalid', 'complete task nodes in order with at most one active node')
    const next = this.items.findIndex((item, index) => index > first && !terminal(item))
    const advancing = selected === next && this.items[first]!.status === 'in_progress'
    if (selected !== first && !advancing) this.fail('task_node_out_of_order', `continue node ${first}, or advance one verified node`)
    if (advancing && !evidenceObservationId) throw new OpenGuiError('task_node_unverified', 'opengui: advancing requires the latest observation confirming the previous node', 'not_executed', 'observe')
    if (selected !== first || this.items[first]!.status !== 'in_progress') {
      this.items = this.items.map((item, node) => ({ ...item, status: advancing && node === first ? 'completed' : node === selected ? 'in_progress' : item.status }))
    }
    this.synchronized = true
    this.paused = false
  }

  /** Persist a case activation and its verified plan transition as one change. */
  selectWith<T>(stepId: string | undefined, evidenceObservationId: string | undefined, persist: () => T): T {
    const previous = { items: this.items, synchronized: this.synchronized, indexesStable: this.indexesStable, paused: this.paused }
    try {
      this.select(undefined, evidenceObservationId, stepId)
      return persist()
    } catch (error) {
      this.items = previous.items; this.synchronized = previous.synchronized
      this.indexesStable = previous.indexesStable; this.paused = previous.paused
      throw error
    }
  }

  finish(): void {
    if (!this.items.length || this.items.every(terminal)) return
    if (!this.synchronized || this.items.filter(item => !terminal(item)).length !== 1 || !this.items.some(item => item.status === 'in_progress')) this.fail('task_nodes_incomplete', 'complete task nodes in order before reporting the whole task completed')
    this.items = this.items.map(item => ({ ...item, status: item.status === 'in_progress' ? 'completed' : item.status }))
  }

  pause(): void { this.paused = true }
  awaitUser(waiting: boolean): void {
    this.items = this.items.map(item => item.status === (waiting ? 'in_progress' : 'awaiting_user') ? { ...item, status: waiting ? 'awaiting_user' : 'in_progress' } : item)
  }
  settle(stepId: string, status: 'failed' | 'skipped', reason: string): void {
    const item = this.items.find(item => item.stepId === stepId)
    if (!item || terminal(item) || !reason.trim()) this.fail('task_step_unavailable', 'settle only an unfinished step with an explicit reason')
    this.items = this.items.map(item => item.stepId === stepId ? { ...item, status, reason: reason.slice(0, 2000) } : item)
    this.synchronized = true
  }

  progress(): TaskProgress | undefined {
    if (!this.items.length) return undefined
    const currentNodeIndex = this.items.findIndex(item => item.status === 'in_progress' || item.status === 'awaiting_user')
    const current = this.items[currentNodeIndex], completed = this.items.filter(item => item.status === 'completed').length
    const inProgress = this.items.filter(item => item.status === 'in_progress').length
    const awaitingUser = this.items.filter(item => item.status === 'awaiting_user').length, failed = this.items.filter(item => item.status === 'failed').length, skipped = this.items.filter(item => item.status === 'skipped').length
    const next = current ? this.items.find((item, index) => index > currentNodeIndex && !terminal(item)) : this.items.find(item => item.status === 'pending')
    const detail = completed === this.items.length ? '任务步骤已全部完成'
      : this.paused ? (current ? `任务暂停，未完成：${current.content}` : '任务暂停')
      : current?.status === 'awaiting_user' ? `等待用户处理：${current.content}`
      : current ? `正在${current.content.replace(/^正在\s*/u, '')}` : this.items.every(terminal) ? `检查已结束，失败 ${failed}，跳过 ${skipped}` : '等待开始下一步'
    return { completed, total: this.items.length, inProgress, pending: this.items.filter(item => item.status === 'pending').length,
      ...(awaitingUser ? { awaitingUser } : {}), ...(failed ? { failed } : {}), ...(skipped ? { skipped } : {}),
      message: `已完成 ${completed} / ${this.items.length}，${detail}`,
      ...(current ? { currentNodeIndex, currentStepId: current.stepId, currentNode: current.content } : {}),
      ...(next ? { nextStepId: next.stepId } : {}),
    }
  }

  private fail(code: string, message: string): never { throw new OpenGuiError(code, `opengui: ${message}`, 'not_executed', 'replan') }
}
const terminal = (item: TodoItem) => ['completed', 'failed', 'skipped'].includes(item.status)
