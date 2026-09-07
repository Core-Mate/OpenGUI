import type { Page } from 'puppeteer-core'
import { describe, expect, it, vi } from 'vitest'
import { BrowserController } from '../src/browser-control.ts'

function fakePage() {
  const session = { send: vi.fn(async () => ({})), detach: vi.fn(async () => {}) }
  const page = {
    viewport: vi.fn(() => ({ width: 1280, height: 800 })),
    screenshot: vi.fn(async () => Buffer.from('frame')),
    url: vi.fn(() => 'https://example.com/'),
    title: vi.fn(async () => 'Example'),
    goto: vi.fn(async () => null),
    goBack: vi.fn(async () => null),
    reload: vi.fn(async () => null),
    createCDPSession: vi.fn(async () => session),
    mouse: { click: vi.fn(async () => {}), wheel: vi.fn(async () => {}) },
    keyboard: { press: vi.fn(async () => {}) },
  }
  return { page: page as unknown as Page, raw: page, session }
}

describe('browser control', () => {
  it('observes, requires a fresh frame for mutations, and inserts Unicode through CDP', async () => {
    const { page, session } = fakePage()
    const saveImage = vi.fn(async (data: Buffer, name: string) => ({
      attachmentId: 'image-1', mediaType: 'image/jpeg' as const, bytes: data.byteLength,
      width: 1280, height: 800, name,
    }))
    const controller = new BrowserController({ saveImage })
    const agent = {}
    controller.bind(agent, page)

    const first = await controller.execute(agent, { action: 'observe' }, 10, new AbortController().signal)
    expect(first).toMatchObject({
      observationId: 'browser-observation-1', url: 'https://example.com/', title: 'Example', width: 1280, height: 800,
    })
    await expect(controller.execute(agent, {
      action: 'text', observationId: 'browser-observation-stale', text: '中文输入',
    }, 10, new AbortController().signal)).rejects.toThrow('stale browser observationId')

    const second = await controller.execute(agent, {
      action: 'text', observationId: first.observationId, text: '中文输入',
    }, 10, new AbortController().signal)
    expect(session.send).toHaveBeenCalledWith('Input.insertText', { text: '中文输入' })
    expect(session.detach).toHaveBeenCalled()
    expect(second.unchangedFromObservationId).toBe(first.observationId)
    expect(saveImage).toHaveBeenCalledTimes(1)
  })

  it('allows only HTTP navigation and enforces the operation budget', async () => {
    const { page, raw } = fakePage()
    const controller = new BrowserController({
      saveImage: async data => ({
        attachmentId: 'image', mediaType: 'image/jpeg', bytes: data.byteLength,
        width: 1280, height: 800, name: 'browser.jpg',
      }),
    })
    const agent = {}
    controller.bind(agent, page)

    await expect(controller.execute(agent, { action: 'navigate', url: 'file:///etc/passwd' }, 2, new AbortController().signal))
      .rejects.toThrow('only supports HTTP and HTTPS')
    await controller.execute(agent, { action: 'navigate', url: 'https://example.com/path' }, 2, new AbortController().signal)
    expect(raw.goto).toHaveBeenCalledWith('https://example.com/path', expect.objectContaining({
      waitUntil: 'domcontentloaded', signal: expect.any(AbortSignal),
    }))
    await expect(controller.execute(agent, { action: 'observe' }, 2, new AbortController().signal))
      .rejects.toThrow('2-operation limit')
  })
})
