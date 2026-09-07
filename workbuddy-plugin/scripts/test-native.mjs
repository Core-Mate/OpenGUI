import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { fileURLToPath } from 'node:url'

assert.equal(process.platform, 'darwin', 'Native acceptance requires macOS; do not report a skipped platform as passed')
const executable = process.argv[2] ?? fileURLToPath(new URL(`../lib/native/mirror-launcher-${process.arch}`, import.meta.url))
for (const ignoreTerm of [false, true]) {
  const child = spawn(executable, ['/bin/sh', '-c', `${ignoreTerm ? "trap '' TERM; " : ''}printf 'INFO: Texture: 100x200\\n'; exec /bin/sleep 30`], { stdio: ['ignore', 'pipe', 'pipe'] })
  let output = '', phonePid
  const exited = new Promise(resolve => child.once('exit', (code, signal) => resolve({ code, signal })))
  try {
    await new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('Native readiness log did not arrive while child was alive')), 3000)
      child.once('error', error => { clearTimeout(timer); reject(error) })
      child.stdout.on('data', chunk => {
        output += String(chunk)
        const match = /OPENGUI_CHILD_PID=(\d+)/.exec(output)
        if (match && output.includes('Texture:')) { phonePid = Number(match[1]); clearTimeout(timer); resolve() }
      })
      child.stderr.resume()
    })
    assert.ok(phonePid > 0)
    process.kill(phonePid, 0)
    child.kill('SIGTERM')
    let timeout
    const result = await Promise.race([exited, new Promise((_, reject) => { timeout = setTimeout(() => reject(new Error('Owned process cleanup timed out')), 4000) })]).finally(() => clearTimeout(timeout))
    assert.equal(result.code, ignoreTerm ? 137 : 143)
    assert.throws(() => process.kill(phonePid, 0), { code: 'ESRCH' })
    console.log(`PASS: native readiness and ${ignoreTerm ? 'bounded forced' : 'graceful'} cleanup; owned child absent`)
  } finally { if (child.exitCode === null && child.signalCode === null) child.kill('SIGTERM'); await exited }
}
