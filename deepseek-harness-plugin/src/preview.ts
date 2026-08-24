import { createHash } from 'node:crypto'
import sharp from 'sharp'
import type { FleetDevice } from './device-fleet.ts'
import { AsyncSemaphore } from './concurrency.ts'

const PREVIEW_CACHE_MS = 1_500
const PREVIEW_WIDTH = 720
const PREVIEW_QUALITY = 60
const PREVIEW_CACHE_LIMIT = 16

export interface PhonePreviewImage {
  readonly data: Buffer
  readonly etag: string
}

export type CapturePhonePreview = (serial: string, signal: AbortSignal) => Promise<Buffer>

interface PreviewOperation {
  readonly controller: AbortController
  readonly promise: Promise<PhonePreviewImage>
  readonly waiters: Set<symbol>
}

/** Bounded, single-flight ADB preview encoder shared by every browser tab. */
export class PhonePreview {
  private readonly cache = new Map<string, { at: number, image: PhonePreviewImage }>()
  private readonly pending = new Map<string, PreviewOperation>()
  private readonly permits: AsyncSemaphore

  constructor(
    private readonly capture: CapturePhonePreview,
    concurrency = 2,
    private readonly now: () => number = Date.now,
    permits?: AsyncSemaphore,
  ) {
    if (!Number.isSafeInteger(concurrency) || concurrency < 1) {
      throw new Error('coremate-mobile: preview concurrency must be a positive integer')
    }
    this.permits = permits ?? new AsyncSemaphore(concurrency)
  }

  async read(device: FleetDevice, signal: AbortSignal): Promise<PhonePreviewImage> {
    const cached = this.cache.get(device.id)
    if (cached !== undefined && this.now() - cached.at < PREVIEW_CACHE_MS) {
      this.cache.delete(device.id)
      this.cache.set(device.id, cached)
      return cached.image
    }
    let operation = this.pending.get(device.id)
    if (operation === undefined) {
      const controller = new AbortController()
      const promise = this.captureAndEncode(device, controller.signal)
      operation = { controller, promise, waiters: new Set() }
      this.pending.set(device.id, operation)
      void promise.finally(() => {
        if (this.pending.get(device.id) === operation) this.pending.delete(device.id)
      }).catch(() => {})
    }
    const waiter = Symbol('preview-waiter')
    operation.waiters.add(waiter)
    try {
      const image = await this.waitFor(operation, signal)
      this.cache.delete(device.id)
      this.cache.set(device.id, { at: this.now(), image })
      while (this.cache.size > PREVIEW_CACHE_LIMIT) this.cache.delete(this.cache.keys().next().value!)
      return image
    } finally {
      operation.waiters.delete(waiter)
      if (operation.waiters.size === 0 && !operation.controller.signal.aborted) {
        operation.controller.abort(new Error('coremate-mobile: phone preview has no remaining waiters'))
      }
    }
  }

  private async waitFor(operation: PreviewOperation, signal: AbortSignal): Promise<PhonePreviewImage> {
    signal.throwIfAborted()
    return await new Promise<PhonePreviewImage>((resolveImage, rejectImage) => {
      const onAbort = (): void => rejectImage(signal.reason)
      signal.addEventListener('abort', onAbort, { once: true })
      void operation.promise.then(resolveImage, rejectImage).finally(() => signal.removeEventListener('abort', onAbort))
    })
  }

  private async captureAndEncode(device: FleetDevice, signal: AbortSignal): Promise<PhonePreviewImage> {
    const release = await this.permits.acquire(signal)
    try {
      const source = await this.capture(device.serial, signal)
      const data = await sharp(source, { failOn: 'error', limitInputPixels: false })
        .resize({ width: PREVIEW_WIDTH, withoutEnlargement: true })
        .jpeg({ quality: PREVIEW_QUALITY })
        .toBuffer()
      return {
        data,
        etag: `"${createHash('sha256').update(data).digest('base64url')}"`,
      }
    } finally {
      release()
    }
  }

}
