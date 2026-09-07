import { chmod, readFile } from 'node:fs/promises'

const cli = new URL('../lib/codex-cli.js', import.meta.url)
const source = await readFile(cli, 'utf8')
if (!source.startsWith('#!/usr/bin/env node')) {
  throw new Error('Codex CLI bundle is missing its Node shebang')
}
await chmod(cli, 0o755)
