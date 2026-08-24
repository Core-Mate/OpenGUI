import { describe, expect, it } from 'vitest'
import {
  buildScrcpyVideoServerArgs,
  ScrcpyVideoPacketParser,
} from '../src/scrcpy-stream.ts'
import { avcCodecFromAnnexB, concatVideoData } from '../src/client/video-decoder.ts'

function u64(value: bigint): Buffer {
  const data = Buffer.alloc(8)
  data.writeBigUInt64BE(value)
  return data
}

describe('embedded scrcpy video protocol', () => {
  it('starts a read-only, bounded H.264 server', () => {
    expect(buildScrcpyVideoServerArgs('00abc123', '/data/local/tmp/server.jar')).toEqual(expect.arrayContaining([
      'scid=00abc123', 'tunnel_forward=true', 'video=true', 'audio=false', 'control=false',
      'video_codec=h264', 'max_size=960', 'max_fps=30', 'video_bit_rate=2000000',
      'send_dummy_byte=false', 'send_device_meta=false', 'send_stream_meta=true', 'send_frame_meta=true',
    ]))
  })

  it('parses fragmented codec, rotation session, config and key packets', () => {
    const parser = new ScrcpyVideoPacketParser()
    const codec = Buffer.from('h264')
    const session = Buffer.concat([u64(0x8000000000000000n), Buffer.alloc(4)])
    session.writeUInt32BE(1080, 4)
    session.writeUInt32BE(2400, 8)
    const configBody = Buffer.from([0, 0, 0, 1, 0x67, 0x42, 0xe0, 0x1e])
    const config = Buffer.concat([u64(0x4000000000000000n), Buffer.alloc(4), configBody])
    config.writeUInt32BE(configBody.length, 8)
    const keyBody = Buffer.from([0, 0, 0, 1, 0x65, 1, 2, 3])
    const key = Buffer.concat([u64(0x200000000000002an), Buffer.alloc(4), keyBody])
    key.writeUInt32BE(keyBody.length, 8)
    const wire = Buffer.concat([codec, session, config, key])

    expect(parser.push(wire.subarray(0, 7))).toEqual([{ type: 'codec', codec: 'h264' }])
    expect(parser.push(wire.subarray(7, 23))).toEqual([{ type: 'session', width: 1080, height: 2400, clientResized: false }])
    expect(parser.push(wire.subarray(23))).toEqual([
      { type: 'packet', config: true, key: false, pts: 0n, data: configBody },
      { type: 'packet', config: false, key: true, pts: 42n, data: keyBody },
    ])
  })

  it('derives the AVC profile from SPS and prepends configuration to a key frame', () => {
    const config = Uint8Array.from([0, 0, 0, 1, 0x67, 0x64, 0, 0x28])
    const key = Uint8Array.from([0, 0, 0, 1, 0x65, 1])
    expect(avcCodecFromAnnexB(config)).toBe('avc1.640028')
    expect(concatVideoData([config], key)).toEqual(Uint8Array.from([...config, ...key]))
  })
})
