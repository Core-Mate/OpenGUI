import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = fileURLToPath(new URL('..', import.meta.url))
const { version } = JSON.parse(await readFile(join(root, 'package.json'), 'utf8'))
const tag = `opengui-workbuddy-v${version}`
assert.equal(process.env.GITHUB_REF_NAME, tag, 'Only publish the exact independent WorkBuddy version tag')
execFileSync(process.execPath, [join(root, 'scripts/validate.mjs'), '--release'], { cwd: root, stdio: 'inherit' })
const assets = [`opengui-mcp-${version}.tgz`, `opengui-workbuddy-connector-${version}.zip`].flatMap(name => [name, `${name}.sha256`])
const gh = args => execFileSync('gh', args, { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] })
let exists = false
try { gh(['release', 'view', tag, '--json', 'tagName']); exists = true } catch (error) {
  if (!/release not found|HTTP 404/i.test(String(error.stderr))) throw error
}
if (exists) {
  const temporary = await mkdtemp(join(tmpdir(), 'opengui-workbuddy-release-'))
  try {
    for (const name of assets) {
      gh(['release', 'download', tag, '--pattern', name, '--dir', temporary])
      assert((await readFile(join(root, 'dist', name))).equals(await readFile(join(temporary, name))), `Published asset differs: ${name}; use a new version, never overwrite`)
    }
  } finally { await rm(temporary, { recursive: true, force: true }) }
  console.log('Existing immutable release assets match.')
} else {
  gh(['release', 'create', tag, ...assets.map(name => join(root, 'dist', name)), '--verify-tag', '--title', `OpenGUI for WorkBuddy ${version}`, '--notes-file', join(root, 'CHANGELOG.md')])
  console.log(`Published ${tag}. WorkBuddy marketplace review is a separate step.`)
}
