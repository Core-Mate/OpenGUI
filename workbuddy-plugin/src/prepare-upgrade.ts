import { lstat, mkdir, rmdir } from 'node:fs/promises'
import { createConnection } from 'node:net'
import { join } from 'node:path'
import { BrokerClient } from './broker-client.ts'
import { brokerPort, brokerToken, ensurePrivateState, VERSION, workbuddyStateDir } from './state.ts'

async function listenerPresent(port: number): Promise<boolean> {
  return new Promise((resolve, reject) => {
    const socket = createConnection({ host: '127.0.0.1', port })
    socket.setTimeout(1500, () => { socket.destroy(); reject(new Error('upgrade_check_timeout')) })
    socket.once('connect', () => { socket.destroy(); resolve(true) })
    socket.once('error', error => { socket.destroy(); if ((error as NodeJS.ErrnoException).code === 'ECONNREFUSED') resolve(false); else reject(error) })
  })
}

/** Hold this barrier through service and configuration replacement, including rollback. */
export async function prepareUpgrade(stateDir = workbuddyStateDir()): Promise<{ release: () => Promise<void> }> {
  await ensurePrivateState(stateDir)
  const lock = join(stateDir, 'upgrade.lock')
  await mkdir(lock, { mode: 0o700 })
  const owned = await lstat(lock)
  const release = async () => {
    const current = await lstat(lock)
    if (!current.isDirectory() || current.isSymbolicLink() || current.ino !== owned.ino || current.dev !== owned.dev) {
      throw new Error('Upgrade lock changed; retained for inspection')
    }
    await rmdir(lock)
  }
  try {
    const port = brokerPort(stateDir)
    if (await listenerPresent(port)) {
      // Never spawn a runtime, accept a foreign listener, or kill a process to upgrade.
      const client = await BrokerClient.connect(port, await brokerToken(stateDir), VERSION, 'installer')
      try {
        const result = await client.prepareUpgrade(AbortSignal.timeout(3000)) as { ready?: unknown }
        if (result.ready !== true) throw new Error('Runtime did not acknowledge upgrade readiness')
      } finally { client.close() }
      const deadline = Date.now() + 5000
      while (await listenerPresent(port)) {
        if (Date.now() >= deadline) throw new Error('Runtime cleanup pending; no replacement allowed')
        await new Promise(resolve => setTimeout(resolve, 100))
      }
    }
    return { release }
  } catch (error) { await release(); throw error }
}
