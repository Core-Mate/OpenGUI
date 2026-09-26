import { homedir } from 'node:os'
import { join } from 'node:path'
import { startTaskService } from '../../../packages/task-service/src/server.ts'
import { archiveLegacyTasks } from '../../../packages/task-service/src/migrate.ts'
import { serviceRoot } from '../../../packages/task-service/src/paths.ts'
import { keychain } from '../../../packages/phone-agent/src/credentials.ts'
import { executor } from './phone-agent.ts'
import { LocalAdbPhoneHost } from './codex/service.ts'

const root = serviceRoot()
await archiveLegacyTasks(root, [
  { host: 'codex', root: join(process.env.OPENGUI_CODEX_DATA_DIR || join(homedir(), '.codex', 'opengui-codex'), 'phone-agent') },
  { host: 'workbuddy', root: join(process.env.OPENGUI_WORKBUDDY_HOME || join(homedir(), '.workbuddy', 'opengui'), 'phone-agent') },
  { host: 'dsh', root: join(process.env.OPENGUI_DSH_HOME || join(homedir(), '.local', 'share', 'opengui-dsh'), 'phone-agent') },
])
const hardware = new LocalAdbPhoneHost({ stateDir: root })
const service = await startTaskService({ root, hardware, executor, credentials: keychain('shared') })
process.stderr.write('opengui task service listening\n')
for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.on(signal, () => { void service.close().finally(() => process.exit(0)) })
}
