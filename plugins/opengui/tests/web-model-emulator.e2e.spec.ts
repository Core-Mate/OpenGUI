/**
 * Opt-in Web → model protocol → real emulator acceptance path.
 * Run a dedicated AVD on port 5586; set OPENGUI_EMULATOR_SERIAL for another port.
 */
import { execFile } from 'node:child_process'
import { createServer } from 'node:http'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { promisify } from 'node:util'
import { randomUUID } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import { LocalAdbPhoneHost } from '../src/codex/service.ts'
import { executor } from '../src/phone-agent.ts'
import { startTaskService } from '../../../packages/task-service/src/server.ts'
import { sharedPhoneTasks } from '../../../packages/task-service/src/client.ts'
import type { Hardware, Task } from '../../../packages/phone-agent/src/contracts.ts'

const enabled = process.env.OPENGUI_WEB_MODEL_EMULATOR_E2E === '1'
const exec = promisify(execFile)
const serial = process.env.OPENGUI_EMULATOR_SERIAL || 'emulator-5586'

function newestField(value: unknown, key: string): string | undefined {
  if (typeof value === 'string') {
    try { return newestField(JSON.parse(value), key) } catch {}
    return undefined
  }
  if (Array.isArray(value)) return value.map(item => newestField(item, key)).filter(Boolean).at(-1)
  if (value && typeof value === 'object') {
    if (key in value && typeof value[key as keyof typeof value] === 'string') return value[key as keyof typeof value] as string
    return Object.values(value).map(item => newestField(item, key)).filter(Boolean).at(-1)
  }
  return undefined
}

async function gateway(deviceId: string) {
  let step = 0
  let calls = 0
  let stopScenario = false
  const errors: string[] = []
  const server = createServer((req, res) => {
    let requestSummary = ''
    void (async () => {
      let raw = ''
      for await (const part of req) raw += String(part)
      const body = JSON.parse(raw) as Record<string, unknown>
      requestSummary = JSON.stringify(body.messages, (_key, value) => typeof value === 'string' && value.length > 500 ? value.slice(0, 120) + '…' : value).slice(-3000)
      const names = JSON.stringify(body.tools ?? [])
      let name: string
      let args: Record<string, unknown>
      if (names.includes('image_check')) { name = 'image_check'; args = { color: 'red' } }
      else if (names.includes('propose_plan')) {
        name = 'propose_plan'
        args = { kind: 'branches', branches: [{ goal: '打开系统设置', successCriteria: '设置应用已打开', eligibleDeviceIds: [deviceId] }] }
      } else {
        if (stopScenario && step >= 1) {
          res.writeHead(200, { 'Content-Type': 'text/event-stream' })
          return
        }
        const observed = newestField(body.messages, 'observationId')
        if (step === 0) { name = 'observe'; args = {} }
        else if (step === 1) {
          if (!observed) throw Error('model did not receive the first emulator screenshot')
          name = 'phone_action'
          args = { action: 'launch', observationId: observed, packageName: 'com.android.settings', externalSideEffect: 'none' }
        } else if (step === 2) { name = 'observe'; args = {} }
        else {
          if (!observed) throw Error('model did not receive the final emulator screenshot')
          name = 'finish'
          args = { summary: '系统设置已打开', evidenceId: observed, status: 'passed' }
        }
        step++
      }
      calls++
      res.writeHead(200, { 'Content-Type': 'text/event-stream' })
      const emit = (value: unknown) => res.write('data: ' + JSON.stringify(value) + '\n\n')
      emit({ id: 'completion-' + calls, choices: [{ index: 0, delta: { role: 'assistant', tool_calls: [{ index: 0, id: 'call-' + calls, type: 'function', function: { name, arguments: JSON.stringify(args) } }] }, finish_reason: null }] })
      emit({ id: 'completion-' + calls, choices: [{ index: 0, delta: {}, finish_reason: 'tool_calls' }], usage: { prompt_tokens: 10, completion_tokens: 3, total_tokens: 13 } })
      res.end('data: [DONE]\n\n')
    })().catch(error => { errors.push(String(error) + ' ' + requestSummary); res.writeHead(500); res.end(String(error)) })
  })
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve))
  const address = server.address()
  if (!address || typeof address === 'string') throw Error('model gateway did not bind')
  return {
    url: `http://127.0.0.1:${address.port}/v1`,
    steps: () => step,
    beginStopScenario: () => { step = 0; stopScenario = true },
    errors,
    close: async () => { server.closeAllConnections(); await new Promise<void>(resolve => server.close(() => resolve())) },
  }
}

async function until<T>(label: string, read: () => Promise<T | undefined>): Promise<T> {
  const deadline = Date.now() + 120_000
  while (Date.now() < deadline) {
    const value = await read()
    if (value) return value
    await new Promise(resolve => setTimeout(resolve, 500))
  }
  throw Error(label + ' timed out')
}

describe.skipIf(!enabled)('standalone Web model and emulator', () => {
  it('configures a model in the browser and completes a real emulator action with evidence', async () => {
    const root = await mkdtemp(join(tmpdir(), 'opengui-web-model-'))
    const adb = process.env.OPENGUI_ADB_PATH || '/opt/homebrew/share/android-commandlinetools/platform-tools/adb'
    const hardware = new LocalAdbPhoneHost({ adbPath: adb, stateDir: root })
    const devices = await hardware.listDevices(AbortSignal.timeout(10_000))
    const resolved = await hardware.resolveDevices(devices.filter(device => device.connected && device.authorized).map(device => device.id), AbortSignal.timeout(10_000))
    const emulator = resolved.find(device => device.serial === serial)
    if (!emulator) throw Error(serial + ' must be connected and authorized')
    await exec(adb, ['-s', serial, 'shell', 'input', 'keyevent', '3'])
    const single: Hardware = {
      videoStreams: hardware.videoStreams,
      listDevices: async signal => (await hardware.listDevices(signal)).filter(device => device.id === emulator.id),
      resolveDevices: async (ids, signal) => (await hardware.resolveDevices(ids ?? [emulator.id], signal)).filter(device => device.id === emulator.id),
      assignTarget: (actor, target) => hardware.assignTarget(actor, target),
      observe: (actor, signal) => hardware.observe(actor, signal),
      act: (actor, input, signal) => hardware.act(actor, input, signal),
      releaseDevice: target => hardware.releaseDevice(target),
      dispose: () => hardware.dispose(),
    }
    const model = await gateway(emulator.id)
    const service = await startTaskService({
      root, hardware: single, executor, leaseRoot: join(root, 'leases'),
      credentials: { get: async () => 'fixture-only', set: async () => {} },
    })
    const browserSession = 'web-model-' + randomUUID()
    const browser = (...args: string[]) => exec('agent-browser', ['--session', browserSession, ...args], { timeout: 40_000 })
    try {
      const opened = await sharedPhoneTasks('codex', root).call('opengui_open_workbench', {}, 'web-model') as { url: string }
      const url = new URL(opened.url).origin + '/'
      expect((await fetch(url)).status).toBe(200)
      await browser('open', url + '#settings')
      await browser('fill', '#endpoint', model.url)
      await browser('fill', '#model', 'emulator-fixture')
      await browser('fill', '#secret', 'fixture-only')
      await browser('click', '#modelForm button')
      await browser('wait', '--text', '连接已验证')
      await browser('open', url)
      await browser('wait', '--text', emulator.name)
      await browser('fill', '#goal', '打开模拟器系统设置')
      await browser('click', '#submit')
      await browser('wait', '--fn', 'location.hash.startsWith("#task/")')
      await browser('wait', '--fn', '!!document.querySelector("#branchCards iframe[src]")')
      const openedState = await (await fetch(url + 'state')).json() as { tasks: Task[] }
      const openedParent = openedState.tasks.find(task => !task.parentId && task.goal === '打开模拟器系统设置')
      const openedBranch = openedState.tasks.find(task => task.parentId === openedParent?.id && task.viewerUrl)
      if (!openedParent || !openedBranch?.viewerUrl) throw Error('task viewer was not attached')
      await browser('open', openedBranch.viewerUrl)
      await until('visible emulator frame', async () => {
        const status = await (await fetch(openedBranch.viewerUrl + 'status')).json() as { firstDisplayEstablished: boolean; state: string; devices: unknown[] }
        if (status.state === 'error') {
          const page = await browser('snapshot')
          throw Error('viewer failed: ' + JSON.stringify(status) + '; page=' + page.stdout.slice(0, 1200))
        }
        return status.firstDisplayEstablished ? true : undefined
      })
      await browser('open', url + '#task/' + openedParent.id)
      await until('completed task', async () => {
        const state = await (await fetch(url + 'state')).json() as { tasks: Task[] }
        const parent = state.tasks.find(task => !task.parentId && task.goal === '打开模拟器系统设置')
        if (parent && ['blocked', 'failed', 'cancelled', 'unknown'].includes(parent.phase)) {
          throw Error('task stopped: ' + JSON.stringify(state.tasks.map(task => ({ phase: task.phase, summary: task.summary, error: task.error, viewer: Boolean(task.viewerUrl), evidence: task.evidence.length }))) + '; model steps=' + model.steps() + '; gateway=' + model.errors.join(' | '))
        }
        return parent?.phase === 'completed' ? parent : undefined
      })
      await browser('wait', '--text', '截图证据')
      const state = await (await fetch(url + 'state')).json() as { tasks: Task[] }
      const branch = state.tasks.find(task => task.parentId && task.goal === '打开系统设置')
      expect(branch?.phase).toBe('completed')
      expect(branch?.steps).toBeGreaterThan(0)
      expect(branch?.evidence.length).toBeGreaterThan(1)
      expect(branch?.checks[0]?.status).toBe('passed')
      expect(model.steps()).toBe(4)
      await browser('wait', '--fn', 'document.querySelectorAll("#timeline li").length>0&&!document.querySelector("#evidenceImage").hidden')
      const { stdout } = await exec(adb, ['-s', serial, 'shell', 'dumpsys', 'activity', 'activities'])
      expect(stdout).toMatch(/topResumedActivity=.*com\.android\.settings/)
      model.beginStopScenario()
      await browser('open', url)
      await browser('fill', '#goal', '保持执行直到停止')
      await browser('click', '#submit')
      await browser('wait', '--fn', 'location.hash.startsWith("#task/")')
      const stopping = await until('stop scenario viewer', async () => {
        const current = await (await fetch(url + 'state')).json() as { tasks: Task[] }
        const parent = current.tasks.find(task => !task.parentId && task.goal === '保持执行直到停止')
        const child = current.tasks.find(task => task.parentId === parent?.id && task.viewerUrl)
        return parent && child?.viewerUrl ? { parent, child } : undefined
      })
      await browser('open', stopping.child.viewerUrl!)
      await until('stop scenario first frame', async () => {
        const status = await (await fetch(stopping.child.viewerUrl + 'status')).json() as { firstDisplayEstablished: boolean }
        return status.firstDisplayEstablished ? true : undefined
      })
      await browser('open', url + '#task/' + stopping.parent.id)
      await until('stop scenario evidence', async () => {
        const current = await (await fetch(url + 'state')).json() as { tasks: Task[] }
        return current.tasks.find(task => task.id === stopping.child.id && task.evidence.length > 0)
      })
      await browser('click', '#stop')
      await until('stopped task', async () => {
        const current = await (await fetch(url + 'state')).json() as { tasks: Task[] }
        return current.tasks.find(task => task.id === stopping.parent.id && task.phase === 'cancelled')
      })
    } finally {
      await exec('agent-browser', ['--session', browserSession, 'close'], { timeout: 15_000 }).catch(() => undefined)
      await service.close()
      await model.close()
      await rm(root, { recursive: true, force: true })
    }
  }, 180_000)
})
