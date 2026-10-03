import { createHash } from 'node:crypto'
import { homedir } from 'node:os'
import { join } from 'node:path'
import { sharedPhoneTasks } from '../../packages/task-service/src/client.ts'

export const phoneRoot = (): string => process.env.OPENGUI_DSH_HOME || join(homedir(), '.local', 'share', 'opengui-dsh')
export const phoneEndpoint = (): string => join('/tmp', `opengui-dsh-${process.getuid?.()}-${createHash('sha256').update(phoneRoot()).digest('hex').slice(0, 16)}.sock`)
export const PHONE_PROTOCOL = 1
const tasks = sharedPhoneTasks('dsh')

/** Host chat abort is not a task stop. The shared service keeps accepted work. */
export async function interruptPhoneOwner(_owner: string): Promise<void> {}

/** Refuse plugin upgrade while the shared service still has phone work. */
export async function assertPhoneUpgrade(): Promise<void> {
  await tasks.snapshot()
  if (!tasks.prepareMaintenance()) throw new Error('升级被阻止：请在手机工作台停止任务并关闭工作台后重试。')
}

export async function callPhoneTask(name: string, args: Record<string, unknown>, owner: string): Promise<unknown> {
  if (process.platform !== 'darwin') throw new Error('Autonomous phone tasks require macOS')
  return tasks.call(name, args, owner)
}
