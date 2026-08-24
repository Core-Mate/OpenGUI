import { createHash } from 'node:crypto'
import type { IncomingMessage } from 'node:http'
import type { Duplex } from 'node:stream'
import type { ScrcpyStreamSink } from './scrcpy-stream.ts'

const WS_GUID = '258EAFA5-E914-47DA-95CA-C5AB0DC85B11'

function frame(opcode: number, payload: Buffer): Buffer {
  const size = payload.length
  const header = size < 126 ? Buffer.allocUnsafe(2) : size <= 0xffff ? Buffer.allocUnsafe(4) : Buffer.allocUnsafe(10)
  header[0] = 0x80 | opcode
  if (size < 126) header[1] = size
  else if (size <= 0xffff) { header[1] = 126; header.writeUInt16BE(size, 2) }
  else { header[1] = 127; header.writeBigUInt64BE(BigInt(size), 2) }
  return Buffer.concat([header, payload])
}

/** Minimal one-way WebSocket peer for the plugin's same-origin binary stream. */
export function acceptStreamWebSocket(request: IncomingMessage, socket: Duplex, head: Buffer): ScrcpyStreamSink {
  const key = request.headers['sec-websocket-key']
  if (request.method !== 'GET' || request.headers.upgrade?.toLocaleLowerCase() !== 'websocket' || typeof key !== 'string') {
    socket.end('HTTP/1.1 400 Bad Request\r\nConnection: close\r\n\r\n')
    throw new Error('invalid_websocket_upgrade')
  }
  const accept = createHash('sha1').update(`${key}${WS_GUID}`).digest('base64')
  socket.write([
    'HTTP/1.1 101 Switching Protocols',
    'Upgrade: websocket',
    'Connection: Upgrade',
    `Sec-WebSocket-Accept: ${accept}`,
    '\r\n',
  ].join('\r\n'))
  let closed = false
  let closeNotified = false
  const closeListeners = new Set<() => void>()
  let input = Buffer.alloc(0)
  const send = (opcode: number, payload: Buffer): void => {
    if (!closed && !socket.destroyed) socket.write(frame(opcode, payload))
  }
  const consume = (chunk: Buffer): void => {
    input = Buffer.concat([input, chunk])
    while (input.length >= 2) {
      const masked = (input[1]! & 0x80) !== 0
      let length = input[1]! & 0x7f
      let offset = 2
      if (length === 126) {
        if (input.length < 4) return
        length = input.readUInt16BE(2); offset = 4
      } else if (length === 127) {
        if (input.length < 10) return
        const large = input.readBigUInt64BE(2)
        if (large > 16_777_216n) { socket.destroy(); return }
        length = Number(large); offset = 10
      }
      const maskBytes = masked ? 4 : 0
      if (input.length < offset + maskBytes + length) return
      const opcode = input[0]! & 0x0f
      let payload = Buffer.from(input.subarray(offset + maskBytes, offset + maskBytes + length))
      if (masked) {
        const mask = input.subarray(offset, offset + 4)
        payload = Buffer.from(payload.map((value, index) => value ^ mask[index % 4]!))
      }
      input = input.subarray(offset + maskBytes + length)
      if (opcode === 0x8) { closed = true; socket.end(frame(0x8, payload)); return }
      if (opcode === 0x9) send(0xA, payload)
    }
  }
  socket.on('data', chunk => consume(Buffer.from(chunk)))
  const notifyClosed = (): void => {
    if (closeNotified) return
    closeNotified = true
    closed = true
    for (const listener of closeListeners) listener()
    closeListeners.clear()
  }
  socket.once('close', notifyClosed)
  socket.once('error', notifyClosed)
  if (head.length > 0) consume(head)
  return {
    sendText: text => send(0x1, Buffer.from(text, 'utf8')),
    sendBinary: data => send(0x2, data),
    bufferedBytes: () => Number((socket as Duplex & { writableLength?: number }).writableLength ?? 0),
    close(code = 1000, reason = '') {
      if (closed) return
      closed = true
      const reasonBuffer = Buffer.from(reason, 'utf8').subarray(0, 123)
      const payload = Buffer.allocUnsafe(2 + reasonBuffer.length)
      payload.writeUInt16BE(code, 0)
      reasonBuffer.copy(payload, 2)
      socket.end(frame(0x8, payload))
    },
    onClose(listener) {
      if (closed) listener()
      else closeListeners.add(listener)
    },
  }
}
