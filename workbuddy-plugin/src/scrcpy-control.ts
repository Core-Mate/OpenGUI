import { buildSetClipboardControlMessage } from './scrcpy.ts'

/**
 * Person-driven input for 接管设备: the workbench page sends pointer, wheel and keyboard events in
 * the live video frame's coordinates, and they are encoded as scrcpy 4.1 control messages on the
 * same server that streams the video. Nothing here is reachable by the model.
 */
export interface FrameSize { readonly width: number; readonly height: number }

export type TakeoverInput =
  | { readonly type: 'touch'; readonly action: 'down' | 'move' | 'up'; readonly x: number; readonly y: number; readonly width: number; readonly height: number }
  | { readonly type: 'scroll'; readonly x: number; readonly y: number; readonly width: number; readonly height: number; readonly dx: number; readonly dy: number }
  | { readonly type: 'key'; readonly key: string; readonly ctrl?: boolean }
  | { readonly type: 'text'; readonly text: string }

/** Android key codes for the keys a person can press in the workbench. */
const KEYS: Record<string, number> = {
  Back: 4, Escape: 4, Home: 3, AppSwitch: 187, Enter: 66, Backspace: 67, Delete: 112, Tab: 61,
  ArrowUp: 19, ArrowDown: 20, ArrowLeft: 21, ArrowRight: 22, PageUp: 92, PageDown: 93, MoveHome: 122, MoveEnd: 123,
}
const CTRL_KEYS: Record<string, number> = { a: 29, c: 31, x: 52, z: 54 }
const META_CTRL_ON = 0x1000
/** scrcpy's generic finger pointer, so drags scroll lists like a finger on the screen. */
const GENERIC_FINGER = -2n
const TOUCH_ACTION = { down: 0, up: 1, move: 2 } as const
const MAX_TEXT_CHARS = 300

function touch(action: 0 | 1 | 2, x: number, y: number, frame: FrameSize): Buffer {
  const message = Buffer.alloc(32)
  message[0] = 2
  message[1] = action
  message.writeBigInt64BE(GENERIC_FINGER, 2)
  message.writeInt32BE(x, 10); message.writeInt32BE(y, 14)
  message.writeUInt16BE(frame.width, 18); message.writeUInt16BE(frame.height, 20)
  message.writeUInt16BE(action === 1 ? 0 : 0xffff, 22)
  message.writeInt32BE(1, 24)
  message.writeInt32BE(action === 1 ? 0 : 1, 28)
  return message
}

/** Scroll amounts are wheel notches; scrcpy carries them as 16-bit fixed point divided by 16. */
function scroll(x: number, y: number, frame: FrameSize, dx: number, dy: number): Buffer {
  const fixed = (notches: number): number => Math.max(-0x8000, Math.min(0x7fff, Math.round(Math.max(-16, Math.min(16, notches)) / 16 * 0x8000)))
  const message = Buffer.alloc(21)
  message[0] = 3
  message.writeInt32BE(x, 1); message.writeInt32BE(y, 5)
  message.writeUInt16BE(frame.width, 9); message.writeUInt16BE(frame.height, 11)
  message.writeInt16BE(fixed(dx), 13); message.writeInt16BE(fixed(dy), 15)
  message.writeInt32BE(0, 17)
  return message
}

function keyPress(code: number, meta = 0): Buffer {
  const message = Buffer.alloc(28)
  for (const [index, action] of [0, 1].entries()) {
    const offset = index * 14
    message[offset] = 0; message[offset + 1] = action
    message.writeInt32BE(code, offset + 2); message.writeInt32BE(0, offset + 6); message.writeInt32BE(meta, offset + 10)
  }
  return message
}

function injectText(text: string): Buffer {
  const content = Buffer.from(text, 'utf8'), message = Buffer.alloc(5 + content.length)
  message[0] = 1
  message.writeUInt32BE(content.length, 1)
  content.copy(message, 5)
  return message
}

const finite = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value)

/**
 * Validate one page event against the current video frame and encode it. Returns undefined for a
 * stale frame size (rotation or resize): the page then picks up the new frame before sending again.
 */
export function encodeTakeoverInput(input: unknown, frame: FrameSize): Buffer | undefined {
  if (!input || typeof input !== 'object') throw new Error('invalid_input_event')
  const event = input as Record<string, unknown>
  if (event.type === 'touch' || event.type === 'scroll') {
    if (![event.x, event.y, event.width, event.height].every(finite)) throw new Error('invalid_input_event')
    if (event.width !== frame.width || event.height !== frame.height) return undefined
    const x = Math.round(Math.min(frame.width - 1, Math.max(0, event.x as number)))
    const y = Math.round(Math.min(frame.height - 1, Math.max(0, event.y as number)))
    if (event.type === 'scroll') {
      if (![event.dx, event.dy].every(finite)) throw new Error('invalid_input_event')
      return scroll(x, y, frame, event.dx as number, event.dy as number)
    }
    const action = TOUCH_ACTION[event.action as keyof typeof TOUCH_ACTION]
    if (action === undefined) throw new Error('invalid_input_event')
    return touch(action, x, y, frame)
  }
  if (event.type === 'key') {
    const key = String(event.key)
    if (event.ctrl === true) {
      const code = CTRL_KEYS[key.toLowerCase()]
      if (code === undefined) throw new Error('unsupported_key')
      return keyPress(code, META_CTRL_ON)
    }
    const code = KEYS[key]
    if (code === undefined) throw new Error('unsupported_key')
    return keyPress(code)
  }
  if (event.type === 'text') {
    const text = typeof event.text === 'string' ? event.text : ''
    if (!text || [...text].length > MAX_TEXT_CHARS) throw new Error('invalid_input_event')
    // scrcpy text injection covers printable ASCII; other text (Chinese, emoji) is pasted.
    return /^[\x20-\x7e]+$/u.test(text) ? injectText(text) : buildSetClipboardControlMessage(text, true, 0n)
  }
  throw new Error('invalid_input_event')
}
