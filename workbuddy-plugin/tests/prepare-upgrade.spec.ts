import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, expect, it, vi } from 'vitest'
import { prepareUpgrade } from '../src/prepare-upgrade.ts'
import { assertNoUpgrade, brokerPort, brokerToken } from '../src/state.ts'
import { startBroker } from '../src/broker.ts'
import { WorkBuddyOpenGuiService } from '../src/service.ts'
import { FakeHost } from './fake-host.ts'

const cleanup: Array<() => unknown> = []
afterEach(async () => { for (const fn of cleanup.splice(0).reverse()) await fn(); vi.unstubAllEnvs() })
async function root() {
  const path = await mkdtemp(join(tmpdir(), 'opengui-upgrade-'))
  cleanup.push(() => rm(path, { recursive: true, force: true }))
  vi.stubEnv('OPENGUI_WORKBUDDY_HOME', path)
  return path
}
it('holds the startup barrier until the installer releases it and rejects a competing installer', async () => {
  const path = await root()
  const guard = await prepareUpgrade(path)
  try {
    expect(() => assertNoUpgrade(path)).toThrow('upgrade_in_progress')
    await expect(prepareUpgrade(path)).rejects.toMatchObject({ code: 'EEXIST' })
    expect(() => assertNoUpgrade(path)).toThrow('upgrade_in_progress')
  } finally { await guard.release() }
  expect(() => assertNoUpgrade(path)).not.toThrow()
})
it('retires an authenticated idle broker while holding the startup barrier', async () => {
  const path = await root()
  const broker = await startBroker({ port: brokerPort(path), token: await brokerToken(path), service: new WorkBuddyOpenGuiService({ host: new FakeHost() }) })
  cleanup.push(broker.close)
  const guard = await prepareUpgrade(path)
  try { expect(() => assertNoUpgrade(path)).toThrow('upgrade_in_progress') }
  finally { await guard.release() }
})
it('preserves a busy runtime and releases the failed installation barrier', async () => {
  const path = await root()
  const service = new WorkBuddyOpenGuiService({ host: new FakeHost() })
  const guardSpy = vi.spyOn(service, 'dispose')
  vi.spyOn(service, 'hasActiveSessions').mockReturnValue(true)
  const broker = await startBroker({ port: brokerPort(path), token: await brokerToken(path), service })
  cleanup.push(broker.close)
  await expect(prepareUpgrade(path)).rejects.toThrow('upgrade_blocked')
  expect(() => assertNoUpgrade(path)).not.toThrow()
  expect(guardSpy).not.toHaveBeenCalled()
})
