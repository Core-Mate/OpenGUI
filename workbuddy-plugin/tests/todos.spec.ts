import { describe, expect, it } from 'vitest'
import { normalizeTodos } from '../src/todos.ts'
import { callOpenGuiTool, validateToolArguments } from '../src/tools.ts'
import { WorkBuddyOpenGuiService } from '../src/service.ts'
import { setup, a } from './viewer-fixture.ts'

describe('owner-bound viewer task plans', () => {
  it('publishes live whole-list snapshots without granting first-frame readiness', async () => {
    const { viewer } = setup()
    const opened = await viewer.open('task-a', [a], AbortSignal.timeout(1000))
    const plan = [{ content: 'Open the app', status: 'completed' }, { content: 'Read the result', status: 'in_progress' }]
    const stored = viewer.writeTodos(opened.viewerId, 'task-a', plan).todos
    expect((await fetch(`${opened.url}status`).then(r => r.json())).todos).toEqual(stored)
    expect(() => viewer.assertReady(opened.viewerId)).toThrow('waiting_for_frame')
    viewer.writeTodos(opened.viewerId, 'task-a', [plan[1]])
    expect(await viewer.status(opened.viewerId, 'task-a')).toMatchObject({ todos: [plan[1]] })
    expect((await fetch(`${opened.url}todos`, { method: 'POST', headers: { Origin: new URL(opened.url).origin } })).status).toBe(404)
  })

  it('isolates host tasks, retains unfinished items on stop and resets a new viewer', async () => {
    const { viewer } = setup()
    const old = await viewer.open('task-a', [a], AbortSignal.timeout(1000))
    const plan = [{ content: 'Read the result', status: 'in_progress' }]
    viewer.writeTodos(old.viewerId, 'task-a', plan)
    expect(() => viewer.writeTodos(old.viewerId, 'task-b', [])).toThrow('foreign_viewer')
    viewer.endOwner('task-a')
    expect(() => viewer.writeTodos(old.viewerId, 'task-a', [])).toThrow('task_ended')
    expect(await viewer.status(old.viewerId, 'task-a')).toMatchObject({ todos: plan, taskState: 'ended' })
    const next = await viewer.open('task-a', [a], AbortSignal.timeout(1000))
    expect(next.todos).toEqual([])
  })

  it('routes the documented MCP update through the task owner', async () => {
    const { viewer } = setup()
    const service = new WorkBuddyOpenGuiService({ viewers: viewer })
    const opened = await viewer.open('task-a', [a], AbortSignal.timeout(1000))
    const args = { viewerId: opened.viewerId, todos: [{ content: '  Read result  ', status: 'pending' }] }
    const signal = AbortSignal.timeout(1000)
    await expect(callOpenGuiTool(service, 'opengui_todo_write', args, signal, { owner: 'task-b' })).rejects.toThrow('foreign_viewer')
    await expect(callOpenGuiTool(service, 'opengui_todo_write', args, signal, { owner: 'task-a' })).resolves.toMatchObject({ viewerId: opened.viewerId, todos: [{ stepId: expect.any(String), content: 'Read result', status: 'pending' }], progress: { completed: 0, total: 1, inProgress: 0, pending: 1, message: '已完成 0 / 1，等待开始下一步' } })
    validateToolArguments('opengui_todo_write', { ...args, todos: [{ content: 'a', status: 'failed' }] })
    expect(() => viewer.writeTodos(opened.viewerId, 'task-a', [{ content: 'a', status: 'failed' }])).toThrow('assigned by the runtime')
  })

  it('rejects ambiguous or unbounded snapshots atomically', async () => {
    expect(() => normalizeTodos([{ content: 'a', status: 'pending' }, { content: ' a ', status: 'completed' }])).toThrow('unique')
    expect(() => normalizeTodos([{ content: ' ', status: 'pending' }])).toThrow('non-empty')
    expect(() => normalizeTodos(Array.from({ length: 101 }, (_, i) => ({ content: String(i), status: 'pending' })))).toThrow('100')
    const { viewer } = setup()
    const opened = await viewer.open('task-a', [a], AbortSignal.timeout(1000))
    const plan = [{ content: 'Check outcome', status: 'pending' }]
    viewer.writeTodos(opened.viewerId, 'task-a', plan)
    expect(() => viewer.writeTodos(opened.viewerId, 'task-a', [{ content: ' ', status: 'completed' }])).toThrow()
    expect(await viewer.status(opened.viewerId, 'task-a')).toMatchObject({ todos: plan })
  })
})
