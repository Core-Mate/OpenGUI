import assert from 'node:assert/strict'
import { test } from 'node:test'
import { mkdtemp, mkdir, rm, writeFile, symlink, realpath } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join, relative } from 'node:path'
import { fileURLToPath } from 'node:url'
import { validateSourceBoundary } from './build.mjs'

test('permits only the adapter and the designated shared source tree', async () => {
  const root = await realpath(await mkdtemp(join(tmpdir(), 'opengui-boundary-')))
  try {
    const host = join(root, 'adapter'), src = join(host, 'src')
    await mkdir(src, { recursive: true })
    const shared = join(dirname(fileURLToPath(import.meta.url)), 'src/contracts.ts')
    const specifier = relative(src, shared).replaceAll('\\', '/')
    await writeFile(join(src, 'entry.ts'), `export * from '${specifier}'\n`)
    await validateSourceBoundary(host)
    await writeFile(join(root, 'foreign.ts'), 'export const unrelated = true\n')
    await writeFile(join(src, 'entry.ts'), "export * from '../../foreign.ts'\n")
    await assert.rejects(validateSourceBoundary(host), /escapes allowed source/)
  } finally { await rm(root, { recursive: true, force: true }) }
})

test('rejects a symlink that disguises an unrelated file as host source', { skip: process.platform === 'win32' }, async () => {
  const root = await mkdtemp(join(tmpdir(), 'opengui-link-boundary-'))
  try {
    await mkdir(join(root, 'src'))
    await writeFile(join(root, 'foreign.ts'), 'export const unrelated = true\n')
    await symlink(join(root, 'foreign.ts'), join(root, 'src/escape.ts'))
    await assert.rejects(validateSourceBoundary(root), /Symlink/)
  } finally { await rm(root, { recursive: true, force: true }) }
})
