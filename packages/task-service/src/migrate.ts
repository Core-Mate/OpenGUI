import { cp, lstat, mkdir, writeFile } from 'node:fs/promises'
import { join } from 'node:path'

export interface LegacySource { host: 'codex' | 'workbuddy' | 'dsh'; root: string }

/** Copy old per-host task journals into a read-only archive. Credentials stay in the old keychain. */
export async function archiveLegacyTasks(serviceRoot: string, sources: readonly LegacySource[]): Promise<string[]> {
  const archived: string[] = []
  for (const source of sources) {
    const info = await lstat(source.root).catch(() => undefined)
    if (!info?.isDirectory() || info.isSymbolicLink()) continue
    const destination = join(serviceRoot, 'legacy', source.host)
    if (await lstat(destination).catch(() => undefined)) continue
    let copied = false
    for (const name of ['goals-v1', 'tasks-v1', 'evidence-v1']) {
      const from = join(source.root, name)
      if (!(await lstat(from).catch(() => undefined))?.isDirectory()) continue
      await mkdir(destination, { recursive: true, mode: 0o700 })
      await cp(from, join(destination, name), { recursive: true })
      copied = true
    }
    if (!copied) continue
    await writeFile(join(destination, 'READ-ONLY.txt'), 'Archived from the previous per-host phone task store. OpenGUI does not replay these tasks and does not copy model credentials.\n', { mode: 0o600 })
    archived.push(source.host)
  }
  return archived
}
