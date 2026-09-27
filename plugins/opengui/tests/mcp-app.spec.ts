import { runInNewContext } from 'node:vm'
import { describe, expect, it, vi } from 'vitest'
import { codexWorkbenchResource } from '../src/mcp-app.ts'

function bootstrap() {
  let receive: (event: unknown) => void = () => {}
  const parent = { postMessage: vi.fn() }
  const replace = vi.fn()
  const status = { textContent: '' }
  runInNewContext(codexWorkbenchResource.split('<script>')[1]!.split('</script>')[0]!, {
    URL, crypto: { randomUUID: () => 'test' }, location: { replace, origin: 'http://127.0.0.1:5678' },
    document: { getElementById: () => status },
    window: { parent, addEventListener: (_: string, listener: typeof receive) => { receive = listener } },
  })
  const send = (data: unknown, source: unknown = parent) => receive({ source, data })
  return { send, parent, replace, status }
}
describe('native resource bootstrap', () => {
  it('waits for initialization and an owning tool result before navigating once', () => {
    const p = bootstrap()
    const result = { jsonrpc: '2.0', method: 'ui/notifications/tool-result', params: { structuredContent: { url: 'http://127.0.0.1:1234/?owner=conversation' } } }
    p.send(result, {})
    p.send({ jsonrpc: '2.0', id: 'opengui-init-test', result: {} })
    expect(p.replace).not.toHaveBeenCalled()
    p.send(result)
    p.send(result)
    expect(p.replace).toHaveBeenCalledExactlyOnceWith('http://127.0.0.1:1234/?owner=conversation&mcpApp=codex&hostOrigin=http%3A%2F%2F127.0.0.1%3A5678')
  })
  it('rejects external, credential-bearing and unbound destinations', () => {
    for (const url of ['https://example.com/', 'http://user:password@127.0.0.1:1234/?owner=conversation', 'http://127.0.0.1:1234/']) {
      const p = bootstrap()
      p.send({ jsonrpc: '2.0', id: 'opengui-init-test', result: {} })
      p.send({ jsonrpc: '2.0', method: 'ui/notifications/tool-result', params: { structuredContent: { url } } })
      expect(p.replace).not.toHaveBeenCalled()
      expect(p.status.textContent).toContain('地址不可用')
    }
  })
})
