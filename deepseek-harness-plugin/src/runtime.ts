import { freezeMessage } from '@deepseek-ai/dsh-llm'
import type { ContentBlock, Message } from '@deepseek-ai/dsh-llm'
import { ObservationId } from './adb.ts'
import type { ObservationId as ObservationIdType } from './adb.ts'

const OMITTED_SCREENSHOT = '[older OpenGUI screenshot omitted; use the latest observed frame]'

function phoneScreenshotCount(messages: readonly Message[]): number {
  let count = 0
  for (const message of messages) {
    for (const block of message.content) {
      if (block.type !== 'tool-result') continue
      count += block.content.filter(candidate => candidate.type === 'image').length
    }
  }
  return count
}

/**
 * Project durable phone history to one model-facing screenshot without changing the session log.
 * @param messages Complete derived child-session history.
 * @returns The original array when it has at most one phone screenshot, otherwise frozen messages with older phone images replaced by text.
 */
export function latestPhoneScreenshotMessages(messages: readonly Message[]): Message[] {
  const total = phoneScreenshotCount(messages)
  if (total <= 1) return messages as Message[]
  let seen = 0
  return messages.map((message) => {
    const content = message.content.map((block): ContentBlock => {
      if (block.type !== 'tool-result') return block
      const nested = block.content.map((candidate): ContentBlock => {
        if (candidate.type !== 'image') return candidate
        seen += 1
        if (seen === total) return candidate
        return { type: 'text', text: OMITTED_SCREENSHOT }
      })
      return nested.some((candidate, index) => candidate !== block.content[index])
        ? { ...block, content: nested }
        : block
    })
    const changed = content.some((block, index) => block !== message.content[index])
    return changed ? freezeMessage({ ...message, content }) : message
  })
}

/** Minimal observation identity retained outside the durable tool result. */
export interface PhoneFrameState {
  observationId: ObservationIdType
  screenshotFingerprint: string
}

interface NoProgressState {
  signature: string
  screenshotFingerprint: string
  count: number
}

interface AgentPhoneState {
  operations: number
  observationSequence: number
  targetSerial?: string
  latest?: PhoneFrameState
  noProgress?: NoProgressState
}

/** Per-child freshness, operation-budget, and repeated-no-progress enforcement. */
export class PhoneExecutionState {
  private readonly agents = new WeakMap<object, AgentPhoneState>()

  private state(agent: object): AgentPhoneState {
    const existing = this.agents.get(agent)
    if (existing !== undefined) return existing
    const created: AgentPhoneState = { operations: 0, observationSequence: 0 }
    this.agents.set(agent, created)
    return created
  }

  /** Bind a newly published child to one Host-private serial before its first tool call. */
  assignTarget(agent: object, serial: string): void {
    const state = this.state(agent)
    if (state.targetSerial !== undefined && state.targetSerial !== serial) {
      throw new Error('coremate-mobile: phone agent is already bound to another device')
    }
    state.targetSerial = serial
  }

  /**
   * Count one tool operation and reject before device access when the child exhausts its budget.
   * @param agent Child-agent identity that owns the task-local counter.
   * @param maxOperations Configured operation budget for that child task.
   */
  beginOperation(agent: object, maxOperations: number): void {
    const state = this.state(agent)
    state.operations += 1
    if (state.operations > maxOperations) {
      throw new Error(`coremate-mobile: phone task exceeded its ${maxOperations}-operation limit`)
    }
  }

  /**
   * Resolve the task's phone once and reuse that serial for every later call.
   * @param agent Child-agent identity that owns the phone lock.
   * @param discover Initial authorized-device selection.
   * @returns The existing or newly selected serial.
   */
  async resolveTarget(agent: object, discover: () => Promise<string>): Promise<string> {
    const state = this.state(agent)
    if (state.targetSerial !== undefined) return state.targetSerial
    const selected = await discover()
    state.targetSerial = selected
    return selected
  }

  /**
   * Allocate a child-local observation id that the next mutation must echo.
   * @param agent Child-agent identity that owns the observation sequence.
   * @returns The next opaque observation id for that child.
   */
  nextObservationId(agent: object): ObservationIdType {
    const state = this.state(agent)
    state.observationSequence += 1
    return ObservationId(`phone-observation-${state.observationSequence}`)
  }

  /**
   * Return the current frame, when the child has observed one.
   * @param agent Child-agent identity whose frame is requested.
   * @returns The current frame identity, or `undefined` before the first observation.
   */
  latest(agent: object): PhoneFrameState | undefined {
    return this.state(agent).latest
  }

  /**
   * Publish a completed observation as the only current frame.
   * @param agent Child-agent identity that owns the observation.
   * @param frame Completed observation identity and screenshot fingerprint.
   */
  recordObservation(agent: object, frame: PhoneFrameState): void {
    const state = this.state(agent)
    if (state.latest !== undefined && state.latest.screenshotFingerprint !== frame.screenshotFingerprint) {
      delete state.noProgress
    }
    state.latest = frame
  }

  /**
   * Require an action to name the exact current frame and return that frame.
   * @param agent Child-agent identity performing the action.
   * @param observationId Observation id supplied by the model.
   * @returns The exact current frame after freshness validation.
   */
  current(agent: object, observationId: ObservationIdType): PhoneFrameState {
    const latest = this.state(agent).latest
    if (latest === undefined) throw new Error('coremate-mobile: observe the phone before performing an action')
    if (latest.observationId !== observationId) {
      throw new Error(`coremate-mobile: stale observationId ${observationId}; use current observationId ${latest.observationId}`)
    }
    return latest
  }

  /**
   * Reject a fourth identical action after three unchanged resulting frames.
   * @param agent Child-agent identity performing the action.
   * @param signature Canonical ADB argument signature for the proposed action.
   */
  assertActionAllowed(agent: object, signature: string): void {
    const state = this.state(agent)
    const noProgress = state.noProgress
    if (noProgress?.count === 3
      && noProgress.signature === signature
      && noProgress.screenshotFingerprint === state.latest?.screenshotFingerprint) {
      throw new Error('coremate-mobile: repeated action made no screen progress three times; choose another action or report blocked')
    }
  }

  /**
   * Update the repeated-action fuse from the frame immediately before and after one mutation.
   * @param agent Child-agent identity that performed the action.
   * @param signature Canonical ADB argument signature for the completed action.
   * @param beforeFingerprint Screenshot fingerprint before the action.
   * @param afterFingerprint Screenshot fingerprint after the action.
   */
  recordActionResult(agent: object, signature: string, beforeFingerprint: string, afterFingerprint: string): void {
    const state = this.state(agent)
    if (beforeFingerprint !== afterFingerprint) {
      delete state.noProgress
      return
    }
    const previous = state.noProgress
    state.noProgress = previous?.signature === signature && previous.screenshotFingerprint === afterFingerprint
      ? { ...previous, count: previous.count + 1 }
      : { signature, screenshotFingerprint: afterFingerprint, count: 1 }
  }
}

/** Serialize one child's tool calls while allowing different phone children to proceed in parallel. */
export class PhoneOperationQueue {
  private readonly tails = new WeakMap<object, Promise<void>>()

  async run<T>(agent: object, operation: () => Promise<T>): Promise<T> {
    const previous = this.tails.get(agent) ?? Promise.resolve()
    let release!: () => void
    const gate = new Promise<void>((resolve) => { release = resolve })
    const tail = previous.catch(() => {}).then(() => gate)
    this.tails.set(agent, tail)
    await previous.catch(() => {})
    try {
      return await operation()
    } finally {
      release()
      if (this.tails.get(agent) === tail) this.tails.delete(agent)
    }
  }
}

/**
 * Wait only for an explicit model-requested UI-settle operation and honor cancellation.
 * @param waitMs Explicit bounded duration requested by the phone model.
 * @param signal Child-tool cancellation signal.
 */
export function waitForPhoneUi(waitMs: number, signal: AbortSignal): Promise<void> {
  signal.throwIfAborted()
  return new Promise((resolve, reject) => {
    const finish = (): void => {
      signal.removeEventListener('abort', abort)
      resolve()
    }
    const timer = setTimeout(finish, waitMs)
    const abort = (): void => {
      clearTimeout(timer)
      signal.removeEventListener('abort', abort)
      reject(signal.reason instanceof Error ? signal.reason : new Error('coremate-mobile: phone wait cancelled'))
    }
    signal.addEventListener('abort', abort, { once: true })
  })
}
