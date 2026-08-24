import type { ClientContext, ISessions } from '@deepseek-ai/dsh-client-runtime/client'
import { describe, expect, it, vi } from 'vitest'
import { coremateTriggerSource, isUntitledSession } from '../src/client/coremate-trigger.ts'

function setup(result: { ok: true, value: { matched: boolean } } | { ok: false, error: { message: string } } = { ok: true, value: { matched: true } }) {
  const command = vi.fn(async () => result)
  const rename = vi.fn(async () => ({ ok: true, value: { title: 'renamed', seq: 1 } }))
  const sessions = {
    binding: () => ({ session: { command, rename } }),
    list: { getSnapshot: () => ({ byId: { 'session-1': { blank: true } } }) },
  } as unknown as ISessions
  const launch = {
    beginLaunch: vi.fn(() => true),
    finishLaunch: vi.fn(),
  }
  const source = coremateTriggerSource({ sessions } as unknown as ClientContext, launch as never)
  const session = { sessionId: 'session-1' as never }
  return { source, session, command, rename, launch }
}

describe('native @OpenGUI trigger', () => {
  it('recognizes DSH default session titles as untitled', () => {
    expect(isUntitledSession(undefined)).toBe(true)
    expect(isUntitledSession('')).toBe(true)
    expect(isUntitledSession('New Session')).toBe(true)
    expect(isUntitledSession('新会话')).toBe(true)
    expect(isUntitledSession('Existing task')).toBe(false)
  })
  it('offers one leading, case-insensitive menu candidate', async () => {
    const { source, session } = setup()
    await expect(source.candidates(session, { query: 'open', position: 'leading', signal: new AbortController().signal }))
      .resolves.toEqual([expect.objectContaining({ name: 'OpenGUI' })])
    await expect(source.candidates(session, { query: 'OPENGUI', position: 'leading', signal: new AbortController().signal }))
      .resolves.toHaveLength(4)
    await expect(source.candidates(session, { query: '', position: 'inline', signal: new AbortController().signal }))
      .resolves.toEqual([])
    expect(source.lexicon?.(session)).toEqual(['OpenGUI'])
  })

  it('switches the exact OpenGUI query into the native scene menu', async () => {
    const { source, session } = setup()
    const scenes = await source.candidates(session, {
      query: 'OpenGUI', position: 'leading', signal: new AbortController().signal,
    })

    expect(scenes.map(candidate => candidate.name)).toEqual(['自由描述', 'QA 助手', '运营助手', '手游助手'])
    expect(scenes.every(candidate => candidate.description?.length)).toBeTruthy()
  })

  it('retracks the draft after picking the first-stage OpenGUI candidate', async () => {
    const track = vi.fn()
    const scoped = { bail: vi.fn(() => true) }
    const ctx = {
      sessions: { binding: () => ({ ctx: scoped, session: { command: vi.fn() } }) },
      inputTriggers: { sessionOf: () => ({ track }) },
    } as unknown as ClientContext
    const source = coremateTriggerSource(ctx)
    const outcome = source.onPick({
      candidate: { name: 'OpenGUI' },
      session: { sessionId: 'session-1' as never },
      position: 'leading',
      via: 'menu',
      span: { start: 0, end: 1, draftRev: 7 },
    })

    expect(outcome).toBe('handled')
    expect(scoped.bail).toHaveBeenCalledWith(scoped, 'slash/input-insert-text', expect.objectContaining({ text: '@OpenGUI' }))
    await new Promise(resolve => queueMicrotask(resolve))
    expect(track).toHaveBeenCalledWith('@OpenGUI', 8, { tier: 'plain' }, 8)
  })

  it('fills scene drafts while keeping custom tasks on the canonical command', async () => {
    const { source, session, command } = setup()
    const picked = source.onPick({ candidate: { name: 'OpenGUI' }, session, position: 'leading', via: 'menu', span: { start: 0, end: 1, draftRev: 1 } })
    expect(picked).toEqual({ text: '@OpenGUI' })

    const scenes = await source.candidates(session, {
      query: 'OpenGUI', position: 'leading', signal: new AbortController().signal,
    })
    const qa = source.onPick({ candidate: scenes[1]!, session, position: 'leading', via: 'menu', span: { start: 0, end: 9, draftRev: 2 } })
    expect(qa).toEqual({ text: '@OpenGUI 作为测试，帮我走查当前已连接 Android 手机上的 APP，先产出测试用例，再按用例逐项执行并汇总问题。' })

    const spaced = source.matchSpace?.(session, '@oPeNgUi')
    expect(spaced).toEqual({ claim: expect.objectContaining({ token: '@oPeNgUi ' }) })
    const entered = await source.matchEnter?.(session, '@OPENGUI 检查设置', new AbortController().signal)
    if (typeof entered !== 'object' || entered === null || !('claim' in entered)) throw new Error('expected enter claim')
    await expect(entered.claim.submit('检查设置', {} as ClientContext)).resolves.toEqual({ kind: 'success' })
    expect(command).toHaveBeenLastCalledWith('/opengui 检查设置')
  })

  it('surfaces unavailable commands without sending a normal chat message', async () => {
    const { source, session, launch } = setup({ ok: true, value: { matched: false } })
    const picked = await source.matchEnter?.(session, '@OpenGUI 任务', new AbortController().signal)
    if (typeof picked !== 'object' || picked === null || !('claim' in picked)) throw new Error('expected claim')
    await expect(picked.claim.submit('任务', {} as ClientContext)).resolves.toEqual({ kind: 'success' })
    await vi.waitFor(() => expect(launch.finishLaunch).toHaveBeenCalledWith('OpenGUI 命令尚未加载，请重启 DSH 后重试。'))
  })

  it('releases the composer before a long OpenGUI command settles', async () => {
    let finish!: (value: { ok: true; value: { matched: boolean } }) => void
    const commandResult = new Promise<{ ok: true; value: { matched: boolean } }>(resolve => { finish = resolve })
    const command = vi.fn(() => commandResult)
    const rename = vi.fn(async () => ({ ok: true, value: { title: 'OpenGUI', seq: 1 } }))
    const sessions = {
      binding: () => ({ session: { command, rename } }),
      list: { getSnapshot: () => ({ byId: { 'session-1': { blank: true } } }) },
    } as unknown as ISessions
    const launch = { beginLaunch: vi.fn(() => true), finishLaunch: vi.fn() }
    const source = coremateTriggerSource({ sessions } as unknown as ClientContext, launch as never)
    const session = { sessionId: 'session-1' as never }
    const entered = await source.matchEnter?.(session, '@OpenGUI 长任务', new AbortController().signal)
    if (typeof entered !== 'object' || entered === null || !('claim' in entered)) throw new Error('expected claim')

    await expect(entered.claim.submit('长任务', {} as ClientContext)).resolves.toEqual({ kind: 'success' })
    expect(command).toHaveBeenCalledWith('/opengui 长任务')
    expect(rename).toHaveBeenCalledWith('OpenGUI · 长任务')
    expect(launch.finishLaunch).not.toHaveBeenCalled()
    finish({ ok: true, value: { matched: true } })
    await vi.waitFor(() => expect(launch.finishLaunch).toHaveBeenCalledWith())
  })

  it('preserves an existing title when dispatch succeeds', async () => {
    const { session } = setup()
    const command = vi.fn(async () => ({ ok: true as const, value: { matched: true } }))
    const titledRename = vi.fn()
    const titledSessions = {
      binding: () => ({ session: { command, rename: titledRename } }),
      list: { getSnapshot: () => ({ byId: { 'session-1': { blank: true, title: '我的任务' } } }) },
    } as unknown as ISessions
    const launch = { beginLaunch: vi.fn(() => true), finishLaunch: vi.fn() }
    const titledSource = coremateTriggerSource({ sessions: titledSessions } as unknown as ClientContext, launch)
    const entered = await titledSource.matchEnter?.(session, '@OpenGUI 新任务', new AbortController().signal)
    if (typeof entered !== 'object' || entered === null || !('claim' in entered)) throw new Error('expected claim')

    await expect(entered.claim.submit('新任务', {} as ClientContext)).resolves.toEqual({ kind: 'success' })
    expect(titledRename).not.toHaveBeenCalled()
    await vi.waitFor(() => expect(launch.finishLaunch).toHaveBeenCalledWith())
  })

  it('rejects a duplicate launch before dispatch', async () => {
    const command = vi.fn()
    const rename = vi.fn()
    const sessions = {
      binding: () => ({ session: { command, rename } }),
      list: { getSnapshot: () => ({ byId: { 'session-1': { blank: true, title: '我的任务' } } }) },
    } as unknown as ISessions
    const launch = { beginLaunch: vi.fn(() => false), finishLaunch: vi.fn() }
    const source = coremateTriggerSource({ sessions } as unknown as ClientContext, launch as never)
    const session = { sessionId: 'session-1' as never }
    const entered = await source.matchEnter?.(session, '@OpenGUI 第二个任务', new AbortController().signal)
    if (typeof entered !== 'object' || entered === null || !('claim' in entered)) throw new Error('expected claim')

    await expect(entered.claim.submit('第二个任务', {} as ClientContext)).resolves.toEqual({
      kind: 'error', text: '已有 OpenGUI 任务正在启动或执行，请等待完成后再试。',
    })
    expect(command).not.toHaveBeenCalled()
    expect(rename).not.toHaveBeenCalled()
  })
})
