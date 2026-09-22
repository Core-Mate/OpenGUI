import { execFileSync } from 'node:child_process'
import { createHash, randomUUID } from 'node:crypto'
import { lstat, mkdir, readFile, rename, unlink, writeFile } from 'node:fs/promises'
import { homedir } from 'node:os'
import { dirname, join } from 'node:path'
import { nativeEndpoint } from './native-endpoint.ts'
import { nativeLaunchAgent } from './native-launch-agent.ts'
import { prepareUpgrade } from './prepare-upgrade.ts'

const sha = (text: string) => createHash('sha256').update(text).digest('hex')
async function optional(path: string): Promise<string | undefined> {
  try { return await readFile(path, 'utf8') } catch (error) { if ((error as NodeJS.ErrnoException).code === 'ENOENT') return undefined; throw error }
}
async function unredirected(path: string): Promise<void> {
  for (let cursor = path; cursor !== dirname(cursor); cursor = dirname(cursor)) {
    try { if ((await lstat(cursor)).isSymbolicLink()) throw new Error('Refuse redirected native service path') }
    catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error }
  }
}
async function replace(path: string, value: string): Promise<void> {
  await unredirected(path)
  const temporary = path + '.' + randomUUID() + '.tmp'
  await writeFile(temporary, value, { mode: 0o600, flag: 'wx' })
  await rename(temporary, path)
}

/** Stage a verified native service while the caller switches its configuration transaction. */
export async function stageNativeService(options: { configRoot: string; stateRoot: string; node: string; packageDir: string; launchAgentsDir?: string; enabled?: boolean }) {
  const uid = process.getuid?.()
  if (process.platform !== 'darwin' || uid === undefined) throw new Error('Native installation requires macOS')
  const service = nativeLaunchAgent({ configRoot: options.configRoot, stateRoot: options.stateRoot, node: options.node, packageDir: options.packageDir })
  const newPlist = options.enabled === false ? undefined : service.plist
  const directory = options.launchAgentsDir ?? join(homedir(), 'Library', 'LaunchAgents')
  const plist = join(directory, service.label + '.plist')
  const receipt = join(options.stateRoot, service.label + '.json')
  await unredirected(plist); await unredirected(receipt)
  const oldPlist = await optional(plist)
  const oldReceipt = await optional(receipt)
  const previous = oldReceipt ? JSON.parse(oldReceipt) as { plistSha256?: string } : undefined
  if (oldPlist !== undefined && previous?.plistSha256 !== sha(oldPlist)) throw new Error('Native service was modified or is unowned; retained')
  const target = `gui/${uid}/${service.label}`
  const launchctl = (...args: string[]) => execFileSync('/bin/launchctl', args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] })
  const loaded = () => {
    try {
      const result = launchctl('print', target)
      if (!result.split('\n').some(line => line.trim() === 'path = ' + plist)) throw new Error('Native service label belongs to another path')
      return true
    } catch (error) { if ((error as { status?: number }).status === 113) return false; throw error }
  }
  const wasLoaded = loaded()
  const unload = async () => {
    try { launchctl('bootout', target) }
    catch (error) { if (![3, 113].includes((error as { status?: number }).status ?? -1)) throw error }
    const deadline = Date.now() + 5000
    while (loaded()) {
      if (Date.now() >= deadline) throw new Error('Native service removal is still pending; no replacement allowed')
      await new Promise(resolve => setTimeout(resolve, 100))
    }
  }
  const load = async () => {
    const deadline = Date.now() + 5000
    for (;;) {
      try { launchctl('bootstrap', `gui/${uid}`, plist); return }
      catch (error) {
        // launchd may still be completing a just-acknowledged bootout. Retry only
        // this owned label while it is absent; never replace an unknown service.
        if ((error as { status?: number }).status !== 5 || loaded() || Date.now() >= deadline) throw error
        await new Promise(resolve => setTimeout(resolve, 100))
      }
    }
  }
  if (wasLoaded && oldPlist === undefined) throw new Error('Native service has no owned installation file')
  const guard = await prepareUpgrade(options.stateRoot)
  let replaced = false, newLoaded = false, committed = false, released = false
  const release = async () => { if (!released) { await guard.release(); released = true } }
  const rollback = async () => {
    if (committed) { await release(); return }
    if (newLoaded && loaded()) await unload()
    if (replaced) {
      if (await optional(plist) !== newPlist) throw new Error('Concurrent service edit retained; inspect installation before recovery')
      if (oldPlist === undefined) await unlink(plist)
      else await replace(plist, oldPlist)
    }
    if (wasLoaded && !loaded()) await load()
    await release()
  }
  try {
    await mkdir(directory, { recursive: true })
    await unredirected(plist)
    if (await optional(plist) !== oldPlist || await optional(receipt) !== oldReceipt) throw new Error('Native installation changed concurrently')
    const reuse = wasLoaded && oldPlist === newPlist
    if (wasLoaded && !reuse) await unload()
    if (newPlist === undefined) { if (oldPlist !== undefined) { await unlink(plist); replaced = true } }
    else {
    const endpoint = await nativeEndpoint(options.stateRoot)
    if (!reuse) {
      await replace(plist, newPlist); replaced = true
      newLoaded = true
      await load()
    }
    const deadline = Date.now() + 15000
    let ready = false
    while (Date.now() < deadline) {
      try {
        const response = await fetch(`http://127.0.0.1:${endpoint.port}/mcp`, { signal: AbortSignal.timeout(500), headers: {
          authorization: 'Bearer ' + endpoint.token, 'mcp-session-id': 'installation-readiness',
        } })
        await response.body?.cancel()
        if (response.status === 404 && loaded()) { ready = true; break }
      } catch {}
      await new Promise(resolve => setTimeout(resolve, 100))
    }
    if (!ready) throw new Error('Native service did not become ready; configuration retained')
    }
    // Prepare the receipt before configuration can commit. A commit failure must
    // leave the new service alive rather than pair new configuration with old code.
    const pending = receipt + '.pending-' + randomUUID()
    await writeFile(pending, JSON.stringify({ label: service.label, plistSha256: newPlist === undefined ? null : sha(newPlist), packageDir: options.packageDir, node: options.node, configRoot: options.configRoot }) + '\n', { mode: 0o600, flag: 'wx' })
    return {
      label: service.label,
      async commit() {
        committed = true
        try {
          if (await optional(receipt) !== oldReceipt) throw new Error('Native receipt changed; pending journal retained')
          await rename(pending, receipt)
        } finally { await release() }
      },
      rollback,
    }
  } catch (error) { await rollback(); throw error }
}
