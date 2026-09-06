import assert from 'node:assert/strict'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { randomUUID } from 'node:crypto'
import sharp from 'sharp'
const { DeviceWallServer } = await import(process.argv[2] ?? new URL('../lib/wall.js', import.meta.url).href)

// Exercise real browser image loading/CSP and stop semantics with synthetic frames.
const run = promisify(execFile)
const session = `opengui-wall-${randomUUID()}`
const browser = async (...args) => (await run('agent-browser', ['--session', session, ...args], { timeout: 30_000 })).stdout
let state = 'active', revision = 0, reads = 0
const frames = await Promise.all(['#ff0000', '#0000ff'].map(background => sharp({ create: { width: 100, height: 200, channels: 3, background } }).jpeg().toBuffer()))
const wall = new DeviceWallServer(async () => ({ sessionId: 'synthetic', state, createdAt: new Date().toISOString(),
  devices: [{ id: 'synthetic-a', name: 'Synthetic QA phone', authorized: true, connected: true, operationCount: 0 }] }), async () => { reads++; return frames[revision] })
try {
  await wall.start()
  await browser('open', wall.url('synthetic'))
  await browser('snapshot', '-i')
  await browser('wait', '--fn', '!!document.querySelector("img")?.naturalWidth')
  const first = await browser('eval', 'document.querySelector("img").src')
  assert.match(first, /blob:/)
  assert.ok(reads > 0)
  revision = 1
  await browser('wait', '--fn', `document.querySelector("img").src !== ${first.trim()}`)
  await browser('wait', '--fn', 'document.querySelector("img").complete && document.querySelector("img").naturalWidth === 100')
  const blue = await browser('eval', '(()=>{const i=document.querySelector("img"),c=document.createElement("canvas");c.width=100;c.height=200;const x=c.getContext("2d");x.drawImage(i,0,0);return x.getImageData(50,50,1,1).data[2]>240})()')
  assert.match(blue, /true/)
  state = 'closed'
  await browser('wait', '--text', '已结束')
  const hidden = await browser('eval', 'document.querySelector("img").hidden')
  assert.match(hidden, /true/)
  const finalReads = reads
  await browser('wait', '1800')
  assert.equal(reads, finalReads)
  console.log('PASS: actual blob image decoded, updated frame rendered, closed session hid image and stopped preview reads')
} finally {
  await browser('close').catch(() => undefined)
  await wall.close()
}
