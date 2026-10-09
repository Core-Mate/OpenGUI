import assert from 'node:assert/strict'
import { execFileSync, spawn } from 'node:child_process'
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { isAbsolute, join } from 'node:path'
import { createInterface } from 'node:readline'
import { fileURLToPath } from 'node:url'
import { OPENGUI_WORKBUDDY_TOOLS } from '../lib/tools.js'

assert.equal(process.platform, 'darwin', 'Native host verification requires macOS; a skipped platform is not a pass')
assert(process.argv.length <= 3, 'Usage: node scripts/test-workbuddy-host.mjs [/absolute/WorkBuddy.app]')
const app = process.argv[2] ?? '/Applications/WorkBuddy.app'
assert(isAbsolute(app), 'The WorkBuddy bundle path must be absolute')
const plist = join(app, 'Contents/Info.plist')
const bundle = execFileSync('/usr/libexec/PlistBuddy', ['-c', 'Print :CFBundleIdentifier', plist], { encoding: 'utf8' }).trim()
assert.match(bundle, /^(?:com\.tencent\.workbuddy\..+|com\.workbuddy\.workbuddy(?:-ai)?)$/u, 'Use an actual WorkBuddy bundle')
const version = execFileSync('/usr/libexec/PlistBuddy', ['-c', 'Print :CFBundleShortVersionString', plist], { encoding: 'utf8' }).trim()
const cli = join(app, 'Contents/Resources/app.asar.unpacked/cli/bin/codebuddy')
const entry = fileURLToPath(new URL('../lib/mcp.js', import.meta.url))
const root = await mkdtemp(join(tmpdir(), 'opengui-native-host-'))
const host = join(root, 'host'), workspace = join(root, 'workspace')
const proxy = join(root, 'directory-proxy.mjs'), proofPath = join(root, 'directory.json'), config = join(root, 'mcp.json')
let child, ended
const pending = new Map()

try {
  await mkdir(host, { mode: 0o700 }); await mkdir(workspace, { mode: 0o700 })
  // Capture only tool-directory metadata. Refuse all tool execution before it can
  // reach OpenGUI, even if a future host starts issuing calls during session setup.
  await writeFile(proxy, `
import { spawn } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import { createInterface } from 'node:readline';
const child = spawn(process.execPath, [${JSON.stringify(entry)}], { stdio: ['pipe', 'pipe', 'pipe'], env: { ...process.env, OPENGUI_WORKBUDDY_HOME: ${JSON.stringify(join(root, 'phone-state'))} } });
const requests = new Map(); let proof = { deniedToolCalls: 0 };
const save = () => writeFileSync(${JSON.stringify(proofPath)}, JSON.stringify(proof), { mode: 0o600 });
const input = createInterface({ input: process.stdin });
input.on('line', line => {
  const message = JSON.parse(line);
  if (message.method === 'tools/call') {
    proof.deniedToolCalls++; save();
    process.stdout.write(JSON.stringify({ jsonrpc: '2.0', id: message.id, error: { code: -32601, message: 'Directory verification forbids tool execution' } }) + '\\n'); return;
  }
  requests.set(message.id, message.method); child.stdin.write(line + '\\n');
});
input.on('close', () => child.stdin.end());
createInterface({ input: child.stdout }).on('line', line => {
  const message = JSON.parse(line);
  if (requests.get(message.id) === 'tools/list' && message.result?.tools) {
    proof.tools = message.result.tools.map(tool => ({ name: tool.name, hasInputSchema: !!tool.inputSchema })); save();
  }
  process.stdout.write(line + '\\n');
});
child.stderr.resume(); child.on('error', () => process.exit(1));
child.on('exit', code => process.exit(code ?? 0));
process.on('SIGTERM', () => child.kill('SIGTERM'));
`, { mode: 0o600 })
  await writeFile(config, JSON.stringify({ mcpServers: { opengui: { type: 'stdio', command: process.execPath, args: [proxy], disabled: false } } }), { mode: 0o600 })
  child = spawn(process.execPath, [cli, '--acp', '--strict-mcp-config', '--mcp-config', config, '--setting-sources', 'user', '--no-session-persistence', '--tools', ''], {
    cwd: workspace, detached: true, stdio: ['pipe', 'pipe', 'pipe'],
    env: { ...process.env, CODEBUDDY_CONFIG_DIR: host, WORKBUDDY_CONFIG_DIR: host, CODEBUDDY_FORCE_LITE_WB_BUNDLE: '0', CODEBUDDY_FORCE_HEADLESS_BUNDLE: '1', CODEBUDDY_DISABLE_COMPILE_CACHE: '1' },
  })
  const rejectPending = message => {
    for (const request of pending.values()) { clearTimeout(request.timer); request.reject(new Error(message)) }
    pending.clear()
  }
  ended = new Promise(resolve => child.once('exit', () => { rejectPending('Native WorkBuddy CLI exited before responding'); resolve() }))
  child.once('error', () => rejectPending('Native WorkBuddy CLI failed to start'))
  child.stderr.resume()
  const lines = createInterface({ input: child.stdout })
  lines.on('line', line => {
    let message
    try { message = JSON.parse(line) } catch { return }
    const request = pending.get(message.id)
    if (request) {
      clearTimeout(request.timer); pending.delete(message.id)
      if (message.error) request.reject(new Error(`ACP ${request.method} failed (${message.error.code})`))
      else request.resolve(message.result)
    } else if (message.id !== undefined && message.method) {
      // No file, terminal, permission or other client capabilities are exposed.
      child.stdin.write(JSON.stringify({ jsonrpc: '2.0', id: message.id, error: { code: -32601, message: 'Directory verification exposes no client tools' } }) + '\n')
    }
  })
  let sequence = 0
  const request = (method, params) => new Promise((resolve, reject) => {
    const id = ++sequence
    const timer = setTimeout(() => { pending.delete(id); reject(new Error(`ACP timeout: ${method}`)) }, 55_000)
    pending.set(id, { method, resolve, reject, timer })
    child.stdin.write(JSON.stringify({ jsonrpc: '2.0', id, method, params }) + '\n')
  })
  console.log(`Checking bundled WorkBuddy ${version} headless ACP with isolated configuration; directory requests only.`)
  const initialized = await request('initialize', { protocolVersion: 1, clientCapabilities: {}, clientInfo: { name: 'opengui-directory-verification', version: '1' } })
  assert.equal(initialized.protocolVersion, 1)
  const session = await request('session/new', { cwd: workspace, mcpServers: [] })
  assert.equal(typeof session.sessionId, 'string')
  let proof
  for (let attempt = 0; attempt < 100; attempt++) {
    try { proof = JSON.parse(await readFile(proofPath, 'utf8')); if (proof.tools?.length) break } catch {}
    await new Promise(resolve => setTimeout(resolve, 100))
  }
  assert(proof?.tools?.length, 'The native host did not list OpenGUI tools')
  assert.equal(proof.deniedToolCalls, 0, 'Host setup unexpectedly attempted tool execution; every attempt was refused')
  assert.deepEqual(proof.tools.map(tool => tool.name).sort(), OPENGUI_WORKBUDDY_TOOLS.map(tool => tool.name).sort())
  assert(proof.tools.every(tool => tool.hasInputSchema), 'The host must receive each tool input schema')
  console.log(JSON.stringify({ result: 'PASS', workbuddyVersion: version, bundledHeadlessEngine: true, protocolVersion: initialized.protocolVersion, imageContentDeclared: initialized.agentCapabilities?.promptCapabilities?.image === true, toolCount: proof.tools.length, toolCalls: 0, modelPrompts: 0, desktopWindowVerified: false }))
} finally {
  for (const request of pending.values()) clearTimeout(request.timer)
  pending.clear()
  if (child?.pid) {
    try { process.kill(-child.pid, 'SIGTERM') } catch (error) { if (error.code !== 'ESRCH') throw error }
    let timeout
    try { await Promise.race([ended, new Promise(resolve => { timeout = setTimeout(resolve, 3000) })]) } finally { clearTimeout(timeout) }
    try { process.kill(-child.pid, 'SIGKILL') } catch (error) { if (error.code !== 'ESRCH') throw error }
    await ended
  }
  await rm(root, { recursive: true, force: true })
}
