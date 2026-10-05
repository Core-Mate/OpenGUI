import { describe, expect, it } from 'vitest'
import { normalizeTodos, TaskPlan } from '../src/todos.ts'

const pending = (content: string) => ({ content, status: 'pending' as const })
describe('stable task plan identity and progress messages', () => {
  it('assigns unique independent IDs and preserves them across identical legacy snapshots', () => {
    const plan = new TaskPlan()
    plan.revise([pending('A'), pending('B')])
    const before = plan.todos
    expect(new Set(before.map(item => item.stepId)).size).toBe(2)
    plan.revise([pending('A'), pending('B')])
    expect(plan.todos).toEqual(before)
    plan.select(0)
    expect(plan.progress()).toMatchObject({ currentStepId: before[0]!.stepId, nextStepId: before[1]!.stepId, message: '已完成 0 / 2，正在A' })
  })

  it('preserves renamed pending identity and never reuses a removed ID for a new step', () => {
    const plan = new TaskPlan()
    plan.revise([pending('A'), pending('B')])
    const [a, b] = plan.todos
    plan.select(undefined, undefined, a!.stepId)
    plan.revise([plan.todos[0]!, { ...b!, content: 'Renamed B' }])
    expect(plan.todos[1]!.stepId).toBe(b!.stepId)
    plan.revise([plan.todos[0]!])
    expect(() => plan.revise([plan.todos[0]!, b!])).toThrow('use a returned stepId')
    plan.revise([plan.todos[0]!, pending('B')])
    expect(plan.todos[1]!.stepId).not.toBe(b!.stepId)
    expect(() => plan.select(undefined, 'evidence', b!.stepId)).toThrow('does not belong')
  })

  it('rejects ID aliases, invalid IDs and invented IDs without changing the plan', () => {
    expect(() => normalizeTodos([{ ...pending('A'), stepId: 'id' }, { ...pending('B'), stepId: 'id' }])).toThrow('unique')
    expect(() => normalizeTodos([{ ...pending('A'), stepId: 42 }])).toThrow('stepId')
    const plan = new TaskPlan()
    plan.revise([pending('A'), pending('B')])
    const before = plan.todos
    expect(() => plan.revise([{ ...before[0]!, content: 'Renamed A' }, pending('A')])).toThrow('unique stepId')
    expect(plan.todos).toEqual(before)
    expect(() => plan.revise([{ ...pending('X'), stepId: 'invented' }])).toThrow('use a returned stepId')
    expect(plan.todos).toEqual(before)
  })

  it('preserves proven content and statuses while allowing only pending replans', () => {
    const plan = new TaskPlan()
    plan.revise([pending('A'), pending('B'), pending('C')])
    plan.select(0)
    plan.select(1, 'evidence')
    const before = plan.todos
    expect(() => plan.revise([{ ...before[0]!, content: 'Changed proven outcome' }, ...before.slice(1)])).toThrow('retain their content')
    expect(() => plan.revise([before[0]!, { ...before[1]!, status: 'completed' }, before[2]!])).toThrow('retain their content')
    expect(plan.todos).toEqual(before)
    plan.revise([...before, pending('D')])
    expect(plan.progress()).toMatchObject({ completed: 1, total: 4, currentStepId: before[1]!.stepId })
  })

  it('handles empty, pending, paused and completed messages without duplicated ongoing wording', () => {
    const plan = new TaskPlan()
    expect(plan.progress()).toBeUndefined()
    plan.revise([pending('正在浏览帖子')])
    expect(plan.progress()?.message).toBe('已完成 0 / 1，等待开始下一步')
    plan.select(0)
    expect(plan.progress()?.message).toBe('已完成 0 / 1，正在浏览帖子')
    plan.pause()
    expect(plan.progress()?.message).toBe('已完成 0 / 1，任务暂停，未完成：正在浏览帖子')
    plan.select(0)
    expect(plan.progress()?.message).toBe('已完成 0 / 1，正在浏览帖子')
    plan.finish()
    plan.pause()
    expect(plan.progress()).toEqual({ completed: 1, total: 1, inProgress: 0, pending: 0, message: '已完成 1 / 1，任务步骤已全部完成' })
  })
})
