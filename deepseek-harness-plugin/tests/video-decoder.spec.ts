import { afterEach, describe, expect, it, vi } from 'vitest'
import { createCoremateVideoDecoder } from '../src/client/video-decoder.ts'

afterEach(() => vi.unstubAllGlobals())

function canvas(): HTMLCanvasElement {
  return {
    width: 0,
    height: 0,
    style: {},
    getContext: () => ({ drawImage: vi.fn() }),
  } as unknown as HTMLCanvasElement
}

describe('embedded video decoder failure handling', () => {
  it('reports an unsupported H.264 configuration once instead of freezing', async () => {
    class Decoder {
      static isConfigSupported = vi.fn(async () => ({ supported: false }))
      state = 'unconfigured'
      decodeQueueSize = 0
      constructor(_init: VideoDecoderInit) {}
      configure(): void { throw new Error('configure must not run') }
      decode(): void {}
      reset(): void {}
      close(): void { this.state = 'closed' }
    }
    vi.stubGlobal('VideoDecoder', Decoder)
    vi.stubGlobal('EncodedVideoChunk', class { constructor(_init: EncodedVideoChunkInit) {} })
    const fatal = vi.fn()
    const decoder = createCoremateVideoDecoder(canvas(), vi.fn(), fatal)
    decoder.session(1080, 2400)
    decoder.packet(1, 0n, Uint8Array.from([0, 0, 0, 1, 0x67, 0x64, 0, 0x28]))
    decoder.packet(2, 1n, Uint8Array.from([0, 0, 0, 1, 0x65, 1]))

    await vi.waitFor(() => expect(fatal).toHaveBeenCalledOnce())
    expect(fatal.mock.calls[0]?.[0]).toBeInstanceOf(Error)
  })

  it('forwards the decoder asynchronous error once', () => {
    let init!: VideoDecoderInit
    class Decoder {
      static isConfigSupported = vi.fn(async (config: VideoDecoderConfig) => ({ supported: true, config }))
      state = 'unconfigured'
      decodeQueueSize = 0
      constructor(value: VideoDecoderInit) { init = value }
      configure(): void { this.state = 'configured' }
      decode(): void {}
      reset(): void {}
      close(): void { this.state = 'closed' }
    }
    vi.stubGlobal('VideoDecoder', Decoder)
    vi.stubGlobal('EncodedVideoChunk', class { constructor(_init: EncodedVideoChunkInit) {} })
    const fatal = vi.fn()
    createCoremateVideoDecoder(canvas(), vi.fn(), fatal)
    init.error(new DOMException('codec crashed'))
    init.error(new DOMException('duplicate'))
    expect(fatal).toHaveBeenCalledOnce()
  })

  it('does not let a delayed codec check configure a newer stream session', async () => {
    let resolveFirst!: (value: VideoDecoderSupport) => void
    const firstSupport = new Promise<VideoDecoderSupport>(resolve => { resolveFirst = resolve })
    class Decoder {
      static isConfigSupported = vi.fn()
        .mockImplementationOnce(async () => firstSupport)
        .mockImplementation(async (config: VideoDecoderConfig) => ({ supported: true, config }))
      state = 'unconfigured'
      decodeQueueSize = 0
      configure = vi.fn(() => { this.state = 'configured' })
      decode = vi.fn()
      reset(): void { this.state = 'unconfigured' }
      close(): void { this.state = 'closed' }
      constructor(_init: VideoDecoderInit) {}
    }
    vi.stubGlobal('VideoDecoder', Decoder)
    vi.stubGlobal('EncodedVideoChunk', class { constructor(_init: EncodedVideoChunkInit) {} })
    const fatal = vi.fn()
    const decoder = createCoremateVideoDecoder(canvas(), vi.fn(), fatal)

    decoder.session(1080, 2400)
    decoder.packet(1, 0n, Uint8Array.from([0, 0, 0, 1, 0x67, 0x42, 0xe0, 0x1e]))
    decoder.packet(2, 1n, Uint8Array.from([0, 0, 0, 1, 0x65, 1]))
    await vi.waitFor(() => expect(Decoder.isConfigSupported).toHaveBeenCalledTimes(1))

    decoder.session(720, 1280)
    resolveFirst({ supported: true, config: { codec: 'avc1.42e01e' } })
    await Promise.resolve()
    decoder.packet(1, 2n, Uint8Array.from([0, 0, 0, 1, 0x67, 0x64, 0, 0x28]))
    decoder.packet(2, 3n, Uint8Array.from([0, 0, 0, 1, 0x65, 2]))

    await vi.waitFor(() => expect(Decoder.isConfigSupported).toHaveBeenCalledTimes(2))
    expect(Decoder.isConfigSupported.mock.calls[1]?.[0]).toMatchObject({ codec: 'avc1.640028' })
    expect(fatal).not.toHaveBeenCalled()
  })

  it('ignores a delayed codec-check failure from an older stream session', async () => {
    let rejectFirst!: (reason: Error) => void
    const firstSupport = new Promise<VideoDecoderSupport>((_resolve, reject) => { rejectFirst = reject })
    class Decoder {
      static isConfigSupported = vi.fn()
        .mockImplementationOnce(async () => firstSupport)
        .mockImplementation(async (config: VideoDecoderConfig) => ({ supported: true, config }))
      state = 'unconfigured'
      decodeQueueSize = 0
      configure(): void { this.state = 'configured' }
      decode = vi.fn()
      reset(): void { this.state = 'unconfigured' }
      close(): void { this.state = 'closed' }
      constructor(_init: VideoDecoderInit) {}
    }
    vi.stubGlobal('VideoDecoder', Decoder)
    vi.stubGlobal('EncodedVideoChunk', class { constructor(_init: EncodedVideoChunkInit) {} })
    const fatal = vi.fn()
    const decoder = createCoremateVideoDecoder(canvas(), vi.fn(), fatal)

    decoder.session(1080, 2400)
    decoder.packet(1, 0n, Uint8Array.from([0, 0, 0, 1, 0x67, 0x42, 0xe0, 0x1e]))
    decoder.packet(2, 1n, Uint8Array.from([0, 0, 0, 1, 0x65, 1]))
    await vi.waitFor(() => expect(Decoder.isConfigSupported).toHaveBeenCalledTimes(1))

    decoder.session(720, 1280)
    rejectFirst(new Error('old codec probe failed'))
    await Promise.resolve()
    decoder.packet(1, 2n, Uint8Array.from([0, 0, 0, 1, 0x67, 0x64, 0, 0x28]))
    decoder.packet(2, 3n, Uint8Array.from([0, 0, 0, 1, 0x65, 2]))

    await vi.waitFor(() => expect(Decoder.isConfigSupported).toHaveBeenCalledTimes(2))
    expect(fatal).not.toHaveBeenCalled()
  })
})
