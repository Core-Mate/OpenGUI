import { spawn, execFile } from 'node:child_process'
import type { Credentials, Host } from './contracts.ts'

/** Keychain passwords only travel through stdin/stdout, never process arguments or logs. */
export function keychain(host: Host): Credentials {
  const service = `org.opengui.phone-agent.${host}`
  return {
    get: ref => new Promise((resolve, reject) => {
      execFile('/usr/bin/security', ['find-generic-password', '-s', service, '-a', ref, '-w'], { maxBuffer: 16_384, timeout: 60_000 }, (error, stdout) => {
        if (error) reject(new Error('credential_unavailable: unlock your login keychain or configure the model again'))
        else resolve(stdout.replace(/\r?\n$/, ''))
      })
    }),
    set: (ref, secret) => new Promise((resolve, reject) => {
      if (!secret || secret.length > 8192 || /[\r\n\0]/.test(secret)) { reject(new Error('invalid_model_credential')); return }
      const quote = (value: string) => '"' + value.replaceAll('\\', '\\\\').replaceAll('"', '\\"') + '"'
      const child = spawn('/usr/bin/security', ['-i'], { stdio: ['pipe', 'ignore', 'pipe'], timeout: 60_000 })
      let failed = false
      child.stderr.on('data', data => { if (/SecKeychain|error|failed/i.test(String(data))) failed = true })
      child.once('error', () => reject(new Error('keychain_write_failed')))
      child.once('close', code => code === 0 && !failed ? resolve() : reject(new Error('keychain_write_failed')))
      child.stdin.on('error', () => reject(new Error('keychain_write_failed')))
      child.stdin.end(`add-generic-password -U -s ${quote(service)} -a ${quote(ref)} -w ${quote(secret)}\n`)
    }),
  }
}
