/**
 * Live Android emulator path for the four task entries.
 *
 * Start a dedicated emulator before running, off the default adb port:
 *   ANDROID_HOME=/opt/homebrew/share/android-commandlinetools
 *   "$ANDROID_HOME/emulator/emulator" -avd opengui_e2e_api35 -port 5584 -no-window -no-audio -no-boot-anim -gpu swiftshader_indirect
 *
 * Then: OPENGUI_EMULATOR_E2E=1 ./node_modules/.bin/vitest run tests/emulator-four-entry.e2e.spec.ts
 *
 * The planner is scripted. It does not call a model. Each entry must submit,
 * decode the first emulator video frame, store a real screencap, and stop.
 * The service root and device lease stay in a temp directory.
 */
import { execFile } from 'node:child_process'
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { promisify } from 'node:util'
import { describe, expect, it } from 'vitest'
import { parseDevices } from '../src/adb.ts'
import { LocalAdbPhoneHost } from '../src/codex/service.ts'
import { dataPath } from '../../../packages/task-service/src/paths.ts'
import { startTaskService } from '../../../packages/task-service/src/server.ts'
import { sharedPhoneTasks } from '../../../packages/task-service/src/client.ts'
import type { Executor, Task } from '../../../packages/phone-agent/src/contracts.ts'

const exec = promisify(execFile)
const enabled = process.env.OPENGUI_EMULATOR_E2E === '1'
const adb = process.env.OPENGUI_ADB_PATH || '/opt/homebrew/share/android-commandlinetools/platform-tools/adb'

function sleep(ms: number) { return new Promise(resolve => setTimeout(resolve, ms)) }

async function emulatorSerial(): Promise<string> {
  const { stdout } = await exec(adb, ['devices', '-l'], { timeout: 20_000 })
  const online = parseDevices(stdout).filter(device => device.state === 'device')
  if (online.some(device => device.connection !== 'emulator')) throw new Error('refusing to run while a non-emulator adb device is authorized')
  const emulators = online.filter(device => device.connection === 'emulator')
  const wanted = process.env.OPENGUI_EMULATOR_SERIAL
  const serial = wanted || (emulators.length === 1 ? emulators[0]?.serial : undefined)
  if (!serial || !emulators.some(device => device.serial === serial)) {
    throw new Error('one authorized Android emulator is required')
  }
  return serial
}

async function openViewer(url: string) {
  process.stderr.write('opening viewer\n')
  await exec('agent-browser', ['--session', 'opengui-e2e', 'open', url], { timeout: 30_000 })
}

async function closeViewer() {
  await exec('agent-browser', ['--session', 'opengui-e2e', 'close'], { timeout: 15_000 }).catch(() => undefined)
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
    const observed = await execution.observe()
    if (!observed.image.data.length) throw new Error('emulator screenshot was empty')
    await new Promise<void>(resolve => {
      if (execution.signal.aborted) { resolve(); return }
      execution.signal.addEventListener('abort', () => resolve(), { once: true })
    })
  },
}

async function until<T>(label: string, read: () => Promise<{ done?: boolean; fail?: string; value?: T }>): Promise<T> {
  const deadline = Date.now() + 90_000
  let last: { value?: T } = {}
  while (Date.now() < deadline) {
    const current = await read()
    last = current
    if (current.done) return current.value as T
    if (current.fail) throw new Error(label + ': ' + current.fail)
    await sleep(400)
  }
  throw new Error(label + ' timed out: ' + JSON.stringify(last.value ?? null))
}

describe.skipIf(!enabled)('android emulator four-entry path', () => {
  it('submits, stores emulator evidence, and stops from web, Codex, WorkBuddy, and DSH', async () => {
    process.env.OPENGUI_ADB_PATH = adb
    const serial = await emulatorSerial()
    process.stderr.write('emulator ' + serial + '\n')
    await exec('agent-browser', ['--session', 'opengui-e2e', 'open', 'about:blank'], { timeout: 30_000 })
    const root = await mkdtemp(join(tmpdir(), 'opengui-emulator-e2e-'))
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
    const hosts = {
      codex: sharedPhoneTasks('codex', root),
      workbuddy: sharedPhoneTasks('workbuddy', root),
      dsh: sharedPhoneTasks('dsh', root),
    }
    const report: Array<Record<string, unknown>> = []
    const runEntry = async (name: string, submit: () => Promise<Task>, status: (id: string) => Promise<Task>, stop: (id: string) => Promise<Task>) => {
      const started = Date.now()
      let viewerOpened = false
      try {
        const goal = await submit()
        const childId = await until(name + ' child', async () => {
          const current = await status(goal.id)
          const id = current.group?.children?.[0]
          if (id) return { done: true, value: id }
          if (['blocked', 'failed', 'cancelled', 'unknown'].includes(current.phase)) return { fail: current.summary || current.phase }
          return { value: current.phase }
        })
        const ready = await until(name + ' evidence', async () => {
          const child = await status(childId)
          if (!viewerOpened && child.viewerUrl) { viewerOpened = true; await openViewer(child.viewerUrl) }
          if (child.evidence?.length) return { done: true, value: child }
          if (['blocked', 'failed', 'cancelled', 'unknown'].includes(child.phase)) return { fail: child.summary || child.error || child.phase }
          return { value: child.phase }
        })
        const file = ready.evidence[0]!.file
        const bytes = await readFile(join(data, 'evidence-v1', file))
        if (bytes.subarray(0, 2).toString('hex') !== 'ffd8') throw new Error('evidence is not a jpeg')
        const stopped = await stop(goal.id)
        const child = await until(name + ' stop', async () => {
          const current = await status(childId)
          if (current.phase === 'cancelled') return { done: true, value: current }
          if (current.phase === 'unknown') return { fail: current.summary || 'stop left the branch unknown' }
          return { value: current.phase }
        })
        report.push({ entry: name, result: 'pass', ms: Date.now() - started, goalPhase: stopped.phase, branchPhase: child.phase, evidenceBytes: bytes.length, deviceName: ready.deviceName })
      } catch (error) {
        report.push({ entry: name, result: 'fail', ms: Date.now() - started, error: error instanceof Error ? error.message : String(error) })
      }
    }
    try {
      const opened = await hosts.codex.call('opengui_open_workbench', {}, 'e2e-web') as { url?: string }
      if (!opened.url) throw new Error('workbench url missing')
      const page = opened.url
      const origin = new URL(page).origin
      const webStatus = async (taskId: string): Promise<Task> => {
        const response = await fetch(page + 'state', { headers: { origin } })
        const body = await response.json() as { error?: string; tasks: Task[] }
        if (!response.ok) throw new Error(body.error || 'workbench state failed')
        const task = body.tasks.find(item => item.id === taskId)
        if (!task) throw new Error('task missing from workbench')
        return task
      }
      await runEntry('web', async () => {
        const response = await fetch(page + 'run', {
          method: 'POST',
          headers: { origin, 'content-type': 'application/json' },
          body: JSON.stringify({ requestId: 'e2e-web', goal: 'Open the emulator settings screen', successCriteria: 'Settings is visible' }),
        })
        const body = await response.json() as Task & { error?: string }
        if (!response.ok) throw new Error(body.error || 'web submit failed')
        return body
      }, webStatus, async (goalId) => {
        const response = await fetch(page + 'manage', {
          method: 'POST', headers: { origin, 'content-type': 'application/json' },
          body: JSON.stringify({ taskId: goalId, action: 'stop' }),
        })
        const body = await response.json() as Task & { error?: string }
        if (!response.ok) throw new Error(body.error || 'web stop failed')
        return body
      })
      for (const name of ['codex', 'workbuddy', 'dsh'] as const) {
        const client = hosts[name]
        const owner = 'e2e-' + name
        await runEntry(name,
          () => client.call('opengui_run_task', { requestId: 'e2e-' + name, goal: 'Open the emulator settings screen', successCriteria: 'Settings is visible' }, owner) as Promise<Task>,
          (taskId) => client.call('opengui_manage_task', { action: 'status', taskId }, owner) as Promise<Task>,
          (taskId) => client.call('opengui_manage_task', { action: 'stop', taskId }, owner) as Promise<Task>)
      }
    } finally {
      await closeViewer()
      await service.close()
      await rm(root, { recursive: true, force: true })
    }
    process.stderr.write(JSON.stringify({ serial, modelExecution: false, entries: report }, null, 2) + '\n')
    expect(report.map(item => item.result)).toEqual(['pass', 'pass', 'pass', 'pass'])
  }, 480_000)
})
