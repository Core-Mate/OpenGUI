import { readFileSync } from 'node:fs'

/**
 * The official CoreMate account and model service. Every build bundles it by default (see
 * scripts/finalize.mjs), so released packages and source builds sign in without configuration.
 */
export const DEFAULT_ACCOUNT_SERVICE_URL = 'https://cm2backend.dmyh.tech'

/**
 * The account service is fixed per release and users never type it. A build can bundle another
 * service (for example a self-hosted one) through OPENGUI_ACCOUNT_SERVICE_URL or an uncommitted
 * .env.local; the environment variable also overrides at runtime for development. Running from
 * source without a built lib/service-config.json leaves the service unset, as tests expect.
 */
export function bundledServiceUrl(): string | undefined {
  const fromEnv = process.env.OPENGUI_ACCOUNT_SERVICE_URL?.trim()
  if (fromEnv) return fromEnv
  try {
    const config = JSON.parse(readFileSync(new URL('./service-config.json', import.meta.url), 'utf8')) as { accountServiceUrl?: unknown }
    return typeof config.accountServiceUrl === 'string' && config.accountServiceUrl.trim() ? config.accountServiceUrl.trim() : undefined
  } catch { return undefined }
}
