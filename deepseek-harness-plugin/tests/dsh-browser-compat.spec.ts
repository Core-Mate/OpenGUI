import { createServer } from 'node:http'
import { once } from 'node:events'
import { describe, expect, it } from 'vitest'
import { fetchHostBoot, hostEntryUrl, isOpenGuiClientBundle } from '../scripts/dsh-browser-compat.mjs'

describe('DSH browser compatibility probes', () => {
  it('matches exact legacy and batched client entries without accepting lookalikes', () => {
    expect(isOpenGuiClientBundle('http://localhost/plugins/dsh-coremate-mobile/client.js')).toBe(true)
    expect(isOpenGuiClientBundle('http://localhost/plugins/??other/client.js,dsh-coremate-mobile/client.js&rev=123')).toBe(true)
    expect(isOpenGuiClientBundle('http://localhost/plugins/??other/client.js&rev=dsh-coremate-mobile/client.js')).toBe(false)
    expect(isOpenGuiClientBundle('http://localhost/plugins/??evil-dsh-coremate-mobile/client.js')).toBe(false)
  })

  it('accepts only the token URL for the current isolated host', () => {
    const origin = 'http://127.0.0.1:1234'
    expect(hostEntryUrl(origin, 'dsh web: http://127.0.0.1:1234/?token=fixture')).toBe(`${origin}/?token=fixture`)
    expect(hostEntryUrl(origin, 'dsh web: http://127.0.0.1:9999/?token=fixture')).toBe(origin)
    expect(hostEntryUrl(origin, `dsh web: ${origin}`)).toBe(origin)
  })

  it('exchanges the new launch token for a cookie before checking the ready marker', async () => {
    const server = createServer((req, res) => {
      if (req.url === '/?token=fixture') {
        res.writeHead(303, { Location: '/', 'Set-Cookie': 'dsh_fixture=valid; HttpOnly; Path=/' })
        res.end()
      } else if (req.headers.cookie === 'dsh_fixture=valid') {
        res.end('<script>globalThis.__DSH_BOOT_READY__</script>')
      } else { res.writeHead(401); res.end('unauthorized') }
    })
    server.listen(0, '127.0.0.1')
    await once(server, 'listening')
    const address = server.address() as { port: number }
    const origin = `http://127.0.0.1:${address.port}`
    try {
      expect(await fetchHostBoot(origin, origin)).toBe(false)
      expect(await fetchHostBoot(origin, `${origin}/?token=fixture`)).toBe(true)
    } finally { server.closeAllConnections(); await new Promise<void>(resolve => server.close(() => resolve())) }
  })
})
