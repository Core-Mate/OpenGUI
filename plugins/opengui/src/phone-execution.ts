import { ObservationId } from './adb.ts'
import { randomUUID } from 'node:crypto'
import type { ObservationId as ObservationIdType } from './adb.ts'

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
  readonly observationNonce: string
  operations: number
  observationSequence: number
  targetSerial?: string
  latest?: PhoneFrameState
  noProgress?: NoProgressState
}

/** Read-only execution counters used by Host adapters and status tools. */
export interface PhoneExecutionSnapshot {
  readonly operations: number
  readonly observationSequence: number
  readonly targetSerial?: string
  readonly observationId?: ObservationIdType
}

/** Per-child freshness, operation-budget, and repeated-no-progress enforcement. */
export class PhoneExecutionState {
  private readonly agents = new WeakMap<object, AgentPhoneState>()

  private state(agent: object): AgentPhoneState {
    const existing = this.agents.get(agent)
    if (existing !== undefined) return existing
    const created: AgentPhoneState = { operations: 0, observationSequence: 0, observationNonce: randomUUID() }
    this.agents.set(agent, created)
    return created
  }

  /** Bind a newly published actor to one Host-private serial before its first tool call. */
  assignTarget(agent: object, serial: string): void {
    const state = this.state(agent)
    if (state.targetSerial !== undefined && state.targetSerial !== serial) {
      throw new Error('opengui: phone agent is already bound to another device')
    }
    state.targetSerial = serial
  }

  /** Count one tool operation and enforce the actor's bounded action budget. */
  beginOperation(agent: object, maxOperations: number): void {
    const state = this.state(agent)
    state.operations += 1
    if (state.operations > maxOperations) {
      throw new Error(`opengui: phone task exceeded its ${maxOperations}-operation limit`)
    }
  }

  /** Resolve the task's phone once and reuse that serial for every later call. */
  async resolveTarget(agent: object, discover: () => Promise<string>): Promise<string> {
    const state = this.state(agent)
    if (state.targetSerial !== undefined) return state.targetSerial
    const selected = await discover()
    state.targetSerial = selected
    return selected
  }

  /** Allocate an actor-local observation id that the next mutation must echo. */
  nextObservationId(agent: object): ObservationIdType {
    const state = this.state(agent)
    state.observationSequence += 1
    return ObservationId(`phone-observation-${state.observationNonce}-${state.observationSequence}`)
  }

  /** Return the current frame, when the actor has observed one. */
  latest(agent: object): PhoneFrameState | undefined {
    return this.state(agent).latest
  }

  /** Publish a completed observation as the only current frame. */
  consumeObservation(agent: object): void {
    delete this.state(agent).latest
  }

  recordObservation(agent: object, frame: PhoneFrameState): void {
    const state = this.state(agent)
    if (state.latest !== undefined && state.latest.screenshotFingerprint !== frame.screenshotFingerprint) {
      delete state.noProgress
    }
    state.latest = frame
  }

  /** Require an action to name the exact current frame and return that frame. */
  current(agent: object, observationId: ObservationIdType): PhoneFrameState {
    const latest = this.state(agent).latest
    if (latest === undefined) throw new Error('opengui: observe the phone before performing an action')
    if (latest.observationId !== observationId) {
      throw new Error(`opengui: stale observationId ${observationId}; use current observationId ${latest.observationId}`)
    }
    return latest
  }

  /** Reject a fourth identical action after three unchanged resulting frames. */
  assertActionAllowed(agent: object, signature: string): void {
    const state = this.state(agent)
    const noProgress = state.noProgress
    if (noProgress?.count === 3
      && noProgress.signature === signature
      && noProgress.screenshotFingerprint === state.latest?.screenshotFingerprint) {
      throw new Error('opengui: repeated action made no screen progress three times; choose another action or report blocked')
    }
  }

  /** Update the repeated-action fuse from the frame before and after one mutation. */
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

  /** Return a copy of one actor's bounded execution state. */
  snapshot(agent: object): PhoneExecutionSnapshot {
    const state = this.state(agent)
    return {
      operations: state.operations,
      observationSequence: state.observationSequence,
      ...(state.targetSerial === undefined ? {} : { targetSerial: state.targetSerial }),
      ...(state.latest === undefined ? {} : { observationId: state.latest.observationId }),
    }
  }
}

/** Serialize one actor's tool calls while allowing different actors to proceed in parallel. */
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

/** Wait for an explicit UI-settle operation and honor cancellation. */
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
      reject(signal.reason instanceof Error ? signal.reason : new Error('opengui: phone wait cancelled'))
    }
    signal.addEventListener('abort', abort, { once: true })
  })
}
