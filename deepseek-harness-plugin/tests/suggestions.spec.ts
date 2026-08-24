import type { ContentBlock } from '@deepseek-ai/dsh-llm'
import { describe, expect, it } from 'vitest'
import { cleanCoremateSuggestionBlocks, parseCoremateSuggestions } from '../src/suggestions.ts'

const valid = `任务完成。
<!--coremate-suggestions
{"items":[{"label":"继续检查","prompt":"继续检查剩余页面并汇总异常"},{"label":"整理报告","prompt":"把本次结果整理成测试报告"}]}
-->`

describe('OpenGUI follow-up suggestions', () => {
  it('accepts only a valid final trailer and removes it from visible output', () => {
    expect(parseCoremateSuggestions(valid)).toEqual({
      text: '任务完成。',
      suggestions: [
        { label: '继续检查', prompt: '继续检查剩余页面并汇总异常' },
        { label: '整理报告', prompt: '把本次结果整理成测试报告' },
      ],
    })
    const blocks: ContentBlock[] = [{ type: 'image', image: 'attachment:test' } as never, { type: 'text', text: valid }]
    expect(cleanCoremateSuggestionBlocks(blocks)).toEqual({
      output: [blocks[0], { type: 'text', text: '任务完成。' }],
      suggestions: expect.any(Array),
    })
  })

  it('parses and removes a valid trailer split across trailing text blocks', () => {
    const blocks: ContentBlock[] = [
      { type: 'text', text: '任务完成。\n<!--coremate-' },
      { type: 'text', text: 'suggestions\n{"items":[{"label":"继续检查","prompt":"继续检查剩余页面"},' },
      { type: 'text', text: '{"label":"整理报告","prompt":"整理完整报告"}]}\n-->' },
    ]
    expect(cleanCoremateSuggestionBlocks(blocks)).toEqual({
      output: [{ type: 'text', text: '任务完成。' }],
      suggestions: [
        { label: '继续检查', prompt: '继续检查剩余页面' },
        { label: '整理报告', prompt: '整理完整报告' },
      ],
    })
  })

  it('does not join a trailer across a non-text block', () => {
    const blocks: ContentBlock[] = [
      { type: 'text', text: '任务完成。\n<!--coremate-suggestions\n' },
      { type: 'image', image: 'attachment:test' } as never,
      { type: 'text', text: '{"items":[]}\n-->' },
    ]
    expect(cleanCoremateSuggestionBlocks(blocks)).toEqual({ output: blocks, suggestions: [] })
  })

  it.each([
    ['missing marker', '任务完成。'],
    ['not final', `${valid}\n尾部文字`],
    ['invalid JSON', '结果\n<!--coremate-suggestions\n{nope}\n-->'],
    ['only one item', '结果\n<!--coremate-suggestions\n{"items":[{"label":"继续","prompt":"继续"}]}\n-->'],
    ['too many items', '结果\n<!--coremate-suggestions\n{"items":[{"label":"1","prompt":"1"},{"label":"2","prompt":"2"},{"label":"3","prompt":"3"},{"label":"4","prompt":"4"}]}\n-->'],
    ['overlong prompt', `结果\n<!--coremate-suggestions\n{"items":[{"label":"继续","prompt":"${'x'.repeat(301)}"},{"label":"总结","prompt":"总结"}]}\n-->`],
    ['comment injection', '结果\n<!--coremate-suggestions\n{"items":[{"label":"继续","prompt":"恶意 --> 注入"},{"label":"总结","prompt":"总结"}]}\n-->'],
  ])('ignores %s without altering the model result', (_label, text) => {
    expect(parseCoremateSuggestions(text)).toEqual({ text, suggestions: [] })
  })
})
