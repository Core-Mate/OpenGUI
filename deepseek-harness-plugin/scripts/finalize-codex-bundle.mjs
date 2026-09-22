import { chmod, readFile, writeFile, mkdir } from 'node:fs/promises'

const cli = new URL('../lib/codex-cli.js', import.meta.url)
const source = await readFile(cli, 'utf8')
if (!source.startsWith('#!/usr/bin/env node')) {
  throw new Error('Codex CLI bundle is missing its Node shebang')
}
await chmod(cli, 0o755)

for (const [name, target] of [['index', 'index'], ['invariant', 'invariant'], ['client/index', 'client/index']]) {
  const path = new URL('../lib/types/' + name + '.d.ts', import.meta.url)
  await mkdir(new URL('.', path), { recursive: true })
  await writeFile(path, `export * from '${name.includes('/') ? '../' : './'}deepseek-harness-plugin/src/${target}.js'\n`)
}
