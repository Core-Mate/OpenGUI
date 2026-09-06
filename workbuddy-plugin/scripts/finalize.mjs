import { chmod, mkdir } from 'node:fs/promises'
import { execFileSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'

await chmod(new URL('../lib/mcp.js', import.meta.url), 0o755)
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
