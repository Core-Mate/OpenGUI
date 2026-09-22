import { chmod, mkdir } from 'node:fs/promises'
import { createServer } from 'node:net'
import { join } from 'node:path'
import { TaskHost, isTaskTool } from '../../packages/phone-agent/src/host.ts'
import { PhoneRuntime } from '../../packages/phone-agent/src/runtime.ts'
import { keychain } from '../../packages/phone-agent/src/credentials.ts'
import { LocalAdbPhoneHost } from './codex/service.ts'
import { HostExecutor } from '../../packages/phone-agent/src/host-executor.ts'
import { phoneRoot, phoneEndpoint, PHONE_PROTOCOL } from './phone-background.ts'

// Restrict the Unix socket from the instant it is created.
process.umask(0o077)
const root = phoneRoot()
await mkdir(root, { recursive: true, mode: 0o700 })
const tasks = new TaskHost(() => new PhoneRuntime({ root: join(root, 'phone-agent'), host: 'dsh', hardware: new LocalAdbPhoneHost({ stateDir: root }), credentials: keychain('dsh'), executor: new HostExecutor() }))
const server = createServer(socket => {
  let body = '', received = false
  socket.on('error', () => {}); socket.setEncoding('utf8'); socket.setTimeout(125_000, () => socket.destroy())
  socket.on('data', chunk => {
    if (received) return
    body += chunk
    if (body.length > 65536) { socket.destroy(); return }
    if (!body.includes('\n')) return
    received = true
    void (async () => {
      const request = JSON.parse(body) as { protocol: number; name: string; args: Record<string, unknown>; owner: string }
      if (request.protocol !== PHONE_PROTOCOL) throw new Error('Phone worker version mismatch; stop tasks before upgrading')
      if (request.name === '__ping__') { socket.end(JSON.stringify({ result: { activeTasks: tasks.activeCount, protocol: PHONE_PROTOCOL } }) + '\n'); return }
      if (request.name === '__shutdown__') {
        if (tasks.activeCount || tasks.watching) throw new Error('Active phone tasks or workbench')
        socket.end(JSON.stringify({ result: { stopping: true } }) + '\n')
        setImmediate(() => { void tasks.close().finally(() => server.close()) })
        return
      }
      if (typeof request.owner !== 'string' || !request.owner.trim()) throw new Error('Invalid phone task owner')
      if (request.name === '__interrupt_owner__') {
        await tasks.interruptOwner(request.owner)
        socket.end(JSON.stringify({ result: { stopProcessed: true } }) + '\n')
        return
      }
      if (!isTaskTool(request.name)) throw new Error('Invalid phone task request')
      const result = await tasks.call(request.name, request.args, request.owner)
      socket.end(JSON.stringify({ result }) + '\n')
    })().catch(() => socket.end(JSON.stringify({ error: 'Phone task request failed; open the workbench to inspect task and model state' }) + '\n'))
  })
})
server.listen(phoneEndpoint(), () => { void chmod(phoneEndpoint(), 0o600) })
for (const signal of ['SIGINT', 'SIGTERM'] as const) process.on(signal, () => { void tasks.close().finally(() => { server.close(); process.exit(0) }) })
