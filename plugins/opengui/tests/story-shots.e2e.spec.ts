/** One-off story screenshots. Not part of the default suite. */
import { execFile } from 'node:child_process'
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { promisify } from 'node:util'
import { describe, it } from 'vitest'
import { parseDevices } from '../src/adb.ts'
import { LocalAdbPhoneHost } from '../src/codex/service.ts'
import { dataPath } from '../../../packages/task-service/src/paths.ts'
import { startTaskService } from '../../../packages/task-service/src/server.ts'
import { sharedPhoneTasks } from '../../../packages/task-service/src/client.ts'
import type { Executor, Task } from '../../../packages/phone-agent/src/contracts.ts'

const exec = promisify(execFile)
const adb = process.env.OPENGUI_ADB_PATH || '/opt/homebrew/share/android-commandlinetools/platform-tools/adb'
const shots = process.env.OPENGUI_SHOT_DIR || ''
const session = 'opengui-story'

function sleep(ms: number) { return new Promise(resolve => setTimeout(resolve, ms)) }
async function browser(...args: string[]) {
  await exec('agent-browser', ['--session', session, ...args], { timeout: 40_000 })
}
async function shot(name: string) {
  await browser('screenshot', '--full', join(shots, name))
}
async function waitBoot() {
  const deadline = Date.now() + 180_000
  while (Date.now() < deadline) {
    const { stdout } = await exec(adb, ['devices', '-l'], { timeout: 15_000 }).catch(() => ({ stdout: '' }))
    const ready = parseDevices(stdout).find(device => device.serial === 'emulator-5584' && device.state === 'device')
    if (ready) return
    await sleep(2000)
  }
  throw new Error('emulator-5584 did not become authorized')
}

const executor: Executor = {
  probe: async () => {},
  plan: async input => ({
    kind: 'branches',
    branches: [{
      goal: input.goal,
      successCriteria: input.successCriteria || input.goal,
      eligibleDeviceIds: input.devices.filter(device => device.authorized && device.connected).map(device => device.id),
    }],
  }),
  run: async execution => {
    await execution.observe()
    await new Promise<void>(resolve => {
      if (execution.signal.aborted) { resolve(); return }
      execution.signal.addEventListener('abort', () => resolve(), { once: true })
    })
  },
}

async function until<T>(label: string, read: () => Promise<T | undefined>, debug: () => Promise<string>): Promise<T> {
  const deadline = Date.now() + 90_000
  let last = ''
  while (Date.now() < deadline) {
    const value = await read()
    last = await debug().catch(error => String(error))
    if (value) return value
    await sleep(400)
  }
  throw new Error(label + ' timed out: ' + last)
}

describe.skipIf(!shots)('story screenshots', () => {
  it('captures the six-step story and four entries', async () => {
    if (!shots) throw new Error('OPENGUI_SHOT_DIR required')
    process.env.OPENGUI_ADB_PATH = adb
    await mkdir(shots, { recursive: true })
    const root = await mkdtemp(join(tmpdir(), 'opengui-story-'))
    const data = dataPath(root)
    await mkdir(data, { recursive: true, mode: 0o700 })
    await writeFile(join(data, 'models-v1.json'), JSON.stringify([{
      id: 'e2e', protocol: 'openai-completions', baseUrl: 'http://127.0.0.1:9/v1', model: 'e2e-fixture', credentialRef: 'e2e',
    }]), { mode: 0o600 })
    const hardware = new LocalAdbPhoneHost({ adbPath: adb, stateDir: root })
    const service = await startTaskService({
      root, hardware, executor, leaseRoot: join(root, 'leases'),
      credentials: { get: async () => 'e2e-not-sent', set: async () => {} },
    })
    const codex = sharedPhoneTasks('codex', root)
    const hosts = {
      codex,
      workbuddy: sharedPhoneTasks('workbuddy', root),
      dsh: sharedPhoneTasks('dsh', root),
    }
    try {
      const opened = await codex.call('opengui_open_workbench', {}, 'story') as { url: string }
      const page = opened.url
      const origin = new URL(page).origin
      await browser('open', page)
      await browser('set', 'viewport', '1280', '900')
      await browser('wait', '--text', '新任务')
      await shot('02-open-workbench.png')
      await browser('open', page + '#guide')
      await browser('wait', '--text', '连接设备')
      await shot('01-install-guide.png')
      await browser('open', page + '#home')
      await browser('wait', '--text', '试试这些任务')
      await shot('03-browse-first.png')
      await waitBoot()
      await browser('click', '#refresh')
      await browser('wait', '--text', 'Emulator')
      await browser('open', page + '#devices')
      await browser('wait', '--text', '空闲')
      await shot('04-device-authorized.png')
      await browser('open', page + '#home')
      await browser('fill', '#goal', '打开模拟器的系统设置，确认这是 Android 模拟器')
      await shot('05-submit-task.png')
      await browser('click', '#submit')
      await browser('wait', '--fn', 'location.hash.startsWith("#task/")')
      await shot('06-auto-assign.png')
      const state = async () => {
        const response = await fetch(page + 'state', { headers: { origin } })
        const body = await response.json() as { tasks?: Task[]; error?: string }
        if (!response.ok || !body.tasks) throw new Error(body.error || 'workbench state failed')
        return body.tasks
      }
      const debug = async () => JSON.stringify((await state()).map(task => ({
        phase: task.phase, summary: task.summary, error: task.error, parent: Boolean(task.parentId),
        viewer: Boolean(task.viewerUrl), evidence: task.evidence.length, goal: task.goal.slice(0, 32),
      })))
      const web = await until('web goal', async () => (await state()).find(task => !task.parentId && task.goal.includes('打开模拟器的系统设置')), debug)
      const child = await until('web viewer', async () => {
        const tasks = await state()
        const parent = tasks.find(task => task.id === web.id)
        const branch = tasks.find(task => task.parentId === web.id && task.viewerUrl)
        if (parent && ['blocked', 'failed', 'cancelled', 'unknown'].includes(parent.phase) && !branch) {
          throw new Error('web planning stopped: ' + parent.summary)
        }
        return branch
      }, debug)
      await browser('open', child.viewerUrl!)
      await until('web evidence', async () => (await state()).find(task => task.id === child.id && task.evidence.length), debug)
      await browser('open', page + '#task/' + web.id)
      await browser('wait', '--text', '打开原始截图')
      await shot('07-running-evidence.png')
      await browser('click', '#stop')
      await browser('wait', '--text', '已停止')
      await shot('08-stopped-result.png')
      await browser('open', 'about:blank')
      const goals = [
        ['codex', 'Codex 入口提交：查看模拟器设置'],
        ['workbuddy', 'WorkBuddy 入口提交：查看模拟器设置'],
        ['dsh', 'DSH 入口提交：查看模拟器设置'],
      ] as const
      for (const [name, goal] of goals) {
        const client = hosts[name]
        const created = await client.call('opengui_run_task', {
          requestId: 'story-' + name, goal, successCriteria: '设置页可见',
        }, 'story-' + name) as Task
        const branch = await until(name + ' viewer', async () => {
          const tasks = await state()
          const parent = tasks.find(task => task.id === created.id)
          const found = tasks.find(task => task.parentId === created.id && task.viewerUrl)
          if (parent && ['blocked', 'failed', 'cancelled', 'unknown'].includes(parent.phase) && !found) {
            throw new Error(name + ' planning stopped: ' + parent.summary)
          }
          return found
        }, debug)
        await browser('open', branch.viewerUrl!)
        await until(name + ' evidence', async () => (await state()).find(task => task.id === branch.id && task.evidence.length), debug)
        await browser('open', page + '#task/' + created.id)
        await browser('wait', '--text', name === 'workbuddy' ? 'WorkBuddy' : name === 'dsh' ? 'DSH' : 'Codex')
        await shot('09-entry-' + name + '-running.png')
        await client.call('opengui_manage_task', { action: 'stop', taskId: created.id }, 'story-' + name)
        await browser('wait', '--text', '已停止')
        await shot('10-entry-' + name + '-stopped.png')
        await browser('open', 'about:blank')
      }
    } finally {
      await exec('agent-browser', ['--session', session, 'close'], { timeout: 15_000 }).catch(() => undefined)
      await service.close()
      await rm(root, { recursive: true, force: true })
    }
  }, 480_000)
})
