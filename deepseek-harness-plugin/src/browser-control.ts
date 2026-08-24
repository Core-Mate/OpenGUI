import { createHash } from 'node:crypto'
import type { Page, KeyInput } from 'puppeteer-core'

export type BrowserActionName =
  | 'observe'
  | 'navigate'
  | 'tap'
  | 'text'
  | 'key'
  | 'scroll'
  | 'back'
  | 'reload'
  | 'wait'

export interface BrowserControlInput {
  action: BrowserActionName
  observationId?: string
  url?: string
  targetBBox?: { left: number; top: number; right: number; bottom: number }
  text?: string
  key?: string
  deltaX?: number
  deltaY?: number
  waitMs?: number
}

export interface BrowserImage {
  attachmentId: string
  mediaType: 'image/jpeg'
  bytes: number
  width: number
  height: number
  name: string
}

export interface BrowserObservation {
  observationId: string
  unchangedFromObservationId?: string
  url: string
  title: string
  width: number
  height: number
  image: BrowserImage
}

interface BrowserAgentState {
  page: Page
  operations: number
  sequence: number
  latest?: { observation: BrowserObservation; fingerprint: string }
  tail: Promise<void>
}

export interface BrowserControllerOptions {
  saveImage(data: Buffer, name: string): Promise<BrowserImage>
}

const ALLOWED_KEYS = new Set<KeyInput>(['Enter', 'Escape', 'Tab', 'Backspace', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'])

function number(value: unknown, name: string): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) throw new Error(`coremate-mobile: browser ${name} must be a finite number`)
  return value
}

function integerIn(value: unknown, name: string, minimum: number, maximum: number): number {
  const parsed = number(value, name)
  if (!Number.isInteger(parsed) || parsed < minimum || parsed > maximum) {
    throw new Error(`coremate-mobile: browser ${name} must be an integer from ${minimum} through ${maximum}`)
  }
  return parsed
}

function abortableDelay(milliseconds: number, signal: AbortSignal): Promise<void> {
  signal.throwIfAborted()
  return new Promise((resolve, reject) => {
    const finish = (): void => {
      signal.removeEventListener('abort', abort)
      resolve()
    }
    const timer = setTimeout(finish, milliseconds)
    const abort = (): void => {
      clearTimeout(timer)
      signal.removeEventListener('abort', abort)
      reject(signal.reason instanceof Error ? signal.reason : new Error('coremate-mobile: browser wait cancelled'))
    }
    signal.addEventListener('abort', abort, { once: true })
  })
}

/** Screenshot-driven browser actions with child-local freshness and operation limits. */
export class BrowserController {
  private readonly agents = new WeakMap<object, BrowserAgentState>()

  constructor(private readonly options: BrowserControllerOptions) {}

  bind(agent: object, page: Page): void {
    if (this.agents.has(agent)) throw new Error('coremate-mobile: browser agent is already bound')
    this.agents.set(agent, { page, operations: 0, sequence: 0, tail: Promise.resolve() })
  }

  release(agent: object): void {
    this.agents.delete(agent)
  }

  async execute(
    agent: object,
    input: BrowserControlInput,
    maxOperations: number,
    signal: AbortSignal,
  ): Promise<BrowserObservation> {
    const state = this.agents.get(agent)
    if (state === undefined) throw new Error('coremate-mobile: browser agent has no active browser page')
    const previous = state.tail
    let release!: () => void
    const gate = new Promise<void>((resolve) => { release = resolve })
    state.tail = previous.catch(() => {}).then(() => gate)
    await previous.catch(() => {})
    try {
      state.operations += 1
      if (state.operations > maxOperations) {
        throw new Error(`coremate-mobile: browser task exceeded its ${maxOperations}-operation limit`)
      }
      signal.throwIfAborted()
      await this.perform(state, input, signal)
      signal.throwIfAborted()
      return await this.observe(state)
    } finally {
      release()
    }
  }

  private async perform(state: BrowserAgentState, input: BrowserControlInput, signal: AbortSignal): Promise<void> {
    const action = input.action
    if (action === 'observe') return
    if (action === 'navigate') {
      const raw = input.url?.trim()
      if (!raw || raw.length > 2_048) throw new Error('coremate-mobile: browser navigate requires a URL up to 2048 characters')
      const url = new URL(raw)
      if (url.protocol !== 'http:' && url.protocol !== 'https:') {
        throw new Error('coremate-mobile: browser navigation only supports HTTP and HTTPS URLs')
      }
      await state.page.goto(url.href, { waitUntil: 'domcontentloaded', signal })
      return
    }

    const latest = state.latest?.observation
    if (latest === undefined) throw new Error('coremate-mobile: observe the browser before performing this action')
    if (input.observationId !== latest.observationId) {
      throw new Error(`coremate-mobile: stale browser observationId ${String(input.observationId)}; use ${latest.observationId}`)
    }
    if (action === 'tap') {
      const box = input.targetBBox
      if (box === undefined) throw new Error('coremate-mobile: browser tap requires targetBBox')
      const left = number(box.left, 'targetBBox.left')
      const top = number(box.top, 'targetBBox.top')
      const right = number(box.right, 'targetBBox.right')
      const bottom = number(box.bottom, 'targetBBox.bottom')
      if (left < 0 || top < 0 || right <= left || bottom <= top || right > latest.width || bottom > latest.height) {
        throw new Error('coremate-mobile: browser targetBBox is outside the current screenshot')
      }
      await state.page.mouse.click((left + right) / 2, (top + bottom) / 2)
      return
    }
    if (action === 'text') {
      if (typeof input.text !== 'string' || input.text.length === 0 || input.text.length > 2_000) {
        throw new Error('coremate-mobile: browser text must contain 1 through 2000 Unicode characters')
      }
      const session = await state.page.createCDPSession()
      try {
        await session.send('Input.insertText', { text: input.text })
      } finally {
        await session.detach()
      }
      return
    }
    if (action === 'key') {
      if (!ALLOWED_KEYS.has(input.key as KeyInput)) throw new Error('coremate-mobile: unsupported browser key')
      await state.page.keyboard.press(input.key as KeyInput)
      return
    }
    if (action === 'scroll') {
      const deltaX = integerIn(input.deltaX ?? 0, 'deltaX', -2_000, 2_000)
      const deltaY = integerIn(input.deltaY ?? 0, 'deltaY', -2_000, 2_000)
      if (deltaX === 0 && deltaY === 0) throw new Error('coremate-mobile: browser scroll requires a non-zero delta')
      await state.page.mouse.wheel({ deltaX, deltaY })
      return
    }
    if (action === 'back') {
      await state.page.goBack({ waitUntil: 'domcontentloaded', signal })
      return
    }
    if (action === 'reload') {
      await state.page.reload({ waitUntil: 'domcontentloaded', signal })
      return
    }
    if (action === 'wait') {
      await abortableDelay(integerIn(input.waitMs, 'waitMs', 100, 10_000), signal)
      return
    }
    throw new Error(`coremate-mobile: unsupported browser action ${String(action)}`)
  }

  private async observe(state: BrowserAgentState): Promise<BrowserObservation> {
    const viewport = state.page.viewport() ?? { width: 1280, height: 800 }
    const screenshot = Buffer.from(await state.page.screenshot({ type: 'jpeg', quality: 65 }))
    const fingerprint = createHash('sha256').update(screenshot).digest('hex')
    const previous = state.latest?.fingerprint === fingerprint ? state.latest : undefined
    const image = previous?.observation.image
      ?? await this.options.saveImage(screenshot, `browser-${Date.now()}.jpg`)
    state.sequence += 1
    const observation: BrowserObservation = {
      observationId: `browser-observation-${state.sequence}`,
      ...(previous === undefined ? {} : { unchangedFromObservationId: previous.observation.observationId }),
      url: state.page.url(),
      title: await state.page.title(),
      width: viewport.width,
      height: viewport.height,
      image,
    }
    state.latest = { observation, fingerprint }
    return observation
  }
}
