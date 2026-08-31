import { execFile } from 'node:child_process'
import { access, mkdtemp, readFile, rm, stat } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { promisify } from 'node:util'

const root = new URL('../', import.meta.url)
const json = async path => JSON.parse(await readFile(new URL(path, root), 'utf8'))
const pkg = await json('package.json')
const plugin = await json('.codex-plugin/plugin.json')
const publicPlugin = await json('codex-public/.codex-plugin/plugin.json')
const mcp = await json('.mcp.json')
const marketplace = await json('../.agents/plugins/marketplace.json')

if (pkg.version !== '0.1.7' || plugin.version !== pkg.version || publicPlugin.version !== pkg.version) {
  throw new Error('package, Codex, and public Skills-only versions must all be 0.1.7')
}
if (pkg.name !== 'dsh-coremate-mobile' || plugin.name !== 'opengui' || publicPlugin.name !== 'opengui') {
  throw new Error('internal package identity or public OpenGUI identity changed unexpectedly')
}
if (plugin.mcpServers !== './.mcp.json' || publicPlugin.mcpServers !== undefined) {
  throw new Error('local plugin must load MCP and public submission must remain Skills-only')
}
if (plugin.skills !== './skills/' || publicPlugin.skills !== './skills/') {
  throw new Error('both Codex manifests must load the shared skills directory')
}
const server = mcp.mcpServers?.['opengui-local-android']
if (server?.command !== 'node' || server.cwd !== '.' || server.args?.[0] !== './lib/codex-mcp.js') {
  throw new Error('local stdio MCP entrypoint is invalid')
}
const entry = marketplace.plugins?.find(candidate => candidate.name === 'opengui')
if (entry?.source?.source !== 'local' || entry.source.path !== './deepseek-harness-plugin') {
  throw new Error('repo marketplace must point directly at the unique plugin source directory')
}
if (entry.policy?.installation !== 'AVAILABLE' || entry.policy?.authentication !== 'ON_INSTALL') {
  throw new Error('repo marketplace policy is incomplete')
}
for (const path of [
  'lib/index.js', 'lib/client.js', 'lib/codex-mcp.js', 'lib/codex-cli.js',
  'skills/control/SKILL.md', 'docs/public-submission/review-tests.md',
]) await access(new URL(path, root))

const cli = await stat(new URL('lib/codex-cli.js', root))
if ((cli.mode & 0o111) === 0) throw new Error('lib/codex-cli.js must be executable')

const stagingRoot = await mkdtemp(join(tmpdir(), 'opengui-public-validation-'))
const staged = join(stagingRoot, 'opengui')
try {
  await promisify(execFile)(process.execPath, [fileURLToPath(new URL('scripts/stage-public-codex-plugin.mjs', root)), staged])
  const stagedPlugin = JSON.parse(await readFile(join(staged, '.codex-plugin', 'plugin.json'), 'utf8'))
  if (stagedPlugin.mcpServers !== undefined) throw new Error('public staged plugin must not include MCP servers')
  await Promise.all([
    access(join(staged, 'skills', 'control', 'SKILL.md')),
    access(join(staged, 'lib', 'codex-cli.js')),
    access(join(staged, 'assets', 'platform-tools', 'darwin', 'adb')),
    access(join(staged, 'docs', 'public-submission', 'review-tests.md')),
  ])
  if ((await stat(join(staged, 'lib', 'codex-cli.js'))).mode & 0o111 === 0) {
    throw new Error('public staged CLI must be executable')
  }
  await access(join(staged, '.mcp.json')).then(
    () => { throw new Error('public staged plugin must not contain .mcp.json') },
    () => undefined,
  )
} finally {
  await rm(stagingRoot, { recursive: true, force: true })
}

process.stdout.write('Codex plugin structure validated\n')
