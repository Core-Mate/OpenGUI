import { spawn } from 'node:child_process'
import { watch } from 'node:fs'
import { lstat, mkdir } from 'node:fs/promises'
import { createConnection } from 'node:net'
import { dirname, isAbsolute, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const host = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const repository = resolve(host, '../..')
const root = process.env.OPENGUI_TASK_SERVICE_DEV_ROOT || join('/tmp', `opengui-task-dev-${process.getuid()}`)
const entry = join(host, 'lib/task-service.js')
const socketPath = join(root, 'service.sock')
const sources = [
  join(host, 'src'),
  join(repository, 'packages/device-runtime/src'),
  join(repository, 'packages/phone-agent/src'),
  join(repository, 'packages/task-service/src'),
  join(repository, 'packages/workbench/src'),
]

if (!isAbsolute(root) || Buffer.byteLength(socketPath) > 103) {
  throw new Error('Choose an absolute, short OPENGUI_TASK_SERVICE_DEV_ROOT for the macOS socket')
}
await mkdir(root, { recursive: true, mode: 0o700 })
const info = await lstat(root)
if (!info.isDirectory() || info.isSymbolicLink() || info.uid !== process.getuid() || (info.mode & 0o077) !== 0) {
  throw new Error('Development service root must be a private directory owned by this user')
}

let service
let stopped = false
let building = false
let pending = false
let timer
let currentBuild
const watchers = []

async function request(name) {
  return new Promise((resolve, reject) => {
    const socket = createConnection(socketPath)
    let body = ''
    socket.setEncoding('utf8')
    socket.setTimeout(2000, () => socket.destroy(new Error('service request timed out')))
    socket.once('error', reject)
    socket.once('connect', () => socket.write(JSON.stringify({
      protocol: 2, host: 'codex', name, args: {}, owner: 'dev-workbench',
    }) + '\n'))
    socket.on('data', chunk => {
      body += chunk
      if (!body.includes('\n')) return
      socket.destroy()
      try {
        const response = JSON.parse(body)
        if (response.error) reject(new Error(response.error))
        else resolve(response.result)
      } catch (error) { reject(error) }
    })
  })
}

function runBuild() {
  currentBuild = new Promise(resolve => {
    const child = spawn('npm', ['run', 'build'], { cwd: host, stdio: 'inherit' })
    child.once('error', error => { console.error(error); resolve(false) })
    child.once('exit', code => resolve(code === 0))
  })
  return currentBuild.finally(() => { currentBuild = undefined })
}

async function stopService() {
  if (!service || service.exitCode !== null || service.signalCode !== null) return
  const child = service
  const exited = new Promise(resolve => child.once('exit', resolve))
  child.kill('SIGTERM')
  const timeout = setTimeout(() => { if (child.exitCode === null) child.kill('SIGKILL') }, 5000)
  await exited
  clearTimeout(timeout)
  if (service === child) service = undefined
}

async function startService() {
  service = spawn(process.execPath, [entry], {
    cwd: host, stdio: 'inherit',
    env: { ...process.env, OPENGUI_TASK_SERVICE_ROOT: root, OPENGUI_TASK_SERVICE_AUTOSTART: '0' },
  })
  service.once('error', error => console.error('Task service failed:', error))
  const deadline = Date.now() + 15000
  let url
  while (!stopped && Date.now() < deadline) {
    try {
      const opened = await request('opengui_open_workbench')
      url = new URL(opened.url).origin + '/'
      break
    } catch {
      if (service.exitCode !== null) break
      await new Promise(resolve => setTimeout(resolve, 200))
    }
  }
  if (!url) throw new Error('Task service did not become ready')
  console.log(`\nOpenGUI development workbench: ${url}`)
  console.log(`Development state: ${root}`)
  console.log('Source changes rebuild and restart this foreground service; press Ctrl-C to stop. Active development tasks may be interrupted.\n')
}

async function rebuild() {
  if (building || stopped) return
  building = true
  while (pending && !stopped) {
    pending = false
    if (!await runBuild()) {
      console.error('Build failed; the previous development service is still running.')
      continue
    }
    await stopService()
    if (!stopped) await startService()
  }
  building = false
}

async function shutdown(exitCode = 0) {
  if (stopped) return
  stopped = true
  clearTimeout(timer)
  for (const watcher of watchers) watcher.close()
  if (currentBuild) await currentBuild
  await stopService()
  process.exit(exitCode)
}
process.once('SIGINT', () => { void shutdown() })
process.once('SIGTERM', () => { void shutdown() })

try {
  if (await request('__ping__').then(() => true, () => false)) {
    throw new Error(`A development task service is already using ${root}`)
  }
  if (!await runBuild()) throw new Error('Initial build failed')
  await startService()
  for (const source of sources) watchers.push(watch(source, { recursive: true }, () => {
    if (stopped) return
    clearTimeout(timer)
    timer = setTimeout(() => { pending = true; void rebuild().catch(error => console.error(error)) }, 300)
  }))
} catch (error) {
  console.error(error)
  await shutdown(1)
}
