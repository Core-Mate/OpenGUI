import type { SessionEvent } from '@deepseek-ai/dsh-session'
import { Session, SessionId } from '@deepseek-ai/dsh-session'
import { CallId, createAssistantMessage, createToolResultMessage } from '@deepseek-ai/dsh-llm'
import { describe, expect, it, vi } from 'vitest'
import { relayNestedTaskProgress, relayPhoneTaskProgress } from '../src/phone-progress.ts'

describe('phone task chat progress', () => {
  it('publishes a live child text delta into the parent chat before the task settles', () => {
    const child = Session.create(SessionId('child-phone'))
    const parent = Session.create(SessionId('parent-chat'))
    const listeners = new Set<(event: SessionEvent) => void>()
    const subscribe = vi.fn((listener: (event: SessionEvent) => void) => {
      listeners.add(listener)
      return () => { listeners.delete(listener) }
    })

    child.append('turn/start', { turn: 1 })
    child.append('step/start', { turn: 1, step: 1 })
    const stop = relayPhoneTaskProgress({
      initialEvents: child.events,
      subscribe,
      parent,
    })

    const live = child.append('assistant/chunk', {
      turn: 1,
      step: 1,
      chunk: { type: 'text-delta', index: 0, text: '正在打开小红书…' },
    })
    for (const listener of listeners) listener(live)

    expect(parent.events.map(event => event.type)).toEqual([
      'turn/start',
      'step/start',
      'assistant/chunk',
    ])
    expect(parent.events[2]).toMatchObject({
      type: 'assistant/chunk',
      data: { chunk: { type: 'text-delta', text: '正在打开小红书…' } },
    })
    expect(subscribe).toHaveBeenCalledOnce()

    stop.dispose()
    expect(listeners).toHaveLength(0)
    expect(parent.events.slice(-2).map(event => event.type)).toEqual(['step/end', 'turn/end'])
  })

  it('remaps final-message source sequences and preserves normal child closure', () => {
    const child = Session.create(SessionId('child-complete'))
    const parent = Session.create(SessionId('parent-complete'))
    const listeners = new Set<(event: SessionEvent) => void>()
    const publish = (event: SessionEvent): void => {
      for (const listener of listeners) listener(event)
    }

    parent.append('todo/write', { todos: [] })
    child.append('turn/start', { turn: 1 })
    child.append('step/start', { turn: 1, step: 1 })
    const stop = relayPhoneTaskProgress({
      initialEvents: child.events,
      subscribe(listener) {
        listeners.add(listener)
        return () => { listeners.delete(listener) }
      },
      parent,
    })

    const blockStart = child.append('assistant/chunk', {
      turn: 1,
      step: 1,
      chunk: { type: 'block-start', index: 0, blockType: 'text' },
    })
    publish(blockStart)
    const delta = child.append('assistant/chunk', {
      turn: 1,
      step: 1,
      chunk: { type: 'text-delta', index: 0, text: '已打开小红书。' },
    })
    publish(delta)
    const message = child.append('assistant/message', {
      turn: 1,
      step: 1,
      message: createAssistantMessage({
        content: [{ type: 'text', text: '已打开小红书。' }],
        source: { provider: 'coremate-mobile', model: 'phone-model' },
      }),
    }, { surfaceOp: 'append', sourceEventSeqs: [blockStart.seq, delta.seq] })
    publish(message)
    publish(child.append('step/end', { turn: 1, step: 1 }))
    publish(child.append('turn/end', { turn: 1, reason: { kind: 'completed' } }))

    const mirroredMessage = parent.events.find(event => event.type === 'assistant/message')
    expect(mirroredMessage).toMatchObject({
      type: 'assistant/message',
      sourceEventSeqs: [3, 4],
      data: { message: { content: [{ type: 'text', text: '已打开小红书。' }] } },
    })
    const lengthBeforeStop = parent.events.length
    stop.dispose()
    expect(parent.events).toHaveLength(lengthBeforeStop)
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
      initialEvents: child.events,
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

    const nested = parent.events.slice(3)
    expect(nested.map(event => event.type)).toEqual(['tool/code-dispatch-start', 'tool/code-dispatch'])
    expect(nested[0]).toMatchObject({
      type: 'tool/code-dispatch-start',
      data: {
        rootCallId,
        parentCallId: rootCallId,
        name: 'browser_control',
        arguments: { action: 'navigate', url: 'https://www.baidu.com' },
      },
    })
    expect(nested[1]).toMatchObject({
      type: 'tool/code-dispatch',
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
      initialEvents: child.events,
      subscribe: () => () => {},
      parent,
      rootCallId,
      sourceId: String(child.id),
    })
    stop()

    expect(parent.events.slice(1).map(event => event.type)).toEqual([
      'tool/code-dispatch-start',
      'tool/code-dispatch',
    ])
    expect(parent.events.at(-1)).toMatchObject({
      type: 'tool/code-dispatch',
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
      initialEvents: router.events,
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
    publish(router.append('tool/code-dispatch-start', nestedData))
    publish(router.append('tool/code-dispatch', {
      ...nestedData,
      isError: false,
      content: [{ type: 'text', text: '已观察页面' }],
    }))

    expect(chat.events.slice(-2)).toMatchObject([
      { type: 'tool/code-dispatch-start', data: nestedData },
      { type: 'tool/code-dispatch', data: { ...nestedData, isError: false } },
    ])
    stop.dispose()
  })
})
