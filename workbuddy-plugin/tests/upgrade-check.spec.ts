import { it, expect } from 'vitest'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { mkdtemp, rm } from 'node:fs/promises'
import { createServer } from 'node:net'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { brokerPort } from '../src/state.ts'

it('refuses to replace a listening runtime and allows upgrade only after it exits', async () => {
  const root = await mkdtemp(join(tmpdir(), 'opengui-upgrade-check-'))
  const server = createServer(socket => socket.end())
  const run = () => promisify(execFile)(process.execPath,
    ['--experimental-strip-types', fileURLToPath(new URL('../src/check-upgrade.ts', import.meta.url))],
    { env: { ...process.env, OPENGUI_WORKBUDDY_HOME: root }, timeout: 5000 })
  try {
    await new Promise<void>((resolve, reject) => {
      server.once('error', reject)
      server.listen(brokerPort(root), '127.0.0.1', resolve)
    })
    await expect(run()).rejects.toMatchObject({ stderr: expect.stringContaining('upgrade_blocked') })
    expect(server.listening).toBe(true)
    await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()))
    await expect(run()).resolves.toMatchObject({ stdout: expect.stringContaining('upgrade_ready') })
  } finally {
    if (server.listening) await new Promise<void>(resolve => server.close(() => resolve()))
    await rm(root, { recursive: true, force: true })
  }
})
