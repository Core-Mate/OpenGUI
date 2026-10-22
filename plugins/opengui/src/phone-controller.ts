import { createHash } from 'node:crypto'
import { actionCommand, normalizePhoneAction } from './adb.ts'
import { AndroidPhoneDriver } from './android-driver.ts'
import type { AndroidDriverOptions } from './android-driver.ts'
import { scaleLayout } from './device-driver.ts'
import type { ActionAssessment, DeviceFrame, PhoneDriver, UiLayout } from './device-driver.ts'
import type { ObservationId, PhoneCoordinateSpace } from './adb.ts'
import { AsyncSemaphore } from './concurrency.ts'
import type { EncodedPhoneScreenshot } from './image.ts'
import { pngDimensions } from './image.ts'
import { PhoneExecutionState, PhoneOperationQueue, waitForPhoneUi } from './phone-execution.ts'
import type { PhoneExecutionSnapshot } from './phone-execution.ts'

/** Host-neutral phone observation used by the standalone Codex CLI. */
export interface RawPhoneObservation {
  readonly observationId: ObservationId
  readonly unchangedFromObservationId?: ObservationId
  readonly serial: string
  readonly width: number
  readonly height: number
  readonly foregroundPackage: string
  readonly layout?: UiLayout
  readonly actionAssessment?: ActionAssessment
  readonly image: {
    readonly data: Buffer
    readonly mediaType: 'image/jpeg'
    readonly bytes: number
    readonly width: number
    readonly height: number
    readonly name: string
  }
}

interface StoredObservation {
  readonly value: RawPhoneObservation
  readonly fingerprint: string
  readonly frame: DeviceFrame
}

interface BaseControllerOptions {
  readonly discoverTarget: (signal: AbortSignal) => Promise<string>
  readonly validateTarget?: (serial: string, signal: AbortSignal) => Promise<void>
  readonly encodeScreenshot: (source: Buffer) => Promise<EncodedPhoneScreenshot>
  readonly maxOperations: () => number
  readonly mediaPermits?: AsyncSemaphore
  readonly now?: () => number
}

export type PhoneControllerOptions = BaseControllerOptions & (
  | { readonly driver: PhoneDriver; readonly runAdb?: never; readonly pasteUnicode?: never }
  | (AndroidDriverOptions & { readonly driver?: never })
)

/**
 * The standalone Codex phone execution kernel.
 * Platform drivers provide device frames and actions. Observation consumption,
 * operation budgets and repeated-no-progress enforcement live here.
 */
export class PhoneController {
  private readonly observations = new WeakMap<object, StoredObservation>()
  private readonly execution = new PhoneExecutionState()
  private readonly queue = new PhoneOperationQueue()
  private readonly mediaPermits: AsyncSemaphore
  private readonly driver: PhoneDriver
  private readonly now: () => number

  constructor(private readonly options: PhoneControllerOptions) {
    this.driver = options.driver ?? new AndroidPhoneDriver(options as AndroidDriverOptions)
    this.mediaPermits = options.mediaPermits ?? new AsyncSemaphore(2)
    this.now = options.now ?? Date.now
  }

  /** Freeze an actor to one Host-private device serial. */
  assignTarget(actor: object, serial: string): void {
    this.execution.assignTarget(actor, serial)
  }

  /** Return counters without exposing or mutating the current observation. */
  status(actor: object): PhoneExecutionSnapshot {
    return this.execution.snapshot(actor)
  }

  /** Observe without accepting arbitrary device commands. */
  observe(actor: object, signal: AbortSignal): Promise<RawPhoneObservation> {
    return this.execute(actor, { action: 'observe' }, signal)
  }

  /** Execute exactly one validated operation and always return the resulting frame. */
  async execute(
    actor: object,
    input: Record<string, unknown>,
    signal: AbortSignal,
  ): Promise<RawPhoneObservation> {
    return this.queue.run(actor, async () => {
      try {
        signal.throwIfAborted()
        this.execution.beginOperation(actor, this.options.maxOperations())
        const action = normalizePhoneAction(input)
        const serial = await this.targetFor(actor, signal)
        await this.options.validateTarget?.(serial, signal)
        if (action.action === 'observe') return await this.capture(actor, serial, signal)

        const before = this.execution.current(actor, action.observationId)
        const stored = this.observations.get(actor)
        if (stored === undefined || stored.value.observationId !== action.observationId) {
          throw new Error('opengui: current phone observation is unavailable')
        }
        const screen: PhoneCoordinateSpace = {
          width: stored.value.width,
          height: stored.value.height,
          screenshotWidth: stored.value.image.width,
          screenshotHeight: stored.value.image.height,
        }
        if (action.action === 'wait') {
          actionCommand(action, screen)
          this.execution.consumeObservation(actor)
          await waitForPhoneUi(action.waitMs, signal)
          return await this.capture(actor, serial, signal)
        }

        const prepared = this.driver.prepare(action, screen, stored.frame)
        this.execution.assertActionAllowed(actor, prepared.signature)
        this.execution.consumeObservation(actor)
        signal.throwIfAborted()
        await prepared.execute(serial, signal)

        const after = await this.capture(actor, serial, signal)
        const afterState = this.execution.current(actor, after.observationId)
        this.execution.recordActionResult(actor, prepared.signature, before.screenshotFingerprint, afterState.screenshotFingerprint)
        const assessment = this.driver.assess?.(action, this.observations.get(actor)!.frame)
        return assessment === undefined ? after : { ...after, actionAssessment: assessment }
      } catch (error) {
        this.execution.consumeObservation(actor)
        this.observations.delete(actor)
        throw error
      }
    })
  }

  private async targetFor(actor: object, signal: AbortSignal): Promise<string> {
    return this.execution.resolveTarget(actor, () => this.options.discoverTarget(signal))
  }

  private async capture(actor: object, serial: string, signal: AbortSignal): Promise<RawPhoneObservation> {
    const releaseMedia = await this.mediaPermits.acquire(signal)
    try {
      const frame = await this.driver.capture(serial, signal)
      const png = frame.png
      const screen = pngDimensions(png)
      const encoded = await this.options.encodeScreenshot(png)
      signal.throwIfAborted()
      const fingerprint = createHash('sha256').update(encoded.data).digest('hex')
      const previous = this.observations.get(actor)
      const unchanged = previous?.fingerprint === fingerprint ? previous : undefined
      const observationId = this.execution.nextObservationId(actor)
      const value: RawPhoneObservation = {
        observationId,
        ...(unchanged === undefined ? {} : { unchangedFromObservationId: unchanged.value.observationId }),
        serial,
        width: screen.width,
        height: screen.height,
        foregroundPackage: frame.foregroundPackage,
        ...(frame.layout === undefined ? {} : { layout: scaleLayout(frame.layout, { ...screen, screenshotWidth: encoded.width, screenshotHeight: encoded.height }) }),
        image: unchanged?.value.image ?? {
          data: encoded.data,
          mediaType: 'image/jpeg',
          bytes: encoded.data.byteLength,
          width: encoded.width,
          height: encoded.height,
          name: `opengui-phone-${this.now()}.jpg`,
        },
      }
      this.observations.set(actor, { value, fingerprint, frame })
      this.execution.recordObservation(actor, { observationId, screenshotFingerprint: fingerprint })
      return value
    } finally {
      releaseMedia()
    }
  }
}
