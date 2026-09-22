import { createServer } from 'node:http'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { executor } from '../src/phone-agent.ts'
import type { Execution, ModelProfile, Task } from '../../../packages/phone-agent/src/contracts.ts'
import { ObservationId } from '../../../packages/device-runtime/src/actions.ts'

const cleanup: (() => Promise<void>)[] = []
afterEach(async () => { for (const fn of cleanup.splice(0)) await fn() })
async function gateway(protocol: ModelProfile['protocol'], planning = false) {
  let turns = 0
  const requests: Record<string, unknown>[] = []
  const server = createServer((req, res) => {
    void (async () => {
      let body = ''; for await (const part of req) body += String(part)
      requests.push(JSON.parse(body) as Record<string, unknown>)
      const name = planning ? 'propose_plan' : turns++ === 0 ? 'observe' : 'finish'
      const args = planning ? JSON.stringify({ kind: 'branches', branches: [{ goal: 'Read system version', successCriteria: 'System version visible', eligibleDeviceIds: ['a', 'b'] }] }) : name === 'observe' ? '{}' : JSON.stringify({ summary: 'Settings visible', evidenceId: 'frame', status: 'passed' })
      res.writeHead(200, { 'Content-Type': 'text/event-stream' })
      const emit = (data: unknown) => res.write('data: ' + JSON.stringify(data) + '\n\n')
      if (protocol === 'openai-completions') {
        emit({ id: 'completion', choices: [{ index: 0, delta: { role: 'assistant', tool_calls: [{ index: 0, id: 'call-' + turns, type: 'function', function: { name, arguments: args } }] }, finish_reason: null }] })
        emit({ id: 'completion', choices: [{ index: 0, delta: {}, finish_reason: 'tool_calls' }], usage: { prompt_tokens: 10, completion_tokens: 3, total_tokens: 13 } })
        res.end('data: [DONE]\n\n')
      } else {
        const item = { type: 'function_call', id: 'fc-' + turns, call_id: 'call-' + turns, name, arguments: args, status: 'completed' }
        emit({ type: 'response.created', response: { id: 'response-' + turns, model: 'vision', status: 'in_progress', output: [] } })
        emit({ type: 'response.output_item.added', output_index: 0, item: { ...item, arguments: '', status: 'in_progress' } })
        emit({ type: 'response.function_call_arguments.delta', item_id: item.id, output_index: 0, delta: args })
        emit({ type: 'response.output_item.done', output_index: 0, item })
        emit({ type: 'response.completed', response: { id: 'response-' + turns, status: 'completed', output: [item], usage: { input_tokens: 10, output_tokens: 3, total_tokens: 13 } } })
        res.end()
      }
    })().catch(() => res.destroy())
  })
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve))
  cleanup.push(async () => { server.closeAllConnections(); await new Promise<void>(resolve => server.close(() => resolve())) })
  const address = server.address(); if (!address || typeof address === 'string') throw Error('bind')
  return { requests, profile: { id: 'profile', protocol, baseUrl: `http://127.0.0.1:${address.port}/v1`, model: 'vision', credentialRef: 'ref' } satisfies ModelProfile }
}
describe('pinned Pi provider integration', () => {
  for (const protocol of ['openai-completions', 'openai-responses'] as const) it(`plans automatic assignment through ${protocol}`, async () => {
    const { profile, requests } = await gateway(protocol, true)
    const plan = await executor.plan!({ goal: 'Read system version on any phone', profile, key: 'fixture-key', signal: AbortSignal.timeout(5000), usage: vi.fn(),
      devices: ['a', 'b'].map(id => ({ id, name: id, connected: true, authorized: true, state: 'device' })) })
    expect(plan).toMatchObject({ kind: 'branches', branches: [{ eligibleDeviceIds: ['a', 'b'] }] })
    expect(requests).toHaveLength(1)
    expect(JSON.stringify(requests[0])).not.toContain('phone_action')
  })

  for (const protocol of ['openai-completions', 'openai-responses'] as const) it(`runs the image and tool loop through ${protocol}`, async () => {
    const { profile, requests } = await gateway(protocol)
    const finish = vi.fn(async () => {})
    const run: Execution = {
      task: { goal: 'Open settings', successCriteria: 'Settings visible', modelProfile: profile } as Task,
      key: 'fixture-key', signal: AbortSignal.timeout(5000),
      observe: async () => ({ serial: 'fixture', observationId: ObservationId('frame'), width: 1, height: 1, foregroundPackage: 'settings', image: { data: Buffer.from('image'), mediaType: 'image/jpeg', bytes: 5, width: 1, height: 1, name: 'test.jpg' } }),
      act: vi.fn(async () => { throw Error('No mutation expected') }), finish, bindSteer: () => {}, usage: vi.fn(),
    }
    await executor.run(run)
    expect(finish).toHaveBeenCalledWith('Settings visible', [{ criterion: 'Settings visible', status: 'passed', evidenceId: 'frame' }], 'completed')
    expect(requests).toHaveLength(2)
    expect(JSON.stringify(requests[1])).toContain('data:image/jpeg;base64,')
    expect(run.act).not.toHaveBeenCalled()
    expect(run.usage).toHaveBeenCalledWith(10, 3)
  })
})
