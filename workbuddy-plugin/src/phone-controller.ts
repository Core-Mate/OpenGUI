import { createHash } from 'node:crypto'
import {
  actionCommand,
  canUseAdbInputText,
  normalizePhoneAction,
  parseScreenSize,
  textInputCommands,
} from './adb.ts'
import type { ObservationId, PhoneCoordinateSpace } from './adb.ts'
import { AsyncSemaphore } from './concurrency.ts'
import type { EncodedPhoneScreenshot } from './screenshot.ts'
import { PhoneExecutionState, PhoneOperationQueue, waitForPhoneUi } from './phone-execution.ts'
import type { PhoneExecutionSnapshot } from './phone-execution.ts'

/** Host-neutral phone observation used by the WorkBuddy runtime. */
export interface RawPhoneObservation {
  readonly observationId: ObservationId
  readonly unchangedFromObservationId?: ObservationId
  readonly serial: string
  readonly width: number
  readonly height: number
  readonly foregroundPackage: string
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
}

export interface PhoneControllerOptions {
  readonly runAdb: (
    args: readonly string[],
    signal: AbortSignal,
    buffer?: boolean,
  ) => Promise<string | Buffer>
  readonly discoverTarget: (signal: AbortSignal) => Promise<string>
  readonly validateTarget?: (serial: string, signal: AbortSignal) => Promise<void>
  readonly pasteUnicode: (serial: string, text: string, signal: AbortSignal) => Promise<void>
  readonly encodeScreenshot: (source: Buffer) => Promise<EncodedPhoneScreenshot>
  readonly maxOperations: () => number
  readonly mediaPermits?: AsyncSemaphore
  readonly now?: () => number
}

function currentPackage(output: string): string {
  return output.match(/(?:mCurrentFocus|mFocusedApp)=[^\n]*?\bu\d+\s+([A-Za-z0-9._]+)\//u)?.[1]
    ?? output.match(/(?:topResumedActivity|mResumedActivity)[^\n]*?\bu\d+\s+([A-Za-z0-9._]+)\//u)?.[1]
    ?? ''
}

/**
 * One shared execution kernel for the independent WorkBuddy package.
 * Host adapters provide only target discovery, process execution, and Unicode
 * clipboard transport; safety and observation semantics live here.
 */
export class PhoneController {
  private readonly observations = new WeakMap<object, StoredObservation>()
  private readonly execution = new PhoneExecutionState()
  private readonly queue = new PhoneOperationQueue()
  private readonly mediaPermits: AsyncSemaphore
  private readonly now: () => number

  constructor(private readonly options: PhoneControllerOptions) {
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

  invalidate(actor: object): void { this.execution.consumeObservation(actor) }

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
      signal.throwIfAborted()
      this.execution.beginOperation(actor, this.options.maxOperations())
      const normalized = { ...input }
      delete normalized.verifyCurrentFrame
      const action = normalizePhoneAction(normalized)
      const serial = await this.targetFor(actor, signal)
      await this.options.validateTarget?.(serial, signal)
      if (action.action === 'observe') return this.capture(actor, serial, signal)

      const before = this.execution.current(actor, action.observationId)
      const stored = this.observations.get(actor)
      if (stored === undefined || stored.value.observationId !== action.observationId) {
        throw new Error('opengui: current phone observation is unavailable')
      }
      if (input.verifyCurrentFrame === true) {
        this.execution.consumeObservation(actor)
        const raw = await this.options.runAdb(['-s', serial, 'exec-out', 'screencap', '-p'], signal, true)
        const encoded = await this.options.encodeScreenshot(Buffer.isBuffer(raw) ? raw : Buffer.from(raw))
        if (createHash('sha256').update(encoded.data).digest('hex') !== stored.fingerprint) {
          throw new Error('opengui: phone changed after confirmation; observe and request approval again')
        }
      }
      const screen: PhoneCoordinateSpace = {
        width: stored.value.width,
        height: stored.value.height,
        screenshotWidth: stored.value.image.width,
        screenshotHeight: stored.value.image.height,
      }
      if (action.action === 'wait') {
        this.execution.consumeObservation(actor)
        await waitForPhoneUi(action.waitMs, signal)
        return this.capture(actor, serial, signal)
      }

      const scrcpyText = action.action === 'text' && !canUseAdbInputText(action.text)
      const command = action.action === 'text' ? undefined : actionCommand(action, screen)
      const commands = action.action === 'text'
        ? scrcpyText ? [] : textInputCommands(action.text)
        : command === undefined ? [] : [command]
      if (commands.length === 0 && !scrcpyText) {
        throw new Error('opengui: action did not resolve to a device command')
      }

      const signature = JSON.stringify(scrcpyText ? ['scrcpy-text', action.text] : commands)
      this.execution.assertActionAllowed(actor, signature)
      this.execution.consumeObservation(actor)
      signal.throwIfAborted()
      if (scrcpyText) await this.options.pasteUnicode(serial, action.text, signal)
      else for (const candidate of commands) await this.options.runAdb(['-s', serial, ...candidate], signal)

      const after = await this.capture(actor, serial, signal)
      const afterState = this.execution.current(actor, after.observationId)
      this.execution.recordActionResult(actor, signature, before.screenshotFingerprint, afterState.screenshotFingerprint)
      return after
    })
  }

  private async targetFor(actor: object, signal: AbortSignal): Promise<string> {
    return this.execution.resolveTarget(actor, () => this.options.discoverTarget(signal))
  }

  private async capture(actor: object, serial: string, signal: AbortSignal): Promise<RawPhoneObservation> {
    this.execution.consumeObservation(actor)
    const releaseMedia = await this.mediaPermits.acquire(signal)
    try {
      const [sizeRaw, focusRaw, pngRaw] = await Promise.all([
        this.options.runAdb(['-s', serial, 'shell', 'wm', 'size'], signal),
        this.options.runAdb(['-s', serial, 'shell', 'dumpsys', 'window', 'windows'], signal),
        this.options.runAdb(['-s', serial, 'exec-out', 'screencap', '-p'], signal, true),
      ])
      const screen = parseScreenSize(String(sizeRaw))
      const png = Buffer.isBuffer(pngRaw) ? pngRaw : Buffer.from(pngRaw)
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
        width: encoded.sourceWidth ?? screen.width,
        height: encoded.sourceHeight ?? screen.height,
        foregroundPackage: currentPackage(String(focusRaw)),
        image: unchanged?.value.image ?? {
          data: encoded.data,
          mediaType: 'image/jpeg',
          bytes: encoded.data.byteLength,
          width: encoded.width,
          height: encoded.height,
          name: `opengui-phone-${this.now()}.jpg`,
        },
      }
      this.observations.set(actor, { value, fingerprint })
      this.execution.recordObservation(actor, { observationId, screenshotFingerprint: fingerprint })
      return value
    } finally {
      releaseMedia()
    }
  }
}
