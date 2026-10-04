import { afterEach, describe, expect, it } from 'vitest'
import { DEFAULT_ACCOUNT_SERVICE_URL, bundledServiceUrl } from '../src/service-config.ts'

const saved = process.env.OPENGUI_ACCOUNT_SERVICE_URL
afterEach(() => { if (saved === undefined) delete process.env.OPENGUI_ACCOUNT_SERVICE_URL; else process.env.OPENGUI_ACCOUNT_SERVICE_URL = saved })

describe('bundled account service', () => {
  it('defaults releases to the official HTTPS service', () => {
    const url = new URL(DEFAULT_ACCOUNT_SERVICE_URL)
    expect(url.protocol).toBe('https:')
    expect(url.pathname + url.search + url.hash + url.username).toBe('/')
  })

  it('lets the environment select another service and leaves source runs unset', () => {
    process.env.OPENGUI_ACCOUNT_SERVICE_URL = ' https://self-hosted.example.test '
    expect(bundledServiceUrl()).toBe('https://self-hosted.example.test')
    delete process.env.OPENGUI_ACCOUNT_SERVICE_URL
    expect(bundledServiceUrl()).toBeUndefined()
  })
})
