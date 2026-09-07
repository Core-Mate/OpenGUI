import type { Socket } from 'node:net'

export type Message = Record<string, unknown>
export const MAX_FRAME_BYTES = 2 * 1024 * 1024

/** Private broker framing, bounded independently of the public MCP transport. */
export function readFrames(socket: Socket, onMessage: (value: Message) => void): void {
  let buffer = ''
  socket.setEncoding('utf8')
  socket.on('data', (chunk: string) => {
    buffer += chunk
    while (true) {
      const end = buffer.indexOf('\n')
      if (end < 0) break
      const line = buffer.slice(0, end)
      buffer = buffer.slice(end + 1)
      if (Buffer.byteLength(line) > MAX_FRAME_BYTES) { socket.destroy(); return }
      try {
        const value: unknown = JSON.parse(line)
        if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Invalid frame')
        onMessage(value as Message)
      } catch { socket.destroy(); return }
    }
    if (Buffer.byteLength(buffer) > MAX_FRAME_BYTES) socket.destroy()
  })
}

export function sendFrame(socket: Socket, value: unknown): void {
  if (!socket.destroyed) socket.write(`${JSON.stringify(value)}\n`)
}
