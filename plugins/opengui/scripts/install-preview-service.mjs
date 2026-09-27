import { execFileSync, spawnSync } from 'node:child_process'
import { readFile, writeFile } from 'node:fs/promises'
import { createConnection } from 'node:net'
import { homedir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { taskServicePlist } from '../../../packages/task-service/src/launchd.ts'

const host = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const repository = resolve(host, '../..')
const branch = process.argv[2]
const label = 'org.opengui.task-service'
const root = join(homedir(), 'Library', 'Application Support', 'OpenGUI', 'task-service')
const plist = join(homedir(), 'Library', 'LaunchAgents', `${label}.plist`)
const target = `gui/${process.getuid()}`

if (!branch || branch.startsWith('-')) throw new Error('Usage: node scripts/install-preview-service.mjs <branch>')
const currentBranch = execFileSync('git', ['branch', '--show-current'], { cwd: repository, encoding: 'utf8' }).trim()
if (currentBranch !== branch) throw new Error(`Expected branch ${branch}, found ${currentBranch || '(detached)'}`)

function launchctl(...args) { return execFileSync('launchctl', args, { encoding: 'utf8' }) }
function loaded() {
  return spawnSync('launchctl', ['print', `${target}/${label}`], { stdio: 'ignore' }).status === 0
}
async function unload() {
  if (!loaded()) return
  try { launchctl('bootout', `${target}/${label}`) }
  catch (error) { if (loaded()) throw error }
  const deadline = Date.now() + 10000
  while (loaded() && Date.now() < deadline) await new Promise(resolve => setTimeout(resolve, 200))
  if (loaded()) throw new Error('Previous task service did not unload')
}

function ping() {
  return new Promise((resolve, reject) => {
    const socket = createConnection(join(root, 'service.sock'))
    let body = ''
    socket.setEncoding('utf8')
    socket.setTimeout(2000, () => socket.destroy(new Error('Task service ping timed out')))
    socket.once('error', reject)
    socket.once('connect', () => socket.write(JSON.stringify({ protocol: 2, host: 'codex', name: '__ping__', args: {}, owner: 'preview-installer' }) + '\n'))
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

const wasLoaded = loaded()
if (wasLoaded) {
  const status = await ping()
  if (status.activeTasks || status.watching) throw new Error('Finish active tasks and video sessions before replacing the service')
}

const build = spawnSync('npm', ['run', 'build'], { cwd: host, stdio: 'inherit' })
if (build.status !== 0) throw new Error('Preview build failed; the existing service was left running')

const original = await readFile(plist, 'utf8').catch(error => {
  if (error.code === 'ENOENT') return undefined
  throw error
})
const preview = taskServicePlist({
  node: process.execPath,
  entry: join(host, 'scripts', 'dev-task-service.mjs'),
  root,
  environment: {
    OPENGUI_TASK_SERVICE_DEV_ROOT: root,
    OPENGUI_TASK_SERVICE_DEV_BRANCH: branch,
    PATH: `${dirname(process.execPath)}:/usr/bin:/bin:/usr/sbin:/sbin`,
  },
})

try {
  if (wasLoaded) await unload()
  await writeFile(plist, preview, { mode: 0o644 })
  launchctl('bootstrap', target, plist)
  let ready = false
  const deadline = Date.now() + 90000
  while (Date.now() < deadline) {
    try {
      const response = await fetch('http://127.0.0.1:58894/state', { signal: AbortSignal.timeout(1500) })
      if (response.ok && loaded()) { ready = true; break }
    } catch { /* Build and startup are still in progress. */ }
    await new Promise(resolve => setTimeout(resolve, 500))
  }
  if (!ready) throw new Error('Preview service did not become ready on port 58894')
  console.log(`Preview ready at http://127.0.0.1:58894/; watching ${branch}`)
} catch (error) {
  await unload()
  if (original !== undefined) {
    await writeFile(plist, original, { mode: 0o644 })
    if (wasLoaded) launchctl('bootstrap', target, plist)
  }
  throw error
}
