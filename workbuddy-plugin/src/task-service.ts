import { runTaskService } from '../../packages/task-service/src/main.ts'
import { executor } from './phone-agent.ts'
import { LocalAdbPhoneHost } from './service.ts'

await runTaskService(executor, root => new LocalAdbPhoneHost({ stateDir: root }))
