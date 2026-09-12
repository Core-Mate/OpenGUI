import type { SessionEvent } from '@deepseek-ai/dsh-session'
import { Session, SessionId } from '@deepseek-ai/dsh-session'
import { ToolCallId as CallId, createAssistantMessage, createToolResultMessage } from '@deepseek-ai/dsh-llm'
import { describe, expect, it } from 'vitest'
import { relayNestedTaskProgress, relayPhoneTaskProgress } from '../src/phone-progress.ts'

describe('phone task chat progress', () => {
  it('publishes a completed message before the child task settles and closes on stop', () => {
    const child = Session.create(SessionId('child-phone'))
    const parent = Session.create(SessionId('parent-chat'))
    const listeners = new Set<(event: SessionEvent) => void>()
    child.append('turn/start', { turn: 1 })
    child.append('step/start', { turn: 1, step: 1 })
    const relay = relayPhoneTaskProgress({
      initialEvents: child.snapshotEvents(), parent,
      subscribe(listener) { listeners.add(listener); return () => { listeners.delete(listener) } },
    })
    const message = child.append('assistant/message', {
      turn: 1, step: 1,
      message: createAssistantMessage({ content: [{ type: 'text', text: 'Phone opened.' }], source: { provider: 'test', model: 'test' } }),
    }, { surfaceOp: 'append' })
    for (const listener of listeners) listener(message)
    expect(parent.snapshotEvents().at(-1)).toMatchObject({ type: 'assistant/message', data: { message: { content: [{ type: 'text', text: 'Phone opened.' }] } } })
    expect(relay.latestAssistantMessageSeq()).toBe(2)
    relay.dispose()
    expect(listeners.size).toBe(0)
    expect(parent.snapshotEvents().slice(-2).map(event => event.type)).toEqual(['step/end', 'turn/end'])
  })

  it('deduplicates replayed messages and preserves normal child closure', () => {
    const child = Session.create(SessionId('child-complete'))
    const parent = Session.create(SessionId('parent-complete'))
    child.append('turn/start', { turn: 1 })
    child.append('step/start', { turn: 1, step: 1 })
    let publish!: (event: SessionEvent) => void
    const relay = relayPhoneTaskProgress({ parent, initialEvents: child.snapshotEvents(),
      subscribe(listener) { publish = listener; return () => {} },
    })
    const message = child.append('assistant/message', {
      turn: 1, step: 1,
      message: createAssistantMessage({ content: [{ type: 'text', text: 'Done' }], source: { provider: 'test', model: 'test' } }),
    }, { surfaceOp: 'append' })
    publish(message)
    publish(message)
    publish(child.append('step/end', { turn: 1, step: 1 }))
    publish(child.append('turn/end', { turn: 1, reason: { kind: 'completed' } }))
    const completed = parent.snapshotEvents()
    expect(completed.filter(event => event.type === 'assistant/message')).toHaveLength(1)
    relay.dispose()
    expect(parent.snapshotEvents()).toEqual(completed)
  })

  it('shows nested agent tool calls beneath the running outer call without exposing reasoning', () => {
    const child = Session.create(SessionId('child-browser'))
    const parent = Session.create(SessionId('parent-router'))
    const listeners = new Set<(event: SessionEvent) => void>()
    const publish = (event: SessionEvent): void => {
      for (const listener of listeners) listener(event)
    }
    const rootCallId = CallId('outer-browser-agent')
    const childCallId = CallId('child-browser-control')
    parent.append('turn/start', { turn: 1 })
    parent.append('step/start', { turn: 1, step: 1 })
    parent.append('tool/call', {
      turn: 1,
      step: 1,
      callId: rootCallId,
      name: 'browser_agent',
      arguments: '{"task":"搜索上海"}',
    })

    const stop = relayNestedTaskProgress({
      initialEvents: child.snapshotEvents(),
      subscribe(listener) {
        listeners.add(listener)
        return () => { listeners.delete(listener) }
      },
      parent,
      rootCallId,
      sourceId: String(child.id),
    })

    publish(child.append('assistant/message', {
      turn: 1,
      step: 1,
      message: createAssistantMessage({
        content: [{ type: 'reasoning', text: 'hidden chain of thought' }],
        source: { provider: 'coremate-mobile', model: 'browser-model' },
      }),
    }, { surfaceOp: 'append' }))
    publish(child.append('tool/call', {
      turn: 1,
      step: 1,
      callId: childCallId,
      name: 'browser_control',
      arguments: '{"action":"navigate","url":"https://www.baidu.com"}',
    }))
    publish(child.append('tool/result', {
      turn: 1,
      step: 1,
      message: createToolResultMessage({
        callId: childCallId,
        content: [{ type: 'text', text: '百度已打开' }],
        isError: false,
      }),
    }, { surfaceOp: 'append' }))

    const nested = parent.snapshotEvents().slice(3)
    expect(nested.map(event => event.type)).toEqual(['tool/ptc-dispatch-start', 'tool/ptc-dispatch'])
    expect(nested[0]).toMatchObject({
      type: 'tool/ptc-dispatch-start',
      data: {
        rootCallId,
        parentCallId: rootCallId,
        name: 'browser_control',
        arguments: { action: 'navigate', url: 'https://www.baidu.com' },
      },
    })
    expect(nested[1]).toMatchObject({
      type: 'tool/ptc-dispatch',
      data: { rootCallId, name: 'browser_control', isError: false, content: [{ type: 'text', text: '百度已打开' }] },
    })
    expect(JSON.stringify(nested)).not.toContain('hidden chain of thought')

    stop()
    expect(listeners).toHaveLength(0)
  })

  it('settles an unfinished nested tool card when the child stops', () => {
    const child = Session.create(SessionId('child-stopped'))
    const parent = Session.create(SessionId('parent-stopped'))
    const rootCallId = CallId('outer-phone-agent')
    const callId = CallId('child-phone-control')
    parent.append('turn/start', { turn: 1 })
    child.append('tool/call', {
      turn: 1,
      step: 1,
      callId,
      name: 'phone_control',
      arguments: '{"action":"observe"}',
    })

    const stop = relayNestedTaskProgress({
      initialEvents: child.snapshotEvents(),
      subscribe: () => () => {},
      parent,
      rootCallId,
      sourceId: String(child.id),
    })
    stop()

    expect(parent.snapshotEvents().slice(1).map(event => event.type)).toEqual([
      'tool/ptc-dispatch-start',
      'tool/ptc-dispatch',
    ])
    expect(parent.snapshotEvents().at(-1)).toMatchObject({
      type: 'tool/ptc-dispatch',
      data: { isError: true, content: [{ type: 'text', text: 'phone_control 已结束，但没有返回可展示的结果。' }] },
    })
  })

  it('forwards nested tool cards from the routing child into the command chat', () => {
    const router = Session.create(SessionId('child-router'))
    const chat = Session.create(SessionId('root-chat'))
    const listeners = new Set<(event: SessionEvent) => void>()
    const rootCallId = CallId('outer-browser-agent')
    router.append('turn/start', { turn: 1 })
    router.append('step/start', { turn: 1, step: 1 })
    router.append('tool/call', {
      turn: 1,
      step: 1,
      callId: rootCallId,
      name: 'browser_agent',
      arguments: '{"task":"搜索上海"}',
    })
    const stop = relayPhoneTaskProgress({
      initialEvents: router.snapshotEvents(),
      subscribe(listener) {
        listeners.add(listener)
        return () => { listeners.delete(listener) }
      },
      parent: chat,
    })
    const publish = (event: SessionEvent): void => {
      for (const listener of listeners) listener(event)
    }
    const nestedData = {
      rootCallId,
      parentCallId: rootCallId,
      subCallId: CallId('outer-browser-agent:coremate:child:browser-control'),
      name: 'browser_control',
      arguments: { action: 'observe' },
    }
    publish(router.append('tool/ptc-dispatch-start', nestedData))
    publish(router.append('tool/ptc-dispatch', {
      ...nestedData,
      isError: false,
      content: [{ type: 'text', text: '已观察页面' }],
    }))

    expect(chat.snapshotEvents().slice(-2)).toMatchObject([
      { type: 'tool/ptc-dispatch-start', data: nestedData },
      { type: 'tool/ptc-dispatch', data: { ...nestedData, isError: false } },
    ])
    stop.dispose()
  })
})
