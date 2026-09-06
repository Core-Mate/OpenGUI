import { randomUUID } from 'node:crypto'
import { spawn } from 'node:child_process'
import { createConnection, type Socket } from 'node:net'
import { fileURLToPath } from 'node:url'
import { brokerPort, brokerToken, BROKER_PROTOCOL, VERSION, workbuddyStateDir } from './state.ts'
import { readFrames, sendFrame, type Message } from './wire.ts'

export class BrokerClient {
  /** Authenticated process identity for lifecycle diagnostics; never exposed as an MCP tool. */
  brokerPid: number | undefined
  private readonly pending = new Map<string, { resolve: (value: unknown) => void; reject: (error: Error) => void }>()
  private constructor(private readonly socket: Socket) {
    socket.on('error', () => undefined)
    socket.once('close', () => {
      for (const waiter of this.pending.values()) waiter.reject(new Error('opengui: broker disconnected; action outcome may be unknown, do not automatically retry'))
      this.pending.clear()
    })
    readFrames(socket, message => {
      const waiter = this.pending.get(String(message.id))
      if (!waiter) return
      if (typeof message.error === 'string') waiter.reject(new Error(message.error))
      else waiter.resolve(message.result)
    })
  }

  static async connect(port: number, token: string, version = VERSION): Promise<BrokerClient> {
    const socket = createConnection({ host: '127.0.0.1', port })
    socket.on('error', () => undefined)
    await new Promise<void>((resolve, reject) => {
      const timeout = setTimeout(() => { socket.destroy(); reject(new Error('opengui: broker connection timed out')) }, 1500)
      socket.once('connect', () => { clearTimeout(timeout); resolve() })
      socket.once('error', error => { clearTimeout(timeout); reject(error) })
    })
    const client = new BrokerClient(socket)
    try {
      const hello = await client.request({ method: 'hello', token, protocol: BROKER_PROTOCOL, version }, AbortSignal.timeout(2000)) as { pid?: unknown }
      if (typeof hello.pid === 'number' && Number.isSafeInteger(hello.pid) && hello.pid > 0) client.brokerPid = hello.pid
      return client
    } catch (error) { client.close(); throw error }
  }

  call(name: string, args: Record<string, unknown>, signal: AbortSignal, confirmedExternalSideEffect = false): Promise<unknown> {
    return this.request({ method: 'call', name, args, confirmedExternalSideEffect }, signal)
  }

  close(): void { this.socket.destroy() }

  private async request(message: Message, signal: AbortSignal): Promise<unknown> {
    signal.throwIfAborted()
    if (this.socket.destroyed) throw new Error('opengui: broker is disconnected; reconnect the connector')
    const id = randomUUID()
    let onAbort: () => void = () => undefined
    try {
      return await new Promise((resolve, reject) => {
        onAbort = () => {
          sendFrame(this.socket, { id: randomUUID(), method: 'cancel', requestId: id })
          reject(signal.reason instanceof Error ? signal.reason : new Error('opengui: request aborted'))
        }
        this.pending.set(id, { resolve, reject })
        signal.addEventListener('abort', onAbort, { once: true })
        sendFrame(this.socket, { ...message, id })
      })
    } finally {
      this.pending.delete(id)
      signal.removeEventListener('abort', onAbort)
    }
  }
}

/** Never replay a tool call after transport loss. Only the initial connection may start a broker. */
export async function connectWorkBuddyBroker(): Promise<BrokerClient> {
  const stateDir = workbuddyStateDir()
  const token = await brokerToken(stateDir)
  const port = brokerPort(stateDir)
  try { return await BrokerClient.connect(port, token) } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ECONNREFUSED') throw error
  }
  const child = spawn(process.execPath, [fileURLToPath(new URL('./broker-main.js', import.meta.url))], {
    detached: true,
    stdio: 'ignore',
    windowsHide: true,
    env: { ...process.env, OPENGUI_WORKBUDDY_HOME: stateDir },
  })
  let spawnError: Error | undefined
  child.once('error', error => { spawnError = error })
  child.unref()
  for (let attempt = 0; attempt < 100; attempt++) {
    if (spawnError) throw spawnError
    await new Promise(resolve => setTimeout(resolve, 50))
    try { return await BrokerClient.connect(port, token) } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ECONNREFUSED') throw error
    }
  }
  throw new Error('opengui: WorkBuddy broker did not start; check the package and local port availability')
}
