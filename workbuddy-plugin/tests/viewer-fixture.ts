import { request } from 'node:http'
import type { Duplex } from 'node:stream'
import { afterEach, expect, vi } from 'vitest'
import { ViewerServer } from '../src/viewer.ts'
import type { ScrcpyStreamSink } from '../src/scrcpy-stream.ts'

export const a = { id: 'a', serial: 'private-a', name: 'Phone A' }
export const b = { id: 'b', serial: 'private-b', name: 'Phone B' }
const resources: Array<() => Promise<unknown>> = []
afterEach(async () => { for (const close of resources.splice(0).reverse()) await close() })
export function setup() {
  let time = Date.now()
  const sinks = new Map<string, ScrcpyStreamSink>()
  const release = vi.fn()
  const prepare = vi.fn(async () => {})
  const viewer = new ViewerServer({ prepare, async subscribe(device, sink) { sinks.set(device.id, sink); return release }, async dispose() {} }, () => time)
  resources.push(() => viewer.dispose())
  return { viewer, sinks, release, prepare, advance: (ms: number) => { time += ms } }
}

export async function connect(url: string, deviceId = 'a', origin = new URL(url).origin, presence = false) {
  const messages: Array<Record<string, unknown>> = []
  const socket = await new Promise<Duplex>((resolve, reject) => {
    const req = request(`${url}${presence ? "presence" : `stream?deviceId=${deviceId}`}`, { headers: { Origin: origin, Upgrade: 'websocket', Connection: 'Upgrade', 'Sec-WebSocket-Key': 'MDEyMzQ1Njc4OWFiY2RlZg==', 'Sec-WebSocket-Version': '13' } })
    req.on('upgrade', (_res, socket, head) => {
      let input = Buffer.alloc(0)
      const consume = (chunk: Buffer) => {
        input = Buffer.concat([input, chunk])
        while (input.length >= 2) {
          let length = input[1]! & 127, offset = 2
          if (length === 126) { if (input.length < 4) return; length = input.readUInt16BE(2); offset = 4 }
          if (length === 127) { if (input.length < 10) return; length = Number(input.readBigUInt64BE(2)); offset = 10 }
          if (input.length < offset + length) return
          if ((input[0]! & 15) === 1) messages.push(JSON.parse(input.subarray(offset, offset + length).toString()))
          input = input.subarray(offset + length)
        }
      }
      socket.on('data', consume); if (head.length) consume(head); resolve(socket)
    })
    req.on('response', res => { res.resume(); reject(new Error(String(res.statusCode))) })
    req.on('error', reject); req.end()
  })
  resources.push(async () => { socket.destroy() })
  if (!presence) await vi.waitFor(() => expect(messages.some(m => m.type === 'connection')).toBe(true))
  return { socket, messages, receipt: (extra: Record<string, unknown> = {}) => {
    const challenge = messages.filter(m => m.type === 'connection').at(-1)!
    return fetch(`${url}frame`, { method: 'POST', headers: { Origin: origin, 'Content-Type': 'application/json' }, body: JSON.stringify({ connectionId: challenge.connectionId, challenge: challenge.challenge, deviceId, visible: true, ...extra }) })
  } }
}
