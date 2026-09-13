import { join } from 'node:path'
import { resolveScrcpyAsset, ScrcpyInstaller } from './scrcpy.ts'
import { workbuddyStateDir } from './state.ts'
const asset = resolveScrcpyAsset()
if (!asset) throw new Error('video_unsupported_platform')
const installer = new ScrcpyInstaller({ cacheDir: join(workbuddyStateDir(), 'scrcpy') })
const cached = await installer.isInstalled(asset)
const started = Date.now()
    let lastProgress = 0
await installer.ensure(asset, AbortSignal.timeout(600_000), progress => { if (Date.now() - lastProgress >= 1000 || progress.phase !== 'downloading') { lastProgress = Date.now(); process.stderr.write(`video_prepare: ${progress.phase} ${progress.downloadedBytes ?? 0} bytes\n`) } })
process.stdout.write(JSON.stringify({ videoResources: 'ready', cached, elapsedMs: Date.now() - started, hostLoaded: 'unverified', viewerAvailable: 'unverified' }) + '\n')
