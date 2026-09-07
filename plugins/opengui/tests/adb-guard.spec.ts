import { afterEach, describe, expect, it } from 'vitest'
import { createServer } from 'node:net'
import type { Socket } from 'node:net'
import { assertCompatibleAdbServer } from '../src/adb-guard.ts'

const cleanup: (() => Promise<void>)[] = []
afterEach(async () => { for (const close of cleanup.splice(0)) await close() })
async function fixture(response: string, fragment = false) {
  const requests: string[] = [], sockets = new Set<Socket>()
  const server = createServer(socket => {
    sockets.add(socket); socket.once('close', () => sockets.delete(socket))
    socket.once('data', data => {
      requests.push(data.toString())
      if (fragment) { socket.write(response.slice(0, 6)); setImmediate(() => socket.end(response.slice(6))) }
      else socket.end(response)
    })
    socket.on('error', () => {})
  })
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve))
  cleanup.push(() => new Promise<void>(resolve => { for (const socket of sockets) socket.destroy(); server.close(() => resolve()) }))
  const address = server.address()
  if (!address || typeof address === 'string') throw new Error('no fixture port')
  return { endpoint: { host: '127.0.0.1', port: address.port }, requests }
}
describe('non-mutating ADB preflight', () => {
  it('accepts a fragmented compatible smart-socket response', async () => {
    const server = await fixture('OKAY00040029', true)
    await assertCompatibleAdbServer(new AbortController().signal, server.endpoint)
    expect(server.requests).toEqual(['000chost:version'])
  })
  it.each(['OKAY00040028', 'FAIL0004oops', 'OKAY0003abc', 'garbage', 'OKAY0004'])('rejects %s without a repair command', async response => {
    const server = await fixture(response)
    await expect(assertCompatibleAdbServer(new AbortController().signal, server.endpoint)).rejects.toThrow('opengui:')
    expect(server.requests).toEqual(['000chost:version'])
  })
  it('honors cancellation before connecting', async () => {
    const server = await fixture('OKAY00040029')
    await expect(assertCompatibleAdbServer(AbortSignal.abort(new Error('stop')), server.endpoint)).rejects.toThrow('stop')
    expect(server.requests).toEqual([])
  })
})
