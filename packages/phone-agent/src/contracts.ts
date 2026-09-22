import type { RawPhoneObservation } from '../../device-runtime/src/phone-controller.ts'
import type { ViewerStreams } from '../../device-runtime/src/viewer.ts'

export type Host = 'codex' | 'workbuddy' | 'dsh'
export type Phase = 'queued' | 'preparing' | 'running' | 'waiting' | 'stopping' | 'completed' | 'blocked' | 'failed' | 'cancelled' | 'unknown'
export const terminal = (phase: Phase): boolean => ['completed', 'blocked', 'failed', 'cancelled', 'unknown'].includes(phase)
export interface ModelProfile {
  id: string
  protocol: 'openai-completions' | 'openai-responses'
  baseUrl: string
  model: string
  credentialRef: string
}
export interface Device { id: string; name: string; authorized: boolean; connected: boolean; state: string }
export interface Hardware {
  readonly videoStreams?: ViewerStreams
  listDevices(signal: AbortSignal): Promise<readonly Device[]>
  resolveDevices(ids: readonly string[] | undefined, signal: AbortSignal): Promise<readonly (Device & { serial: string })[]>
  assignTarget(actor: object, serial: string): void
  observe(actor: object, signal: AbortSignal): Promise<RawPhoneObservation>
  act(actor: object, input: Record<string, unknown>, signal: AbortSignal): Promise<RawPhoneObservation>
  releaseDevice(serial: string): Promise<void>
  dispose(): Promise<void>
}
export interface Evidence { id: string; file: string; capturedAt: string; width: number; height: number }
export interface Check { criterion: string; status: 'passed' | 'failed' | 'unknown'; evidenceId: string }
export interface Task {
  id: string; owner: string; requestId: string; goal: string; successCriteria: string
  deviceId: string; deviceName: string; modelProfile: ModelProfile
  phase: Phase; createdAt: string; updatedAt: string; sequence: number
  steps: number; summary: string; evidence: Evidence[]; checks: Check[]
  pendingInstructions?: string[]
  parentId?: string
  group?: { children: string[]; plan?: TaskPlan; clarification?: string }
  lastAction?: Record<string, unknown>
  lastExecutionState?: 'not_executed' | 'delivered' | 'unknown'
  viewerId?: string; viewerUrl?: string; error?: string; usage?: { input: number; output: number }
}
export interface StartTask { parentId?: string; requestId: string; goal: string; successCriteria: string; deviceId?: string; modelProfileId?: string }
export interface Credentials { get(ref: string): Promise<string>; set(ref: string, secret: string): Promise<void> }
export interface Execution {
  task: Task; key: string; signal: AbortSignal
  observe(): Promise<RawPhoneObservation>
  act(input: Record<string, unknown>): Promise<RawPhoneObservation>
  finish(summary: string, checks: Check[], outcome: 'completed' | 'blocked'): Promise<void>
  waitForUser?(reason: string): Promise<string>
  bindSteer(fn: (text: string) => void): void
  usage(input: number, output: number): void
}
export interface Executor { readonly mode?: 'host'; plan?(planning: Planning): Promise<TaskPlan>; run(execution: Execution): Promise<void>; probe(profile: ModelProfile, key: string, signal: AbortSignal): Promise<void> }

/** Planning never has access to phone actions or credentials in its input data. */
export interface BranchPlan {
  goal: string
  successCriteria: string
  eligibleDeviceIds: string[]
}
export type TaskPlan = { kind: 'branches'; branches: BranchPlan[] } | { kind: 'clarification'; question: string }
export interface Planning {
  owner?: string
  taskId?: string
  goal: string
  successCriteria?: string
  devices: readonly Device[]
  clarification?: string
  profile: ModelProfile
  key: string
  signal: AbortSignal
  usage(input: number, output: number): void
}

/** Stable newest-first history, independent of map insertion and journal filenames. */
export function newestTaskFirst(a: Task, b: Task): number {
  return b.createdAt.localeCompare(a.createdAt) || b.id.localeCompare(a.id)
}
