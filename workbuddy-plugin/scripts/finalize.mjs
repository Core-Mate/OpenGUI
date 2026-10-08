import { chmod, copyFile, mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import { execFileSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'


// Every build bundles a fixed account service: the official CoreMate service by default, or the one
// named by OPENGUI_ACCOUNT_SERVICE_URL (environment or an uncommitted .env.local), e.g. self-hosted.
const { DEFAULT_ACCOUNT_SERVICE_URL } = await import(new URL('../lib/service-config.js', import.meta.url).href)
const localEnv = await readFile(new URL('../.env.local', import.meta.url), 'utf8').catch(() => '')
const serviceUrl = (process.env.OPENGUI_ACCOUNT_SERVICE_URL?.trim() || /^OPENGUI_ACCOUNT_SERVICE_URL=(.+)$/mu.exec(localEnv)?.[1]?.trim() || DEFAULT_ACCOUNT_SERVICE_URL)
const parsed = new URL(serviceUrl)
if (parsed.protocol !== 'https:' || parsed.username || parsed.password || parsed.search || parsed.hash) throw new Error('OPENGUI_ACCOUNT_SERVICE_URL must be a plain HTTPS URL')
await writeFile(new URL('../lib/service-config.json', import.meta.url), JSON.stringify({ accountServiceUrl: parsed.toString().replace(/\/+$/u, '') }) + '\n')

await chmod(new URL('../lib/mcp.js', import.meta.url), 0o755)
await copyFile(new URL('../connector/skills/control/SKILL.md', import.meta.url), new URL('../lib/opengui-SKILL.md', import.meta.url))
await copyFile(new URL('../connector/skills/control/references.md', import.meta.url), new URL('../lib/opengui-reference.md', import.meta.url))
await copyFile(new URL('../resources/OpenGUI-安装指南.html', import.meta.url), new URL('../lib/opengui-installation.html', import.meta.url))
await copyFile(new URL('../resources/OpenGUI-授权指南.html', import.meta.url), new URL('../lib/opengui-authorization.html', import.meta.url))
for (const name of ['confirmation.js', 'confirmation.d.ts']) await rm(new URL(`../lib/${name}`, import.meta.url), { force: true })
if (process.platform === 'darwin') {
  const dir = new URL('../lib/native/', import.meta.url)
  await mkdir(dir, { recursive: true })
  for (const arch of ['arm64', 'x86_64']) {
    execFileSync('xcrun', ['clang', '-O2', '-Wall', '-Werror', '-target', `${arch}-apple-macosx12.0`,
      fileURLToPath(new URL('../native/mirror-launcher.c', import.meta.url)), '-o',
      fileURLToPath(new URL(`mirror-launcher-${arch === 'x86_64' ? 'x64' : arch}`, dir))], { stdio: 'inherit' })
    execFileSync('xcrun', ['swiftc', '-O', '-target', `${arch}-apple-macosx12.0`,
      fileURLToPath(new URL('../native/window-helper.swift', import.meta.url)), '-o',
      fileURLToPath(new URL(`window-helper-${arch === 'x86_64' ? 'x64' : arch}`, dir))], { stdio: 'inherit' })
  }
}
