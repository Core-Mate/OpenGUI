import { homedir } from 'node:os'
import { join } from 'node:path'
import { startTaskService } from './server.ts'
import { archiveLegacyTasks } from './migrate.ts'
import { serviceRoot } from './paths.ts'
import { keychain } from '../../phone-agent/src/credentials.ts'
import type { Executor, Hardware } from '../../phone-agent/src/contracts.ts'

export async function runTaskService(executor: Executor, createHardware: (root: string) => Hardware): Promise<void> {
  const root = serviceRoot()
  await archiveLegacyTasks(root, [
    { host: 'codex', root: join(process.env.OPENGUI_CODEX_DATA_DIR || join(homedir(), '.codex', 'opengui-codex'), 'phone-agent') },
    { host: 'workbuddy', root: join(process.env.OPENGUI_WORKBUDDY_HOME || join(homedir(), '.workbuddy', 'opengui'), 'phone-agent') },
    { host: 'dsh', root: join(process.env.OPENGUI_DSH_HOME || join(homedir(), '.local', 'share', 'opengui-dsh'), 'phone-agent') },
  ])
  const hardware = createHardware(root)
  const service = await startTaskService({ root, hardware, executor, credentials: keychain('shared') })
  process.stderr.write('opengui task service listening\n')
  for (const signal of ['SIGINT', 'SIGTERM'] as const) {
    process.on(signal, () => { void service.close().finally(() => process.exit(0)) })
  }
}
