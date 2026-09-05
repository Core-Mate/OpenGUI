import { connect } from 'node:net'

export interface AdbEndpoint { host: string; port: number }

export function adbEndpoint(): AdbEndpoint {
  const configured = process.env.ADB_SERVER_SOCKET
  if (configured && configured !== 'tcp:127.0.0.1:5037' && configured !== 'tcp:localhost:5037') {
    throw new Error('opengui: custom ADB servers are not supported; use a dedicated test environment')
  }
  if (process.env.ANDROID_ADB_SERVER_PORT && process.env.ANDROID_ADB_SERVER_PORT !== '5037') {
    throw new Error('opengui: custom ADB server ports are not supported')
  }
  return { host: '127.0.0.1', port: 5037 }
}

/** Read the smart-socket protocol directly: never let the adb client repair a mismatch. */
export async function assertCompatibleAdbServer(signal: AbortSignal, endpoint = adbEndpoint()): Promise<void> {
  signal.throwIfAborted()
  await new Promise<void>((resolve, reject) => {
    const socket = connect(endpoint)
    let body = Buffer.alloc(0)
    const finish = (error?: Error): void => {
      signal.removeEventListener('abort', abort)
      socket.removeAllListeners()
      socket.destroy()
      error ? reject(error) : resolve()
    }
    const abort = (): void => finish(signal.reason instanceof Error ? signal.reason : new Error('cancelled'))
    socket.setTimeout(1500, () => finish(new Error('opengui: ADB preflight timed out; existing server left untouched')))
    socket.once('error', error => {
      // Starting a missing server is a separate, user-approved setup step.
      finish(new Error('opengui: no compatible ADB server is available; run doctor in a dedicated non-production environment', { cause: error }))
    })
    socket.once('connect', () => socket.write('000chost:version'))
    socket.on('data', chunk => {
      body = Buffer.concat([body, chunk])
      if (body.length > 1024) return finish(new Error('opengui: invalid ADB preflight response'))
      if (body.length < 8) return
      if (body.subarray(0, 4).toString() !== 'OKAY' || !/^[a-fA-F0-9]{4}$/.test(body.subarray(4, 8).toString())) {
        return finish(new Error('opengui: ADB protocol could not be verified; refusing to start a client'))
      }
      const length = Number.parseInt(body.subarray(4, 8).toString(), 16)
      if (length !== 4) return finish(new Error('opengui: unexpected ADB version response'))
      if (body.length < 12) return
      if (body.subarray(8, 12).toString().toLowerCase() !== '0029') {
        return finish(new Error('opengui: incompatible ADB server; automatic restart is forbidden'))
      }
      finish()
    })
    socket.once('end', () => finish(new Error('opengui: incomplete ADB version response')))
    signal.addEventListener('abort', abort, { once: true })
  })
}
