import assert from 'node:assert/strict'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { cp, mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { LocalAdbPhoneHost } from '../lib/service.js'
import { ViewerServer } from '../lib/viewer.js'
import { acquireDeviceLease } from '../../packages/device-runtime/src/device-lease.ts'

assert(process.env.OPENGUI_QA_SERIAL, 'Set an explicitly authorized OPENGUI_QA_SERIAL')
const root = await mkdtemp(join(tmpdir(), 'opengui-real-frame-'))
const run = promisify(execFile), session = `opengui-frame-${process.pid}`
const browser = (...args) => run('agent-browser', ['--session', session, ...args], { timeout: 35000 })
let host, viewer, lease
const transport = { subscriptions: 0, packets: 0, bytes: 0, events: [] }
try {
  if (process.env.OPENGUI_QA_SCRCPY_CACHE) await cp(process.env.OPENGUI_QA_SCRCPY_CACHE, join(root, 'scrcpy'), { recursive: true })
  host = new LocalAdbPhoneHost({ stateDir: root })
  const devices = await host.inspectDevices(AbortSignal.timeout(10000))
  const device = devices.find(d => d.serial === process.env.OPENGUI_QA_SERIAL)
  assert(device?.authorized, 'Selected phone must be present and authorized')
  lease = await acquireDeviceLease(device.serial, 'workbuddy:read-only-frame-qa')
  viewer = new ViewerServer({
    prepare: signal => host.videoStreams.prepare(signal), dispose: () => host.videoStreams.dispose(),
    subscribe: async (device, sink) => {
      transport.subscriptions++
      return host.videoStreams.subscribe(device, { ...sink,
        sendBinary: data => { transport.packets++; transport.bytes += data.length; sink.sendBinary(data) },
        sendText: text => { const event = JSON.parse(text); transport.events.push({ type: event.type, message: event.type === 'error' ? event.message : undefined }); sink.sendText(text) },
      })
    },
  })
  const start = Date.now()
  const opened = await viewer.open('real-frame-qa', [device], AbortSignal.timeout(60000))
  await browser('open', opened.url)
  await browser('snapshot', '-i')
  const state = await viewer.status(opened.viewerId, 'real-frame-qa', 30000)
  const diagnostics = await browser('eval', 'JSON.stringify(Array.from(cards.values()).map(c=>({frames:c.frames,visible:c.visible,width:c.canvas.width,height:c.canvas.height,rendered:c.rendered,message:c.message.textContent})))')
  console.log(JSON.stringify({ firstDisplayEstablished: state.firstDisplayEstablished, elapsedMs: Date.now() - start, state: state.state, errorCode: state.errorCode, transport, canvas: JSON.parse(JSON.parse(diagnostics.stdout)) }))
  assert(state.firstDisplayEstablished, 'Real visible decoded first frame required')
} finally {
  await browser('close').catch(() => {})
  await viewer?.dispose()
  await host?.dispose()
  await lease?.release()
  await rm(root, { recursive: true, force: true })
}
