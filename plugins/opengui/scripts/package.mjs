import { createHash } from 'node:crypto'
import { mkdtemp, mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { execFileSync } from 'node:child_process'
import { stagePlugin } from './stage.mjs'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const pkg = JSON.parse(await readFile(join(root, 'package.json'), 'utf8'))
const output = resolve(process.argv[2] || join(root, '.artifacts'))
await mkdir(output, { recursive: true })
const temp = await mkdtemp(join(output, '.package-'))
try {
  await stagePlugin(join(temp, 'opengui'))
  const archive = join(output, 'opengui-codex-' + pkg.version + '.tar.gz')
  const upload = join(output, 'opengui-codex-' + pkg.version + '.zip')
  // No npm lifecycle hooks, no DSH build, and no implicit publisher credentials.
  // Build fresh archives: updating an existing ZIP retains removed entries.
  execFileSync('tar', ['-czf', join(temp, 'package.tar.gz'), '-C', temp, 'opengui'], { stdio: 'inherit' })
  execFileSync('zip', ['-q', '-r', join(temp, 'package.zip'), 'opengui'], { cwd: temp, stdio: 'inherit' })
  await rename(join(temp, 'package.tar.gz'), archive)
  await rename(join(temp, 'package.zip'), upload)
  for (const path of [archive, upload]) {
    const checksum = createHash('sha256').update(await readFile(path)).digest('hex')
    await writeFile(path + '.sha256', checksum + '  ' + path.slice(path.lastIndexOf('/') + 1) + '\n')
    console.log(path)
  }
} finally {
  await rm(temp, { recursive: true, force: true })
}
