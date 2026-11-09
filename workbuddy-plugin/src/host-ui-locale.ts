import { openSync, readFileSync, fstatSync, closeSync } from 'node:fs'
import { isAbsolute, join } from 'node:path'
import { normalizeUiLocale, type UiLocale } from './ui-i18n.ts'

export interface HostUiContext { configDir?: string; locale?: string }

/** Display metadata from the native host environment, never from model tool arguments. */
export function hostUiContext(env: NodeJS.ProcessEnv = process.env): HostUiContext {
  return parseHostUiContext({ configDir: env.OPENGUI_HOST_CONFIG_DIR?.trim() || env.WORKBUDDY_CONFIG_DIR?.trim() || env.CODEBUDDY_CONFIG_DIR?.trim(), locale: env.WORKBUDDY_MENU_LOCALE })
}

export function parseHostUiContext(value: unknown): HostUiContext {
  const result: HostUiContext = {}
  if (!value || typeof value !== 'object' || Array.isArray(value)) return result
  const input = value as Record<string, unknown>
  if (typeof input.configDir === 'string' && input.configDir.length <= 4096 && !input.configDir.includes('\0') && isAbsolute(input.configDir)) result.configDir = input.configDir
  if (typeof input.locale === 'string' && /^[a-z]{2,3}(?:[-_][a-z0-9]{2,8})*$/iu.test(input.locale) && input.locale.length <= 64) result.locale = input.locale
  return result
}

/** Re-read only the host's display locale so an already-open page can follow settings changes. */
export function readHostUiLocale(context: HostUiContext): UiLocale | undefined {
  if (context.configDir) {
    let fd: number | undefined
    try {
      fd = openSync(join(context.configDir, 'app', 'app-config.json'), 'r')
      if (fstatSync(fd).size <= 256 * 1024) {
        const value: unknown = JSON.parse(readFileSync(fd, 'utf8'))
        const locale = parseHostUiContext(value).locale
        if (locale) return normalizeUiLocale(locale)
      }
    } catch { /* Missing or temporarily incomplete host settings fall back without blocking the UI. */ }
    finally { if (fd !== undefined) closeSync(fd) }
  }
  return context.locale ? normalizeUiLocale(context.locale) : undefined
}
