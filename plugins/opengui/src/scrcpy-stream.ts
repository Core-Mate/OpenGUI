import { ScrcpyVideoStreams as RuntimeStreams, buildScrcpyVideoServerArgs as serverArgs,
  type ScrcpyVideoStreamsOptions as RuntimeOptions } from '../../../packages/device-runtime/src/scrcpy-stream.ts'
import { SCRCPY_VERSION, resolveScrcpyAsset } from './scrcpy.ts'
export { ScrcpyVideoPacketParser } from '../../../packages/device-runtime/src/scrcpy-stream.ts'
export type { VideoDevice, ScrcpyStreamSink, ScrcpyStreamStatus, ScrcpyVideoEvent } from '../../../packages/device-runtime/src/scrcpy-stream.ts'
export type ScrcpyVideoStreamsOptions = Omit<RuntimeOptions, 'version' | 'remoteServer'>
const remoteServer = '/data/local/tmp/opengui-codex-scrcpy-server.jar'
export function buildScrcpyVideoServerArgs(scid: string, serverPath = remoteServer): string[] {
  return serverArgs(scid, serverPath, SCRCPY_VERSION)
}
export class ScrcpyVideoStreams extends RuntimeStreams {
  constructor(options: ScrcpyVideoStreamsOptions) {
    super({ ...options, asset: options.asset ?? resolveScrcpyAsset(), version: SCRCPY_VERSION, remoteServer })
  }
}
