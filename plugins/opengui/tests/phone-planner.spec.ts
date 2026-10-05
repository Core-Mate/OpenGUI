import { describe, expect, it, vi } from 'vitest'
import { planTask, validatePlan } from '../../../packages/phone-agent/src/planner.ts'
import type { Planning } from '../../../packages/phone-agent/src/contracts.ts'
import type { AgentFactory } from '../../../packages/phone-agent/src/executor.ts'

const input = (): Planning => ({ goal: 'Compare system versions on both phones', devices: [
  { id: 'a', name: 'Phone A', connected: true, authorized: true, state: 'device' },
  { id: 'b', name: 'Phone B', connected: true, authorized: true, state: 'device' },
  { id: 'untrusted', name: 'Phone C', connected: true, authorized: false, state: 'unauthorized' },
], profile: { id: 'model', model: 'vision', protocol: 'openai-completions', baseUrl: 'http://127.0.0.1', credentialRef: 'ref' },
key: 'fixture-secret', signal: new AbortController().signal, usage: vi.fn() })
const branch = (id = 'a') => ({ goal: 'Read the system version', successCriteria: 'Version visible and recorded', eligibleDeviceIds: [id] })

describe('task planning boundary', () => {
  it('preserves independent work and eligible phone sets', () => {
    expect(validatePlan({ kind: 'branches', branches: [branch('a'), branch('b')] }, input())).toEqual({ kind: 'branches', branches: [branch('a'), branch('b')] })
    expect(validatePlan({ kind: 'branches', branches: [{ ...branch(), eligibleDeviceIds: ['a', 'b', 'a'] }] }, input())).toMatchObject({ branches: [{ eligibleDeviceIds: ['a', 'b'] }] })
  })
  it.each(['untrusted', 'invented'])('rejects unauthorized or invented phone %s', id => {
    expect(() => validatePlan({ kind: 'branches', branches: [branch(id)] }, input())).toThrow('authorized')
  })
  it('rejects disconnected phones, duplicate work, empty and oversized plans', () => {
    const disconnected = input(); disconnected.devices[0]!.connected = false
    expect(() => validatePlan({ kind: 'branches', branches: [branch()] }, disconnected)).toThrow('authorized')
    for (const branches of [[], Array.from({ length: 17 }, () => branch())]) expect(() => validatePlan({ kind: 'branches', branches }, input())).toThrow('sixteen')
    expect(() => validatePlan({ kind: 'branches', branches: [branch(), branch()] }, input())).toThrow('Duplicate')
    expect(() => validatePlan({ kind: 'branches', branches: [{ ...branch(), goal: '' }] }, input())).toThrow('nonempty')
  })
  it('records a necessary business clarification without creating work', () => {
    expect(validatePlan({ kind: 'clarification', question: 'Which account contains this order?' }, input())).toEqual({ kind: 'clarification', question: 'Which account contains this order?' })
  })
  it('gives Pi only the planning tool and no credentials in the prompt', async () => {
    let prompt = ''; const abort = vi.fn()
    const create: AgentFactory = options => {
      expect(options.tools.map(t => t.name)).toEqual(['propose_plan'])
      return { abort, steer: vi.fn(), prompt: async text => {
        prompt = text
        await options.tools[0]!.execute({ kind: 'branches', branches: [branch('a'), branch('b')] })
        expect(options.stopped()).toBe(true)
      } }
    }
    const plan = await planTask(create, input())
    expect(plan.kind).toBe('branches'); expect(prompt).not.toContain('fixture-secret'); expect(prompt).not.toContain('credentialRef'); expect(abort).toHaveBeenCalledOnce()
  })
  it('does not accept model prose or late results after cancellation', async () => {
    const noTool: AgentFactory = () => ({ abort: vi.fn(), steer: vi.fn(), prompt: async () => {} })
    await expect(planTask(noTool, input())).rejects.toThrow('valid task plan')
    const controller = new AbortController(); const cancelled = { ...input(), signal: controller.signal }
    const create: AgentFactory = options => ({ abort: vi.fn(), steer: vi.fn(), prompt: async () => {
      controller.abort(new Error('stop')); await options.tools[0]!.execute({ kind: 'branches', branches: [branch()] })
    } })
    await expect(planTask(create, cancelled)).rejects.toThrow('stop')
  })
})
