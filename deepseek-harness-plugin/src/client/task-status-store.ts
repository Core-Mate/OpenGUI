import { useCallback, useSyncExternalStore } from 'react'
import {
  PHONE_TASK_STATUS_PATH,
  PHONE_TASK_STOP_PATH,
} from '../mirror-contract.ts'
import type {
  CoremateTaskStatus,
  CoremateTaskStatusResponse,
} from '../mirror-contract.ts'

export interface CoremateTaskSnapshot {
  readonly task: CoremateTaskStatus
  readonly launching: boolean
  readonly launchError: string | undefined
  readonly bridgeError: string | undefined
}

const STOP_TIMEOUT_MS = 5_000
const STOP_REFRESH_TIMEOUT_MS = 1_000
const PHASES = new Set<CoremateTaskStatus['phase']>([
  'waiting-for-device',
  'routing',
  'running',
  'stopping',
])

function idle(sessionId: string): CoremateTaskStatus {
  return {
    sessionId,
    active: false,
    phase: 'idle',
    selectionLocked: false,
    deviceIds: [],
  }
}

const UNBOUND_SNAPSHOT: CoremateTaskSnapshot = {
  task: idle(''),
  launching: false,
  launchError: undefined,
  bridgeError: undefined,
}

function taskStatus(value: unknown): CoremateTaskStatus | undefined {
  if (!value || typeof value !== 'object') return undefined
  const candidate = value as Record<string, unknown>
  if (
    typeof candidate.sessionId !== 'string' ||
    candidate.sessionId.trim().length === 0 ||
    typeof candidate.taskId !== 'string' ||
    candidate.taskId.trim().length === 0 ||
    typeof candidate.attemptId !== 'string' ||
    candidate.attemptId.trim().length === 0 ||
    candidate.active !== true ||
    typeof candidate.phase !== 'string' ||
    !PHASES.has(candidate.phase as CoremateTaskStatus['phase']) ||
    typeof candidate.selectionLocked !== 'boolean' ||
    !Array.isArray(candidate.deviceIds) ||
    candidate.deviceIds.some((deviceId) => typeof deviceId !== 'string')
  ) {
    return undefined
  }

  return {
    sessionId: candidate.sessionId,
    taskId: candidate.taskId,
    attemptId: candidate.attemptId,
    active: true,
    phase: candidate.phase as CoremateTaskStatus['phase'],
    selectionLocked: candidate.selectionLocked,
    deviceIds: [...candidate.deviceIds] as string[],
  }
}

async function errorMessage(response: Response, fallback: string): Promise<string> {
  try {
    const body = (await response.json()) as { error?: unknown }
    return typeof body.error === 'string' && body.error.length > 0
      ? body.error
      : fallback
  } catch {
    return fallback
  }
}

export class CoremateTaskStatusStore {
  private readonly snapshots = new Map<string, CoremateTaskSnapshot>()
  private readonly listeners = new Set<() => void>()
  private readonly consumedSessionIds = new Set<string>()
  private readonly launchGenerations = new Map<string, number>()
  private readonly launchTimers = new Map<string, ReturnType<typeof setTimeout>>()
  private controller: AbortController | undefined
  private timer: ReturnType<typeof setTimeout> | undefined
  private refreshGeneration = 0

  getSnapshot = (sessionId?: string): CoremateTaskSnapshot => {
    if (!sessionId) {
      return UNBOUND_SNAPSHOT
    }
    let snapshot = this.snapshots.get(sessionId)
    if (!snapshot) {
      snapshot = {
        task: idle(sessionId),
        launching: false,
        launchError: undefined,
        bridgeError: undefined,
      }
      this.snapshots.set(sessionId, snapshot)
    }
    return snapshot
  }

  activeTasks(): readonly CoremateTaskStatus[] {
    return [...this.snapshots.values()]
      .map((snapshot) => snapshot.task)
      .filter((task) => task.active)
  }

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }

  connect(intervalMs = 1_000): () => void {
    if (!this.controller) {
      const controller = new AbortController()
      this.controller = controller
      const poll = async (): Promise<void> => {
        try {
          await this.refresh(controller.signal)
        } catch {
          // Preserve the last trusted snapshot and retry after this request settles.
        } finally {
          if (!controller.signal.aborted && this.controller === controller) {
            this.timer = setTimeout(poll, intervalMs)
          }
        }
      }
      void poll()
    }

    return () => {
      this.controller?.abort()
      this.refreshGeneration += 1
      this.controller = undefined
      if (this.timer) clearTimeout(this.timer)
      this.timer = undefined
      for (const timer of this.launchTimers.values()) clearTimeout(timer)
      this.launchTimers.clear()
    }
  }

  async refresh(signal?: AbortSignal): Promise<CoremateTaskStatusResponse> {
    const generation = ++this.refreshGeneration
    const response = await fetch(PHONE_TASK_STATUS_PATH, {
      headers: { Accept: 'application/json' },
      ...(signal === undefined ? {} : { signal }),
    })
    if (!response.ok) {
      throw new Error(await errorMessage(response, '无法读取 OpenGUI 任务状态。'))
    }

    const raw = (await response.json()) as { tasks?: unknown }
    if (!Array.isArray(raw.tasks)) throw new Error('OpenGUI 任务状态响应无效。')
    const tasks = raw.tasks.flatMap((value) => {
      const status = taskStatus(value)
      return status ? [status] : []
    })
    const complete = tasks.length === raw.tasks.length
    const result: CoremateTaskStatusResponse = { tasks }
    if (generation !== this.refreshGeneration) return result

    const bySession = new Map(tasks.map((task) => [task.sessionId, task]))
    let changed = false

    for (const [sessionId, previous] of this.snapshots) {
      const task = bySession.get(sessionId)
      if (task) continue
      if (complete && previous.task.active) {
        this.snapshots.set(sessionId, {
          ...previous,
          task: idle(sessionId),
        })
        changed = true
      }
    }

    for (const task of tasks) {
      this.consumedSessionIds.add(task.sessionId)
      this.clearLaunchTimer(task.sessionId)
      const previous = this.getSnapshot(task.sessionId)
      const next: CoremateTaskSnapshot = {
        ...previous,
        task,
        launching: false,
        launchError: undefined,
      }
      if (
        previous.task !== task ||
        previous.launching ||
        previous.launchError !== undefined
      ) {
        this.snapshots.set(task.sessionId, next)
        changed = true
      }
    }

    if (changed) this.emit()
    return result
  }

  async stop(sessionId: string, taskId: string): Promise<void> {
    if (!sessionId || !taskId) throw new Error('缺少任务身份，无法停止。')
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), STOP_TIMEOUT_MS)
    try {
      const response = await fetch(PHONE_TASK_STOP_PATH, {
        method: 'POST',
        headers: {
          Accept: 'application/json',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ sessionId, taskId }),
        signal: controller.signal,
      })
      if (!response.ok) {
        throw new Error(await errorMessage(response, '停止 OpenGUI 任务失败。'))
      }
      const accepted = await response.json() as { sessionId?: unknown, taskId?: unknown }
      if (accepted.sessionId !== sessionId || accepted.taskId !== taskId) {
        throw new Error('停止 OpenGUI 任务的响应身份不匹配。')
      }
    } catch (error) {
      if (controller.signal.aborted) throw new Error('停止 OpenGUI 操作超时，请检查 Host 后重试。')
      throw error
    } finally {
      clearTimeout(timeout)
    }

    const refreshController = new AbortController()
    const refreshTimeout = setTimeout(
      () => refreshController.abort(),
      STOP_REFRESH_TIMEOUT_MS,
    )
    try {
      await this.refresh(refreshController.signal)
    } catch {
      // The next regular poll will reconcile state.
    } finally {
      clearTimeout(refreshTimeout)
    }
  }

  beginLaunch(sessionId: string): number | undefined {
    if (!sessionId) return undefined
    const current = this.getSnapshot(sessionId)
    if (current.launching || current.task.active) return undefined

    this.consumedSessionIds.add(sessionId)
    this.clearLaunchTimer(sessionId)
    const generation = (this.launchGenerations.get(sessionId) ?? 0) + 1
    this.launchGenerations.set(sessionId, generation)
    this.snapshots.set(sessionId, {
      ...current,
      launching: true,
      launchError: undefined,
    })
    this.launchTimers.set(
      sessionId,
      setTimeout(() => {
        this.finishLaunch(sessionId, generation, 'OpenGUI 任务启动超时，请重试。')
      }, STOP_TIMEOUT_MS),
    )
    this.emit()
    return generation
  }

  isConsumedSession(sessionId: string): boolean {
    return this.consumedSessionIds.has(sessionId)
  }

  markConsumedSession(sessionId: string): void {
    if (!sessionId) return
    this.consumedSessionIds.add(sessionId)
  }

  finishLaunch(sessionId: string, generation: number, error?: string): boolean {
    if (this.launchGenerations.get(sessionId) !== generation) return false
    this.clearLaunchTimer(sessionId)
    const current = this.getSnapshot(sessionId)
    this.snapshots.set(sessionId, {
      ...current,
      launching: false,
      launchError: error,
    })
    this.emit()
    return true
  }

  setBridgeError(sessionId: string, error?: string): void {
    if (!sessionId) return
    const current = this.getSnapshot(sessionId)
    if (current.bridgeError === error) return
    this.snapshots.set(sessionId, { ...current, bridgeError: error })
    this.emit()
  }

  private clearLaunchTimer(sessionId: string): void {
    const timer = this.launchTimers.get(sessionId)
    if (timer) clearTimeout(timer)
    this.launchTimers.delete(sessionId)
  }

  private emit(): void {
    for (const listener of this.listeners) listener()
  }
}

export const coremateTaskStatusStore = new CoremateTaskStatusStore()

export function useCoremateTaskStatus(
  sessionId?: string,
): CoremateTaskSnapshot {
  const getSnapshot = useCallback(
    () => coremateTaskStatusStore.getSnapshot(sessionId),
    [sessionId],
  )
  return useSyncExternalStore(
    coremateTaskStatusStore.subscribe,
    getSnapshot,
    getSnapshot,
  )
}
