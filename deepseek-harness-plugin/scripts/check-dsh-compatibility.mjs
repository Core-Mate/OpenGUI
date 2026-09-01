import { execFile as execFileCallback, spawn } from 'node:child_process'
import { createServer } from 'node:net'
import { access, mkdir, mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { isAbsolute, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { promisify } from 'node:util'
import puppeteer from 'puppeteer-core'

const execFile = promisify(execFileCallback)
const root = new URL('../', import.meta.url)
const compatibility = JSON.parse(await readFile(new URL('skills/opengui-coremate-install/dsh-compatibility.json', root), 'utf8'))
const pkg = JSON.parse(await readFile(new URL('package.json', root), 'utf8'))
const dshVersion = process.env.DSH_COMPAT_VERSION?.trim()
if (!dshVersion || !compatibility.supportedVersions.includes(dshVersion)) {
  throw new Error(`DSH_COMPAT_VERSION must be one of: ${compatibility.supportedVersions.join(', ')}`)
}

async function archivePath() {
  const configured = process.env.OPENGUI_COMPAT_ARCHIVE?.trim()
  if (configured) return isAbsolute(configured) ? configured : resolve(process.cwd(), configured)
  const artifacts = new URL('.artifacts/', root)
  const names = await readdir(artifacts)
  const name = names.find(candidate => candidate === `${pkg.name}-${pkg.version}.tgz`)
  if (!name) throw new Error(`Package archive ${pkg.name}-${pkg.version}.tgz was not found in .artifacts`)
  return fileURLToPath(new URL(name, artifacts))
}

async function chromePath() {
  const candidates = [
    process.env.CHROME_PATH,
    process.env.PUPPETEER_EXECUTABLE_PATH,
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    '/usr/bin/google-chrome-stable',
    '/usr/bin/google-chrome',
    '/usr/bin/chromium',
    '/usr/bin/chromium-browser',
  ].filter(Boolean)
  for (const candidate of candidates) {
    try {
      await access(candidate)
      return candidate
    } catch {
      // Continue to the next conventional browser path.
    }
  }
  throw new Error('Chrome or Chromium was not found; set CHROME_PATH')
}

async function freePort() {
  return await new Promise((resolvePort, reject) => {
    const server = createServer()
    server.once('error', reject)
    server.listen(0, '127.0.0.1', () => {
      const address = server.address()
      const port = typeof address === 'object' && address !== null ? address.port : undefined
      server.close(error => error ? reject(error) : resolvePort(port))
    })
  })
}

async function waitForHost(origin, child, logs) {
  const deadline = Date.now() + 90_000
  while (Date.now() < deadline) {
    if (child.exitCode !== null) throw new Error(`DSH exited before startup with code ${child.exitCode}\n${logs()}`)
    try {
      const response = await fetch(origin, { signal: AbortSignal.timeout(2_000) })
      const body = await response.text()
      if (response.ok && body.includes('__DSH_BOOT__')) return
    } catch {
      // Startup can take several seconds on an uncached DSH version.
    }
    await new Promise(resolveWait => setTimeout(resolveWait, 500))
  }
  throw new Error(`Timed out waiting for DSH at ${origin}\n${logs()}`)
}

async function stop(child) {
  if (child.exitCode !== null) return
  child.kill('SIGTERM')
  const exited = await Promise.race([
    new Promise(resolveExit => child.once('exit', () => resolveExit(true))),
    new Promise(resolveTimeout => setTimeout(() => resolveTimeout(false), 5_000)),
  ])
  if (!exited && child.exitCode === null) child.kill('SIGKILL')
}

function ensureListValue(lines, key, value) {
  const keyIndex = lines.findIndex(line => line.startsWith(`${key}:`))
  if (keyIndex === -1) {
    if (lines.at(-1) !== '') lines.push('')
    lines.push(`${key}:`, `  - '${value}'`)
    return
  }
  if (lines[keyIndex].trim() !== `${key}:`) {
    if (lines[keyIndex].trim() === `${key}: []`) {
      lines.splice(keyIndex, 1, `${key}:`, `  - '${value}'`)
      return
    }
    throw new Error(`${key} must use block-list syntax`)
  }
  let end = keyIndex + 1
  while (end < lines.length && (lines[end].trim() === '' || /^\s/u.test(lines[end]))) end += 1
  const existing = lines.slice(keyIndex + 1, end)
    .map(line => line.match(/^\s*-\s*['"]?([^'"]+)['"]?\s*$/u)?.[1])
    .filter(Boolean)
  if (!existing.includes(value)) lines.splice(end, 0, `  - '${value}'`)
}

function ensureMapValue(lines, key, name, value) {
  const keyIndex = lines.findIndex(line => line.startsWith(`${key}:`))
  if (keyIndex === -1) {
    if (lines.at(-1) !== '') lines.push('')
    lines.push(`${key}:`, `  '${name}': ${value}`)
    return
  }
  if (lines[keyIndex].trim() !== `${key}:`) {
    if (lines[keyIndex].trim() === `${key}: {}`) {
      lines.splice(keyIndex, 1, `${key}:`, `  '${name}': ${value}`)
      return
    }
    throw new Error(`${key} must use block-map syntax`)
  }
  let end = keyIndex + 1
  while (end < lines.length && (lines[end].trim() === '' || /^\s/u.test(lines[end]))) end += 1
  for (let index = keyIndex + 1; index < end; index += 1) {
    const match = lines[index].match(/^\s+['"]?([^'"]+)['"]?:\s*(.+)$/u)
    if (match?.[1] !== name) continue
    if (match[2] !== String(value)) lines[index] = `  '${name}': ${value}`
    return
  }
  lines.splice(end, 0, `  '${name}': ${value}`)
}

const temporary = await mkdtemp(join(tmpdir(), `opengui-dsh-${dshVersion.replaceAll('.', '-')}-`))
const runtimeDirectory = join(temporary, 'runtime')
const dshHome = join(temporary, 'dsh-home')
const archive = await archivePath()
let host
let browser
let output = ''

try {
  await mkdir(runtimeDirectory, { recursive: true })
  await writeFile(join(runtimeDirectory, 'package.json'), '{}\n')
  await writeFile(join(runtimeDirectory, 'pnpm-workspace.yaml'), `packages: []
allowBuilds:
  node-pty: true
  koffi: true
  '@deepseek-ai/dsh-subprocess-local': true
  '@google/genai': false
  protobufjs: false
  node-addon-require-builtin: false
`)
  await execFile('pnpm', ['--dir', runtimeDirectory, 'add', '--save-exact', `@deepseek-ai/dsh@${dshVersion}`], {
    env: process.env,
    maxBuffer: 20 * 1024 * 1024,
  })
  const dsh = join(runtimeDirectory, 'node_modules', '.bin', 'dsh')
  const version = (await execFile(dsh, ['-V'], { env: process.env })).stdout.trim()
  if (version !== dshVersion) throw new Error(`Expected DSH ${dshVersion}, resolved ${version}`)

  const env = { ...process.env, DSH_HOME: dshHome }
  await execFile(dsh, ['plugin', '--profile', 'web', '--help'], { env, maxBuffer: 20 * 1024 * 1024 })
  const profileWorkspacePath = join(dshHome, 'profiles', 'web', 'pnpm-workspace.yaml')
  const profileWorkspace = (await readFile(profileWorkspacePath, 'utf8')).split('\n')
  ensureListValue(profileWorkspace, 'onlyBuiltDependencies', pkg.name)
  ensureListValue(profileWorkspace, 'onlyBuiltDependencies', '@google/genai')
  ensureListValue(profileWorkspace, 'onlyBuiltDependencies', 'protobufjs')
  ensureMapValue(profileWorkspace, 'allowBuilds', '@google/genai', false)
  ensureMapValue(profileWorkspace, 'allowBuilds', 'protobufjs', false)
  await writeFile(profileWorkspacePath, `${profileWorkspace.join('\n').replace(/\n+$/u, '')}\n`)
  await execFile(dsh, ['plugin', '--profile', 'web', 'add', '--save-exact', archive], {
    env,
    maxBuffer: 20 * 1024 * 1024,
  })

  const port = await freePort()
  const origin = `http://127.0.0.1:${port}`
  host = spawn(dsh, ['web', '--host', '127.0.0.1', '--port', String(port), '--no-open'], {
    env,
    stdio: ['ignore', 'pipe', 'pipe'],
  })
  host.stdout.on('data', chunk => { output += chunk })
  host.stderr.on('data', chunk => { output += chunk })
  const logs = () => output.slice(-12_000)
  await waitForHost(origin, host, logs)

  const runtimeResponse = await fetch(`${origin}/coremate-mobile/runtime/info`)
  if (!runtimeResponse.ok) throw new Error(`Runtime info returned HTTP ${runtimeResponse.status}`)
  const runtime = await runtimeResponse.json()
  if (!compatibility.supportedVersions.includes(runtime.dshVersion)
    || runtime.openGuiVersion !== pkg.version || runtime.dshCompatibility !== 'supported') {
    throw new Error(`Unexpected runtime info: ${JSON.stringify(runtime)}`)
  }
  if (runtime.preferredDshVersion !== compatibility.preferredVersion
    || JSON.stringify(runtime.supportedDshVersions) !== JSON.stringify(compatibility.supportedVersions)) {
    throw new Error(`Runtime compatibility matrix drifted: ${JSON.stringify(runtime)}`)
  }

  const taskResponse = await fetch(`${origin}/coremate-mobile/task/status`, {
    headers: { Origin: origin, 'Sec-Fetch-Site': 'same-origin' },
  })
  if (!taskResponse.ok) throw new Error(`Task status returned HTTP ${taskResponse.status}`)
  const task = await taskResponse.json()
  if (task.active !== false || task.phase !== 'idle') throw new Error(`Unexpected initial task state: ${JSON.stringify(task)}`)

  const pageErrors = []
  const consoleErrors = []
  browser = await puppeteer.launch({
    executablePath: await chromePath(),
    headless: true,
    args: ['--no-sandbox', '--disable-dev-shm-usage'],
  })
  const page = await browser.newPage()
  page.on('pageerror', error => pageErrors.push(error.message))
  page.on('console', message => {
    if (message.type() === 'error') consoleErrors.push(message.text())
  })
  const pluginClientResponse = page.waitForResponse(
    response => response.url().includes('/plugins/dsh-coremate-mobile/client.js'),
    { timeout: 60_000 },
  )
  const clientTaskPoll = page.waitForResponse(
    response => response.url() === `${origin}/coremate-mobile/task/status`,
    { timeout: 60_000 },
  )
  await page.goto(origin, { waitUntil: 'domcontentloaded', timeout: 60_000 })
  await page.waitForFunction(() => {
    const text = document.body.textContent ?? ''
    return text.includes('Continue') || text.includes('OpenGUI')
  }, { timeout: 15_000 }).catch(() => undefined)
  await page.evaluate(() => {
    const label = [...document.querySelectorAll('*')]
      .find(element => element.children.length === 0 && element.textContent?.trim() === 'Continue')
    const control = label?.closest('button, [role="button"]') ?? label
    if (control instanceof HTMLElement) control.click()
  })
  const [clientResponse, taskPollResponse] = await Promise.all([pluginClientResponse, clientTaskPoll])
  if (!clientResponse.ok()) throw new Error(`OpenGUI client module returned HTTP ${clientResponse.status()}`)
  if (!taskPollResponse.ok()) throw new Error(`OpenGUI client task poll returned HTTP ${taskPollResponse.status()}`)
  if (pageErrors.length > 0) throw new Error(`Browser module errors: ${pageErrors.join(' | ')}`)
  if (consoleErrors.length > 0) throw new Error(`Browser console errors: ${consoleErrors.join(' | ')}`)

  const loaded = runtime.dshVersion === dshVersion ? '' : ` (Host components ${runtime.dshVersion})`
  process.stdout.write(`DSH ${dshVersion}${loaded}: package install, Host boot, runtime API, task API, and client registration passed\n`)
} catch (error) {
  if (output) process.stderr.write(`\nDSH output:\n${output.slice(-12_000)}\n`)
  throw error
} finally {
  if (browser) await browser.close().catch(() => undefined)
  if (host) await stop(host)
  if (process.env.OPENGUI_COMPAT_KEEP_TEMP === '1') {
    process.stderr.write(`Compatibility fixture preserved at ${temporary}\n`)
  } else {
    await rm(temporary, { recursive: true, force: true })
  }
}
