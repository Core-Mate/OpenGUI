import sharp from 'sharp'
import { describe, expect, it, vi } from 'vitest'
import { PhonePreview } from '../src/preview.ts'

const device = { id: 'opaque-phone', serial: 'adb-secret', label: 'Pixel' }

async function png(color: string): Promise<Buffer> {
  return await sharp({ create: { width: 1080, height: 1920, channels: 3, background: color } }).png().toBuffer()
}

describe('bounded phone previews', () => {
  it('single-flights and caches one device while returning a stable JPEG ETag', async () => {
    let now = 100
    const source = await png('#f1bf1f')
    const capture = vi.fn(async () => source)
    const preview = new PhonePreview(capture, 2, () => now)
    const signal = new AbortController().signal

    const [first, second] = await Promise.all([preview.read(device, signal), preview.read(device, signal)])
    expect(capture).toHaveBeenCalledTimes(1)
    expect(first).toEqual(second)
    expect((await sharp(first.data).metadata()).format).toBe('jpeg')
    expect((await sharp(first.data).metadata()).width).toBe(720)
    expect(first.etag).toMatch(/^"[A-Za-z0-9_-]+"$/u)
    now += 1_000
    await preview.read(device, signal)
    expect(capture).toHaveBeenCalledTimes(1)
  })

  it('limits global ADB captures and cancels queued reads', async () => {
    let release!: () => void
    const gate = new Promise<void>(resolve => { release = resolve })
    let active = 0
    let peak = 0
    const source = await png('#333333')
    const capture = vi.fn(async () => {
      active += 1
      peak = Math.max(peak, active)
      await gate
      active -= 1
      return source
    })
    const preview = new PhonePreview(capture, 2)
    const controller = new AbortController()
    const reads = [1, 2, 3].map(index => preview.read({ ...device, id: `phone-${index}`, serial: `serial-${index}` }, index === 3 ? controller.signal : new AbortController().signal))
    await vi.waitFor(() => { expect(capture).toHaveBeenCalledTimes(2) })
    controller.abort(new Error('cancelled'))
    release()
    await expect(reads[2]).rejects.toThrow('cancelled')
    await Promise.all(reads.slice(0, 2))
    expect(peak).toBe(2)
    expect(capture).toHaveBeenCalledTimes(2)
  })
})
