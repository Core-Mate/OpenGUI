/** Find an H.264 SPS NAL and derive the RFC 6381 AVC codec string. */
export function avcCodecFromAnnexB(data: Uint8Array): string {
  for (let index = 0; index + 7 < data.length; index += 1) {
    const three = data[index] === 0 && data[index + 1] === 0 && data[index + 2] === 1
    const four = data[index] === 0 && data[index + 1] === 0 && data[index + 2] === 0 && data[index + 3] === 1
    if (!three && !four) continue
    const nal = index + (four ? 4 : 3)
    if ((data[nal]! & 0x1f) !== 7 || nal + 3 >= data.length) continue
    return `avc1.${[data[nal + 1], data[nal + 2], data[nal + 3]].map(value => value!.toString(16).padStart(2, '0')).join('')}`
  }
  return 'avc1.42e01e'
}

export function concatVideoData(parts: readonly Uint8Array[], frame: Uint8Array): Uint8Array {
  const bytes = parts.reduce((total, part) => total + part.byteLength, frame.byteLength)
  const value = new Uint8Array(bytes)
  let offset = 0
  for (const part of parts) { value.set(part, offset); offset += part.byteLength }
  value.set(frame, offset)
  return value
}

export interface CoremateVideoDecoder {
  session(width: number, height: number): void
  packet(flags: number, pts: bigint, data: Uint8Array): void
  close(): void
}

/** Low-latency Annex-B H.264 decoder that paints the newest frame onto one canvas. */
export function createCoremateVideoDecoder(
  canvas: HTMLCanvasElement,
  onFrame: () => void,
  onFatal: (error: Error) => void,
): CoremateVideoDecoder {
  let width = 0
  let height = 0
  let configPackets: Uint8Array[] = []
  let waitingForKey = true
  let configured = false
  let closed = false
  let generation = 0
  let chain = Promise.resolve()
  let decoder: VideoDecoder
  const context = canvas.getContext('2d', { alpha: false, desynchronized: true })
  if (context === null) throw new Error('Canvas 2D 不可用')
  const fatal = (reason: unknown): void => {
    if (closed) return
    closed = true
    const error = reason instanceof Error ? reason : new Error(String(reason))
    try { if (decoder.state !== 'closed') decoder.close() } catch { /* already failed */ }
    onFatal(error)
  }
  decoder = new VideoDecoder({
    output(frame) {
      try {
        if (canvas.width !== frame.displayWidth || canvas.height !== frame.displayHeight) {
          canvas.width = frame.displayWidth
          canvas.height = frame.displayHeight
        }
        context.drawImage(frame, 0, 0, canvas.width, canvas.height)
        onFrame()
      } catch (error) {
        fatal(error)
      } finally {
        frame.close()
      }
    },
    error: fatal,
  })
  const configure = async (data: Uint8Array, packetGeneration: number): Promise<void> => {
    const config: VideoDecoderConfig = {
      codec: avcCodecFromAnnexB(data),
      optimizeForLatency: true,
      hardwareAcceleration: 'prefer-hardware',
    }
    const support = await VideoDecoder.isConfigSupported(config)
    if (!support.supported) throw new Error(`当前浏览器不支持视频编码 ${config.codec}`)
    if (closed || packetGeneration !== generation) return
    decoder.configure(config)
    configured = true
  }
  return {
    session(nextWidth, nextHeight) {
      if (closed) return
      width = nextWidth
      height = nextHeight
      canvas.width = width
      canvas.height = height
      canvas.style.aspectRatio = `${width} / ${height}`
      if (decoder.state === 'configured') decoder.reset()
      configured = false
      waitingForKey = true
      configPackets = []
      generation += 1
    },
    packet(flags, pts, data) {
      if (closed) return
      const packetGeneration = generation
      const packetData = Uint8Array.from(data)
      chain = chain.then(async () => {
        if (closed || packetGeneration !== generation) return
        const config = (flags & 1) !== 0
        const key = (flags & 2) !== 0
        if (config) { configPackets.push(packetData); return }
        if (waitingForKey && !key) return
        if (!key && decoder.decodeQueueSize > 3) return
        let payload: Uint8Array<ArrayBufferLike> = packetData
        if (key) {
          payload = concatVideoData(configPackets, packetData)
          if (!configured) await configure(payload, packetGeneration)
          if (closed || packetGeneration !== generation) return
          waitingForKey = false
          configPackets = []
        }
        if (!configured) await configure(payload, packetGeneration)
        if (closed || packetGeneration !== generation) return
        decoder.decode(new EncodedVideoChunk({
          type: key ? 'key' : 'delta',
          timestamp: Number(pts > BigInt(Number.MAX_SAFE_INTEGER) ? BigInt(Number.MAX_SAFE_INTEGER) : pts),
          data: payload,
        }))
      }).catch(error => {
        if (!closed && packetGeneration === generation) fatal(error)
      })
    },
    close() {
      if (closed) return
      closed = true
      if (decoder.state !== 'closed') decoder.close()
    },
  }
}
