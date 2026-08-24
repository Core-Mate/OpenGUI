import { createHash } from 'node:crypto'
import sharp from 'sharp'
import type { FleetDevice } from './device-fleet.ts'

const PREVIEW_CACHE_MS = 1_500
const PREVIEW_WIDTH = 720
const PREVIEW_QUALITY = 60

export interface PhonePreviewImage {
  readonly data: Buffer
  readonly etag: string
}

export type CapturePhonePreview = (serial: string, signal: AbortSignal) => Promise<Buffer>

/** Bounded, single-flight ADB preview encoder shared by every browser tab. */
export class PhonePreview {
  private readonly cache = new Map<string, { at: number, image: PhonePreviewImage }>()
  private readonly pending = new Map<string, Promise<PhonePreviewImage>>()
  private readonly waiters: Array<() => void> = []
  private active = 0

  constructor(
    private readonly capture: CapturePhonePreview,
    private readonly concurrency = 2,
    private readonly now: () => number = Date.now,
  ) {
    if (!Number.isSafeInteger(concurrency) || concurrency < 1) {
      throw new Error('coremate-mobile: preview concurrency must be a positive integer')
    }
  }

  async read(device: FleetDevice, signal: AbortSignal): Promise<PhonePreviewImage> {
    const cached = this.cache.get(device.id)
    if (cached !== undefined && this.now() - cached.at < PREVIEW_CACHE_MS) return cached.image
    const pending = this.pending.get(device.id)
    if (pending !== undefined) return pending
    const operation = this.captureAndEncode(device, signal)
    this.pending.set(device.id, operation)
    try {
      const image = await operation
      this.cache.set(device.id, { at: this.now(), image })
      return image
    } finally {
      if (this.pending.get(device.id) === operation) this.pending.delete(device.id)
    }
  }

  private async captureAndEncode(device: FleetDevice, signal: AbortSignal): Promise<PhonePreviewImage> {
    const release = await this.acquire(signal)
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

  private async acquire(signal: AbortSignal): Promise<() => void> {
    if (signal.aborted) throw signal.reason
    if (this.active < this.concurrency) {
      this.active += 1
      return () => this.release()
    }
    await new Promise<void>((resolve, reject) => {
      const ready = (): void => {
        signal.removeEventListener('abort', aborted)
        this.active += 1
        resolve()
      }
      const aborted = (): void => {
        const index = this.waiters.indexOf(ready)
        if (index >= 0) this.waiters.splice(index, 1)
        reject(signal.reason)
      }
      this.waiters.push(ready)
      signal.addEventListener('abort', aborted, { once: true })
    })
    return () => this.release()
  }

  private release(): void {
    this.active -= 1
    this.waiters.shift()?.()
  }
}
