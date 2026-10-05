import { spawn } from 'node:child_process'
import { createServer, type Socket } from 'node:net'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { ScrcpyTextInput, type ScrcpyInstaller, SCRCPY_ASSETS, parseScrcpyDeviceMessages } from '../src/scrcpy.ts'
import { OwnedForwardRegistry } from '../src/forward-registry.ts'

const cleanup: Array<() => Promise<void>> = []
afterEach(async () => { for (const close of cleanup.splice(0).reverse()) await close() })
function clipboardMessage(text: string): Buffer {
  const body = Buffer.from(text, 'utf8'), wire = Buffer.alloc(5 + body.length)
  wire.writeUInt32BE(body.length, 1); body.copy(wire, 5); return wire
}
async function fixture() {
  const directory = await mkdtemp(join(tmpdir(), 'opengui-copy-'))
  cleanup.push(() => rm(directory, { recursive: true, force: true }))
  const sockets = new Set<Socket>(), events: Array<{ type: number; copy?: number; paste?: boolean; text?: string }> = []
  const state = { clipboard: 'unrelated private clipboard' as string | null, field: '中文 😀\nSecond line', selected: false, copyEnabled: true, interfere: false, onCopy: undefined as (() => void) | undefined }
  const server = createServer(socket => {
    socket.on('error', error => { if ((error as NodeJS.ErrnoException).code !== 'ECONNRESET') throw error })
    sockets.add(socket); socket.once('close', () => sockets.delete(socket)); socket.write(Buffer.from([0]))
    let pending = Buffer.alloc(0)
    const send = (wire: Buffer) => { socket.write(wire.subarray(0, 2)); socket.write(wire.subarray(2)) }
    socket.on('data', chunk => {
      pending = Buffer.concat([pending, chunk])
      while (pending.length) {
        const type = pending[0], size = type === 0 ? 14 : type === 8 ? 2 : pending.length < 14 ? Infinity : 14 + pending.readUInt32BE(10)
        if (pending.length < size) return
        const message = pending.subarray(0, size); pending = pending.subarray(size)
        if (type === 0) {
          if (message[1] === 1) state.selected = message.readUInt32BE(2) === 29
        } else if (type === 8) {
          const copy = message[1]!
          events.push({ type, copy })
          if (copy === 1) {
            state.onCopy?.()
            if (state.copyEnabled && state.selected) state.clipboard = state.field
          } else if (state.interfere && events.some(event => event.copy === 1)) state.clipboard = 'new clipboard from another source'
          // Like scrcpy, an empty clipboard gets no reply at all.
          if (state.clipboard !== null) send(clipboardMessage(state.clipboard))
        } else if (type === 9) {
          const text = message.subarray(14).toString('utf8'), paste = Boolean(message[9])
          state.clipboard = text; events.push({ type, text, paste })
          if (paste) { state.field = state.selected ? text : state.field + text; state.selected = false }
          const ack = Buffer.alloc(9); ack[0] = 1; message.copy(ack, 1, 1, 9); send(ack)
        } else throw new Error('Unexpected fixture protocol')
      }
    })
  })
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve))
  const address = server.address(); if (!address || typeof address === 'string') throw new Error('Missing fixture port')
  cleanup.push(async () => { for (const socket of sockets) socket.destroy(); await new Promise<void>(resolve => server.close(() => resolve())) })
  const runAdb = vi.fn(async () => '')
  const input = new ScrcpyTextInput({
    adbPath: () => 'fixture-adb', runAdb,
    installer: { ensure: async () => ({ root: directory, executable: 'fixture-scrcpy', server: 'fixture-server.jar' }) } as unknown as ScrcpyInstaller,
    asset: SCRCPY_ASSETS['darwin-arm64']!, freePort: async () => address.port,
    spawn: (() => spawn(process.execPath, ['-e', 'setInterval(() => {}, 1000)'], { stdio: ['ignore', 'ignore', 'pipe'] })) as typeof spawn,
    forwardRegistry: new OwnedForwardRegistry(join(directory, 'forwards.json')),
  })
  cleanup.push(() => input.dispose())
  return { input, state, events, runAdb }
}

describe('focused comment clipboard transport', () => {
  it('reads the copied Unicode field and restores the original clipboard without pasting', async () => {
    const f = await fixture(), original = f.state.clipboard
    const result = await f.input.readFocusedText('fixture-phone', AbortSignal.timeout(5000))
    expect(result).toBe('中文 😀\nSecond line'); expect(result).not.toBe(original)
    expect(f.state.clipboard).toBe(original); expect(f.state.field).toBe(result); expect(f.state.selected).toBe(false)
    expect(f.events.filter(event => event.type === 9).every(event => !event.paste)).toBe(true)
    expect(f.events.filter(event => event.type === 8 && event.copy === 1)).toHaveLength(1)
    expect(f.events.some(event => event.copy === 2)).toBe(false)
  })

  it('returns unreadable when copy leaves the marker intact instead of returning stale clipboard contents', async () => {
    const f = await fixture(), original = f.state.clipboard; f.state.copyEnabled = false
    expect(await f.input.readFocusedText('fixture-phone', AbortSignal.timeout(5000))).toBeUndefined()
    expect(f.state.clipboard).toBe(original); expect(f.state.field).toBe('中文 😀\nSecond line'); expect(f.state.selected).toBe(false)
  })

  it('reports an empty field only when the active selection proves it, while the selection is held', async () => {
    const f = await fixture(), original = f.state.clipboard; f.state.copyEnabled = false
    let selectedDuringProof = false
    expect(await f.input.readFocusedText('fixture-phone', AbortSignal.timeout(5000), async () => { selectedDuringProof = f.state.selected; return true })).toBe('')
    expect(selectedDuringProof).toBe(true)
    expect(f.state.clipboard).toBe(original); expect(f.state.selected).toBe(false)
    expect(await f.input.readFocusedText('fixture-phone', AbortSignal.timeout(5000), async () => false)).toBeUndefined()
    f.state.copyEnabled = true
    const proof = vi.fn(async () => true)
    expect(await f.input.readFocusedText('fixture-phone', AbortSignal.timeout(5000), proof)).toBe('中文 😀\nSecond line')
    expect(proof).not.toHaveBeenCalled()
  })

  it('reads an empty field when the phone clipboard is empty and leaves it empty, without waiting for a reply that never comes', async () => {
    const f = await fixture(); f.state.clipboard = null; f.state.field = ''
    const started = Date.now()
    expect(await f.input.readFocusedText('fixture-phone', AbortSignal.timeout(8000), async () => true)).toBe('')
    expect(Date.now() - started).toBeLessThan(4500)
    expect(f.state.clipboard).toBe('')
  })

  it('does not overwrite a newer clipboard and does not disclose original clipboard values in errors', async () => {
    const f = await fixture(); f.state.interfere = true
    await expect(f.input.readFocusedText('fixture-phone', AbortSignal.timeout(5000))).rejects.toMatchObject({ code: 'comment_input_unreadable', executionState: 'outcome_unknown' })
    expect(f.state.clipboard).toBe('new clipboard from another source')
    expect(f.events.filter(event => event.type === 9)).toHaveLength(1)
  })

  it('rejects a field beyond its bound, restores the clipboard and emits no private text in the error', async () => {
    const f = await fixture(), original = f.state.clipboard; f.state.field = 'private-field-'.repeat(200)
    try { await f.input.readFocusedText('fixture-phone', AbortSignal.timeout(5000)); throw new Error('Expected read failure') }
    catch (error) { expect(error).toMatchObject({ code: 'comment_input_unreadable' }); expect(String(error)).not.toContain('private-field'); expect(String(error)).not.toContain(original) }
    expect(f.state.clipboard).toBe(original); expect(f.events.some(event => event.paste)).toBe(false)
  })

  it('selects the field once and pastes a replacement instead of appending', async () => {
    const f = await fixture()
    await f.input.replace('fixture-phone', '最终稿 😀\nSecond', AbortSignal.timeout(5000))
    expect(f.state.field).toBe('最终稿 😀\nSecond'); expect(f.events.filter(event => event.paste)).toHaveLength(1)
    await expect(f.input.replace('fixture-phone', 'a'.repeat(501), AbortSignal.timeout(5000))).rejects.toThrow('1-500')
    expect(f.events.filter(event => event.paste)).toHaveLength(1)
  })

  it('sends no cleanup input or paste after cancellation during copy', async () => {
    const f = await fixture(), controller = new AbortController()
    f.state.onCopy = () => controller.abort(new Error('fixture handback'))
    await expect(f.input.readFocusedText('fixture-phone', controller.signal)).rejects.toMatchObject({ code: 'comment_input_unreadable' })
    expect(f.events.filter(event => event.type === 9)).toHaveLength(1)
    expect(f.events.some(event => event.paste)).toBe(false)
  })

  it('handles fragmented clipboard messages and rejects oversized or invalid UTF-8 readbacks', () => {
    const wire = clipboardMessage('中文 😀\n'), prefix = parseScrcpyDeviceMessages(wire.subarray(0, 7), true)
    expect(prefix.clipboards).toEqual([])
    expect(parseScrcpyDeviceMessages(Buffer.concat([prefix.remaining, wire.subarray(7)]), true).clipboards).toEqual(['中文 😀\n'])
    expect(parseScrcpyDeviceMessages(wire).clipboards).toBeUndefined()
    const oversized = Buffer.alloc(5); oversized.writeUInt32BE(1 << 18, 1)
    expect(() => parseScrcpyDeviceMessages(oversized, true)).toThrow('oversized')
    expect(() => parseScrcpyDeviceMessages(Buffer.from([0, 0, 0, 0, 1, 0xff]), true)).toThrow()
  })
})
