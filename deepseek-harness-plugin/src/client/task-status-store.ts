import { useSyncExternalStore } from 'react'
import { PHONE_TASK_STATUS_PATH, PHONE_TASK_STOP_PATH } from '../mirror-contract.ts'
import type { CoremateTaskStatus } from '../mirror-contract.ts'

export interface CoremateTaskSnapshot {
  readonly task: CoremateTaskStatus
  readonly launching: boolean
  readonly launchError?: string
  readonly bridgeError?: string
}

const IDLE: CoremateTaskStatus = { active: false, phase: 'idle', selectionLocked: false }
const STOP_TIMEOUT_MS = 5_000
const STOP_REFRESH_TIMEOUT_MS = 1_000

export class CoremateTaskStatusStore {
  private snapshot: CoremateTaskSnapshot = { task: IDLE, launching: false }
  private readonly listeners = new Set<() => void>()
  private readonly consumedSessionIds = new Set<string>()
  private controller: AbortController | undefined
  private timer: ReturnType<typeof setTimeout> | undefined
  private launchTimer: ReturnType<typeof setTimeout> | undefined

  getSnapshot = (): CoremateTaskSnapshot => this.snapshot
  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }

  connect(): () => void {
    if (this.controller !== undefined) return () => {}
    const controller = new AbortController()
    this.controller = controller
    const poll = async (): Promise<void> => {
      try { await this.refresh(controller.signal) } catch { /* retain last known owner and stop path */ }
      finally {
        if (!controller.signal.aborted) this.timer = setTimeout(poll, document.hidden ? 5_000 : 1_000)
      }
    }
    void poll()
    return () => {
      controller.abort()
      if (this.timer !== undefined) clearTimeout(this.timer)
      this.clearLaunchTimer()
      if (this.controller === controller) this.controller = undefined
    }
  }

  async refresh(signal?: AbortSignal): Promise<CoremateTaskStatus> {
    const response = await fetch(PHONE_TASK_STATUS_PATH, { cache: 'no-store', ...(signal === undefined ? {} : { signal }) })
    if (!response.ok) throw new Error(`OpenGUI 任务状态请求失败 (${response.status})`)
    const task = await response.json() as CoremateTaskStatus
    if (task.active && task.ownerSessionId !== undefined) this.consumedSessionIds.add(task.ownerSessionId)
    if (task.active) this.clearLaunchTimer()
    const { launchError: _launchError, ...current } = this.snapshot
    this.publish({
      ...current,
      task,
      launching: task.active ? false : current.launching,
      ...(!task.active && _launchError !== undefined ? { launchError: _launchError } : {}),
    })
    return task
  }

  async stop(): Promise<void> {
    const stopController = new AbortController()
    const stopTimer = setTimeout(() => stopController.abort(new Error('停止 OpenGUI 操作超时，请检查 Host 后重试。')), STOP_TIMEOUT_MS)
    try {
      const response = await fetch(PHONE_TASK_STOP_PATH, {
        method: 'POST',
        headers: { Accept: 'application/json' },
        signal: stopController.signal,
      })
      if (!response.ok && response.status !== 409) throw new Error(`停止 OpenGUI 操作失败 (${response.status})`)
    } catch (error) {
      if (stopController.signal.aborted) throw stopController.signal.reason
      throw error
    } finally {
      clearTimeout(stopTimer)
    }

    const refreshController = new AbortController()
    const refreshTimer = setTimeout(() => refreshController.abort(), STOP_REFRESH_TIMEOUT_MS)
    try {
      await this.refresh(refreshController.signal)
    } catch {
      /* polling retains the last truthful Host state after an accepted stop */
    } finally {
      clearTimeout(refreshTimer)
    }
  }

  /** Reserve the short gap before the Host publishes the admitted task. */
  beginLaunch(ownerSessionId?: string): boolean {
    if (this.snapshot.launching || this.snapshot.task.active) return false
    if (ownerSessionId !== undefined) this.consumedSessionIds.add(ownerSessionId)
    this.clearLaunchTimer()
    const { launchError: _launchError, ...current } = this.snapshot
    this.publish({ ...current, launching: true })
    this.launchTimer = setTimeout(() => {
      if (this.snapshot.launching) this.finishLaunch('OpenGUI 启动超时，请检查连接后重试。')
    }, 5_000)
    return true
  }

  /** A command-only OpenGUI session must never be reused as a blank draft. */
  isConsumedSession(sessionId: string): boolean {
    return this.consumedSessionIds.has(sessionId)
  }

  markConsumedSession(sessionId: string): void {
    this.consumedSessionIds.add(sessionId)
  }

  /** Finish command admission; task execution, once observed, remains Host-owned. */
  finishLaunch(error?: string): void {
    this.clearLaunchTimer()
    const { launchError: _launchError, ...current } = this.snapshot
    this.publish(error === undefined
      ? { ...current, launching: false }
      : { ...current, launching: false, launchError: error })
  }

  setBridgeError(error?: string): void {
    const { bridgeError: _bridgeError, ...current } = this.snapshot
    this.publish(error === undefined ? current : { ...current, bridgeError: error })
  }

  private clearLaunchTimer(): void {
    if (this.launchTimer !== undefined) clearTimeout(this.launchTimer)
    this.launchTimer = undefined
  }

  private publish(next: CoremateTaskSnapshot): void {
    this.snapshot = next
    for (const listener of this.listeners) listener()
  }
}

export const coremateTaskStatusStore = new CoremateTaskStatusStore()

export function useCoremateTaskStatus(): CoremateTaskSnapshot {
  return useSyncExternalStore(coremateTaskStatusStore.subscribe, coremateTaskStatusStore.getSnapshot)
}
