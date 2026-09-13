import assert from 'node:assert/strict'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { randomUUID } from 'node:crypto'
import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { tmpdir } from 'node:os'
const { ViewerServer } = await import((process.argv[2] ? pathToFileURL(resolve(process.argv[2])).href : undefined) ?? new URL('../lib/viewer.js', import.meta.url).href)
const run = promisify(execFile), directory = await mkdtemp(join(tmpdir(), 'opengui-video-browser-'))
const session = `viewer-${randomUUID()}`
const browser = async (...args) => (await run('agent-browser', ['--session', session, ...args], { timeout: 30_000 })).stdout
const deviceCount = Number(process.env.VIEWER_TEST_DEVICES ?? 1)
const soakMs = Number(process.env.VIEWER_SOAK_MS ?? 0)
let released = 0
const timers = new Set()
try {
  const frames = []
  for (const [color, size] of [['red', '160x320'], ['blue', '160x320'], ['green', '320x160']]) {
    const file = join(directory, `${color}.h264`)
    await run('ffmpeg', ['-v', 'error', '-f', 'lavfi', '-i', `color=c=${color}:s=${size}:r=30`, '-frames:v', '1', '-c:v', 'libx264', '-preset', 'ultrafast', '-tune', 'zerolatency', '-pix_fmt', 'yuv420p', '-f', 'h264', file])
    frames.push(await readFile(file))
  }
  let revision = 0
  const streams = { async prepare() {}, async dispose() { for (const t of timers) clearInterval(t) }, async subscribe(_device, sink) {
    sink.sendText(JSON.stringify({ type: 'session', width: 160, height: 320 }))
    let previousRevision = -1
    const timer = setInterval(() => {
      if (revision !== previousRevision) {
        previousRevision = revision
        const data = frames[revision], starts = []
        for (let i = 0; i + 4 < data.length; i++) if (data[i] === 0 && data[i+1] === 0 && (data[i+2] === 1 || data[i+2] === 0 && data[i+3] === 1)) { const offset = data[i+2] === 1 ? 3 : 4; starts.push({ i, type: data[i+offset] & 31 }); i += offset - 1 }
        const config = Buffer.concat(starts.flatMap((n, i) => [7,8].includes(n.type) ? [data.subarray(n.i, starts[i+1]?.i ?? data.length)] : []))
        const packet = Buffer.alloc(9 + config.length); packet[0] = 1; config.copy(packet, 9); sink.sendBinary(packet)
      }
      const data = frames[revision], frame = Buffer.alloc(9 + data.length)
      frame[0] = 2; frame.writeBigUInt64BE(BigInt(Date.now()) * 1000n, 1); data.copy(frame, 9); sink.sendBinary(frame)
    }, 33)
    timers.add(timer)
    return () => { clearInterval(timer); timers.delete(timer); released++ }
  } }
  const viewer = new ViewerServer(streams)
  try {
    const opened = await viewer.open('synthetic-task', Array.from({ length: deviceCount }, (_, i) => ({ id: i === 0 ? 'synthetic' : `synthetic-${i}`, name: `Synthetic video QA ${i+1}`, serial: `test-only-${i}` })), AbortSignal.timeout(1000))
    assert.throws(() => viewer.assertReady(opened.viewerId))
    const started = Date.now()
    await browser('open', opened.url)
    await browser('snapshot', '-i')
    await browser('wait', '--fn', 'document.querySelector("canvas")?.width === 160 && !document.querySelector("canvas").classList.contains("stale")')
    assert((await viewer.status(opened.viewerId, 'synthetic-task', 3000)).firstDisplayEstablished)
    const firstFrameMs = Date.now() - started
    const red = await browser('eval', '(()=>{const c=document.querySelector("canvas");return c.getContext("2d").getImageData(80,160,1,1).data[0]>200})()')
    assert.match(red, /true/)
    revision = 1
    await browser('wait', '--fn', 'document.querySelector("canvas").getContext("2d").getImageData(80,160,1,1).data[2]>200')
    revision = 2
    await browser('wait', '--fn', 'document.querySelector("canvas").width === 320 && document.querySelector("canvas").height === 160 && !document.querySelector("canvas").classList.contains("stale")')
    viewer.endTask(opened.viewerId)
    await browser('wait', '--text', '任务已结束')
    assert.equal(released, 0)
    assert.match(await browser('eval', 'cards.get("synthetic").frames'), /\d+/)
    const samples = [], soakStarted = Date.now()
    while (Date.now() - soakStarted < soakMs) {
      await new Promise(resolve => setTimeout(resolve, Math.min(30_000, soakMs - (Date.now() - soakStarted))))
      const raw = await browser('eval', 'JSON.stringify(Array.from(cards.values()).map(c=>({frames:c.frames,retries:c.retries,queue:c.decoder?.decodeQueueSize,latencyMs:c.decodedAt-c.lastPTS/1000,rendered:c.rendered})))')
      const sample = { elapsedMs: Date.now() - soakStarted, rss: process.memoryUsage().rss, streams: timers.size, cards: JSON.parse(JSON.parse(raw)) }
      assert.equal(sample.streams, deviceCount)
      assert(sample.cards.every(c => c.rendered && c.queue <= 3 && c.retries === 0))
      samples.push(sample)
      console.log(JSON.stringify({ soakSample: sample }))
    }
    await browser('close')
    const deadline = Date.now() + 5000
    while (released === 0 && Date.now() < deadline) await new Promise(resolve => setTimeout(resolve, 50))
    assert.equal(released, deviceCount)
    viewer.assertReady(opened.viewerId)
    console.log(JSON.stringify({ result: 'PASS', deviceCount, soakMs, samples, firstFrameMs, actualH264Decode: true, updatedCanvas: true, resolutionChange: true, playbackAfterTaskEnd: true, releaseOnPageClose: true }))
  } finally { await viewer.dispose() }
} finally { await browser('close').catch(() => {}); await rm(directory, { recursive: true, force: true }) }
