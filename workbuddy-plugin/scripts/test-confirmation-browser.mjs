import assert from 'node:assert/strict'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { randomUUID } from 'node:crypto'
import sharp from 'sharp'
const { ConfirmationServer } = await import(process.argv[2] ?? new URL('../lib/confirmation.js', import.meta.url).href)

// Real Chromium form submissions against synthetic approvals. No phone is connected.
const server = new ConfirmationServer()
const session = `opengui-confirmation-${randomUUID()}`
const run = promisify(execFile)
const browser = async (...args) => (await run('agent-browser', ['--session', session, ...args], { timeout: 30_000 })).stdout
const image = await sharp({ create: { width: 100, height: 100, channels: 3, background: '#334155' } }).jpeg().toBuffer()
try {
  for (const decision of ['approve', 'reject']) {
    const action = { deviceId: 'synthetic-device', action: 'key', key: 'Enter', externalSideEffect: 'send', observationId: 'synthetic-frame' }
    const request = await server.request(`synthetic-${decision}`, action, image)
    await browser('open', request.confirmationUrl)
    const page = await browser('snapshot', '-i')
    assert.match(page, /批准这一步/)
    assert.match(page, /拒绝/)
    await browser('find', 'role', 'button', 'click', '--name', decision === 'approve' ? '批准这一步' : '拒绝')
    await browser('wait', '--text', decision === 'approve' ? '已批准这一步' : '已拒绝')
    const result = await browser('snapshot')
    assert.match(result, decision === 'approve' ? /已批准这一步/ : /已拒绝/)
    if (decision === 'approve') {
      server.consume(request.requestId, `synthetic-${decision}`, action)
      assert.throws(() => server.consume(request.requestId, `synthetic-${decision}`, action))
    } else assert.throws(() => server.consume(request.requestId, `synthetic-${decision}`, action))
    console.log(`PASS: real browser ${decision}; one-time authorization enforced`)
  }
} finally {
  await browser('close').catch(() => undefined)
  await server.close()
}
