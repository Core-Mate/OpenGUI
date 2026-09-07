import type { CommandNode } from '@deepseek-ai/dsh-client-runtime/client'
import { describe, expect, it } from 'vitest'
import { openGuiCommandPresentation } from '../src/client/OpenGuiCommandCard.tsx'

function commandNode(overrides: Partial<CommandNode> = {}): CommandNode {
  return {
    kind: 'command',
    seq: 1,
    time: 1,
    commandId: 'command-1' as CommandNode['commandId'],
    name: 'opengui',
    args: ' 检查当前页面',
    outcome: null,
    ...overrides,
  }
}

describe('OpenGUI command status card presentation', () => {
  it('shows the submitted task immediately while the command is running', () => {
    expect(openGuiCommandPresentation(commandNode())).toEqual({
      state: 'running',
      summary: 'OpenGUI 已接收任务，正在处理…',
      task: '检查当前页面',
    })
  })

  it('handles an empty command task without inventing content', () => {
    expect(openGuiCommandPresentation(commandNode({ args: '   ' }))).toEqual({
      state: 'running',
      summary: 'OpenGUI 已接收任务，正在处理…',
    })
  })

  it('does not duplicate a successful result already projected into chat', () => {
    expect(openGuiCommandPresentation(commandNode({
      outcome: { kind: 'success', text: '检查完成', sourceEventSeq: 12 },
    }))).toEqual({
      state: 'success',
      summary: 'OpenGUI 任务已完成',
      task: '检查当前页面',
    })
  })

  it('retains an unprojected successful command result', () => {
    expect(openGuiCommandPresentation(commandNode({
      outcome: { kind: 'success', text: '请先连接设备' },
    }))).toEqual({
      state: 'success',
      summary: 'OpenGUI 任务已完成',
      task: '检查当前页面',
      detail: '请先连接设备',
    })
  })

  it('surfaces the authoritative command error', () => {
    expect(openGuiCommandPresentation(commandNode({
      outcome: { kind: 'error', text: '模型不支持图片输入' },
    }))).toEqual({
      state: 'error',
      summary: 'OpenGUI 任务执行失败',
      task: '检查当前页面',
      detail: '模型不支持图片输入',
    })
  })

  it('renders a user-requested stop as stopped instead of failed', () => {
    expect(openGuiCommandPresentation(commandNode({
      outcome: { kind: 'error', text: 'coremate-mobile: OpenGUI task stopped by user' },
    }))).toEqual({
      state: 'stopped',
      summary: 'OpenGUI 任务已停止',
      task: '检查当前页面',
    })
  })

  it('keeps historical completion derived only from the settled command node', () => {
    const settled = commandNode({ outcome: { kind: 'success', sourceEventSeq: 12 } })
    const laterRunningCommand = commandNode({ commandId: 'command-2' as CommandNode['commandId'] })

    expect(openGuiCommandPresentation(laterRunningCommand).state).toBe('running')
    expect(openGuiCommandPresentation(settled).state).toBe('success')
  })
})
