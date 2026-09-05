import { cp, mkdir, realpath, stat } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
export const STAGED_PATHS = [
  '.codex-plugin', 'skills', 'scripts/opengui', 'assets', 'lib/cli.js',
  'LICENSE', 'SOURCE.md', 'README.md', 'README.zh-CN.md', 'docs',
]

/** Build an allowlisted upload tree, never a tarball of the development checkout. */
export async function stagePlugin(destination) {
  const target = resolve(destination)
  if (await stat(target).catch(() => undefined)) throw new Error('Destination already exists; choose a fresh staging directory')
  if (target === root || root.startsWith(target + '/')) throw new Error('Unsafe staging destination')
  for (const relative of STAGED_PATHS) {
    const source = resolve(root, relative)
    if (!(await realpath(source)).startsWith(root + '/')) throw new Error('Staged content must belong to the standalone package')
    await stat(source)
  }
  await mkdir(target, { recursive: true })
  for (const relative of STAGED_PATHS) {
    const targetPath = resolve(target, relative)
    await mkdir(dirname(targetPath), { recursive: true })
    await cp(resolve(root, relative), targetPath, { recursive: true, force: false, errorOnExist: true })
  }
  return target
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  if (!process.argv[2]) throw new Error('Usage: node scripts/stage.mjs <new-destination>/opengui')
  console.log(await stagePlugin(process.argv[2]))
}
