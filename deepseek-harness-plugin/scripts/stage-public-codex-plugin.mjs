import { chmod, cp, mkdir, stat } from 'node:fs/promises'
import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'

const destination = process.argv.slice(2).find(argument => argument !== '--')
if (!destination) throw new Error('Usage: pnpm codex:stage-public -- /absolute/empty/output-directory')
const output = resolve(destination)
const existing = await stat(output).catch(() => undefined)
if (existing !== undefined) throw new Error('Public staging destination must not already exist')

const root = new URL('../', import.meta.url)
const target = pathToFileURL(`${output}/`)
await mkdir(new URL('.codex-plugin/', target), { recursive: true, mode: 0o755 })
await mkdir(new URL('docs/', target), { recursive: true, mode: 0o755 })
await mkdir(new URL('lib/', target), { recursive: true, mode: 0o755 })
await mkdir(new URL('skills/', target), { recursive: true, mode: 0o755 })
await cp(new URL('codex-public/.codex-plugin/plugin.json', root), new URL('.codex-plugin/plugin.json', target))
await cp(new URL('assets/', root), new URL('assets/', target), { recursive: true })
await cp(new URL('docs/public-submission/', root), new URL('docs/public-submission/', target), { recursive: true })
await cp(new URL('lib/codex-cli.js', root), new URL('lib/codex-cli.js', target))
await cp(new URL('skills/control/', root), new URL('skills/control/', target), { recursive: true })
await chmod(new URL('lib/codex-cli.js', target), 0o755)
process.stdout.write(`${output}\n`)
