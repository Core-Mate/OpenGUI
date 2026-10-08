import { existsSync, lstatSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs'
import { randomUUID } from 'node:crypto'
import { join } from 'node:path'
import { bundledServiceUrl } from './service-config.ts'

/** A phone model configured in the existing admin Agent config (gui-agent-core, text kind, CN). */
export interface ConfiguredModel {
  /** The numeric admin configuration ID; inference goes through the backend proxy by this ID. */
  id: string
  name: string
  model: string
  protocol: 'openai_chat' | 'openai_responses'
  /** The configuration's updatedAt when selected; the proxy always uses the current configuration. */
  revision: string
  /** The configuration the administrator marked active, shown as the recommended choice. */
  recommended?: boolean
  reasoningEffort?: 'low' | 'medium' | 'high'
  /** Admin override of the model's native coordinate convention; otherwise inferred from the model family. */
  coordinateSpace?: CoordinateSpace
}
export type CoordinateSpace = 'screenshot_pixels' | 'normalized_1000'

/**
 * Screenshot pixels by default (DeepSeek and others follow the stated image size). Qwen and
 * Doubao keep emitting 0-1000 relative coordinates, so only they are converted from that space;
 * an admin config extra `guiAgentCoreCoordinateSpace` overrides either way.
 */
export function modelCoordinateSpace(model: Pick<ConfiguredModel, 'model' | 'coordinateSpace'>): CoordinateSpace {
  if (model.coordinateSpace) return model.coordinateSpace
  return /qwen|doubao/iu.test(model.model) ? 'normalized_1000' : 'screenshot_pixels'
}
export interface Account { id: string; name: string; phone: string }
interface Profile { serviceUrl: string; token?: string; user?: Account; preferredModel?: string; preferences?: Record<string, { model?: string; device?: string }> }

/** Provider keys stay at the unified service. Only the user's session lives locally. */
export class CoreMateClient {
  private profile: Profile = { serviceUrl: '' }
  private readonly path: string
  /** A release-bundled account service; users cannot change it. */
  private readonly fixedServiceUrl: string | undefined
  constructor(directory: string, private readonly request: typeof fetch = fetch, fixedServiceUrl: string | undefined = bundledServiceUrl()) {
    mkdirSync(directory, { recursive: true, mode: 0o700 })
    const info = lstatSync(directory)
    if (!info.isDirectory() || info.isSymbolicLink() || (process.platform !== 'win32' && (info.uid !== process.getuid?.() || (info.mode & 0o077)))) throw new Error('unsafe_account_directory')
    this.path = join(directory, 'account.json')
    if (existsSync(this.path)) {
      const saved = lstatSync(this.path)
      if (!saved.isFile() || saved.isSymbolicLink() || (process.platform !== 'win32' && (saved.uid !== process.getuid?.() || (saved.mode & 0o077)))) throw new Error('unsafe_account_file')
      this.profile = JSON.parse(readFileSync(this.path, 'utf8')) as Profile
      if (this.profile.serviceUrl) this.url(this.profile.serviceUrl)
    }
    this.clearModelPreferences()
    this.fixedServiceUrl = fixedServiceUrl ? this.url(fixedServiceUrl) : undefined
    // A session for any other service is not valid against the bundled one.
    if (this.fixedServiceUrl && this.profile.serviceUrl !== this.fixedServiceUrl) this.save(this.signedOut(this.fixedServiceUrl))
  }
  get scope(): string { return this.profile.user ? `${this.profile.serviceUrl}|${this.profile.user.id}` : 'local' }
  status() { return { serviceUrl: this.profile.serviceUrl, serviceFixed: Boolean(this.fixedServiceUrl), user: this.profile.user ?? null } }
  get preferredDeviceId(): string | undefined {
    const id = this.profile.user ? this.profile.preferences?.[this.scope]?.device : undefined
    return typeof id === 'string' && /^[A-Za-z0-9_-]{1,160}$/u.test(id) ? id : undefined
  }
  selectDevice(id: string): void {
    if (!/^[A-Za-z0-9_-]{1,160}$/u.test(id)) throw new Error('invalid_preferred_device')
    if (!this.profile.user || this.preferredDeviceId === id) return
    this.save({ ...this.profile, preferences: { ...this.profile.preferences, [this.scope]: { ...this.profile.preferences?.[this.scope], device: id } } })
  }
  private signedOut(serviceUrl = this.profile.serviceUrl): Profile { return { serviceUrl, ...(this.profile.preferences ? { preferences: this.profile.preferences } : {}) } }
  /** Compatibility for older local callers; this release only follows WorkBuddy. */
  selectModel(_id?: string): void { this.clearModelPreferences() }
  async selectedModel(_signal: AbortSignal): Promise<ConfiguredModel | undefined> { return undefined }
  private clearModelPreferences(): void {
    const { preferredModel: previous, ...profile } = this.profile
    let changed = previous !== undefined
    const preferences = Object.fromEntries(Object.entries(profile.preferences ?? {}).map(([scope, value]) => {
      const { model, ...preference } = value
      changed ||= model !== undefined
      return [scope, preference]
    }))
    if (changed) this.save({ ...profile, preferences })
  }
  private url(value: string): string {
    const url = new URL(value)
    if (url.username || url.password || url.search || url.hash || (url.protocol !== 'https:' && !(url.protocol === 'http:' && ['127.0.0.1', 'localhost', '[::1]'].includes(url.hostname)))) throw new Error('invalid_service_url: use HTTPS or a local development service')
    return url.toString().replace(/\/+$/u, '')
  }
  private save(profile: Profile): void {
    const temporary = `${this.path}.${randomUUID()}.tmp`
    writeFileSync(temporary, JSON.stringify(profile), { mode: 0o600, flag: 'wx' })
    renameSync(temporary, this.path)
    this.profile = profile
  }
  configure(serviceUrl: string): void {
    const url = this.url(serviceUrl)
    if (this.fixedServiceUrl && url !== this.fixedServiceUrl) throw new Error('service_fixed: the account service is bundled with this release')
    if (url !== this.profile.serviceUrl) this.save(this.signedOut(url))
  }
  private async api(path: string, body?: unknown, signal = AbortSignal.timeout(60_000), upstream = false): Promise<Record<string, any>> {
    if (!this.profile.serviceUrl) throw new Error('service_not_configured: configure the unified service in the account dialog')
    const { serviceUrl, token } = this.profile
    const apiBase = serviceUrl.endsWith('/api') ? serviceUrl : `${serviceUrl}/api`
    const response = await this.request(`${apiBase}/${path}`, {
      method: body === undefined ? 'GET' : 'POST', redirect: 'error', signal: AbortSignal.any([signal, AbortSignal.timeout(upstream ? 180_000 : 60_000)]),
      headers: { 'content-type': 'application/json', ...(token ? { authorization: `Bearer ${token}` } : {}) },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    })
    const result = await response.json().catch(() => null)
    // The model proxy relays provider statuses; only the backend's own rejection means the session expired.
    if (upstream && !response.ok && !(response.status === 401 && result?.statusCode === 401)) throw new Error(`model_upstream_error: HTTP ${response.status}`)
    if (response.status === 401) {
      if (path === 'user-auth/verify-otp') throw new Error('invalid_login_code')
      if (this.profile.serviceUrl === serviceUrl && this.profile.token === token) this.save(this.signedOut())
      throw new Error('login_required: sign in to the unified account')
    }
    if (response.status === 404) throw new Error(`service_route_unavailable: ${path.startsWith('user-auth/') ? 'auth' : 'models'}`)
    if (!response.ok || result?.success === false) throw new Error(`unified_service_error: HTTP ${response.status}`)
    if (!result || typeof result !== 'object') throw new Error('invalid_service_response')
    return result.data ?? result
  }
  async sendOtp(phoneNumber: string): Promise<void> {
    if (!/^1[3-9][0-9]{9}$/u.test(phoneNumber)) throw new Error('invalid_phone_number')
    await this.api('user-auth/send-otp', { phoneNumber })
  }
  async login(phoneNumber: string, code: string): Promise<void> {
    if (!/^1[3-9][0-9]{9}$/u.test(phoneNumber) || !/^[0-9]{6}$/u.test(code)) throw new Error('invalid_login_input')
    const result = await this.api('user-auth/verify-otp', { phoneNumber, code, region: 'CN' })
    if (typeof result.token !== 'string' || !result.token || !result.user?.id) throw new Error('invalid_login_response')
    this.save({ ...this.signedOut(), token: result.token, user: this.account(result.user) })
  }
  private account(user: Record<string, any>): Account {
    return { id: String(user.id), name: String(user.name ?? ''), phone: String(user.phoneNumber ?? '').replace(/^(\d{3})\d{4}(\d{4})$/u, '$1****$2') }
  }
  async session(): Promise<void> {
    if (!this.profile.token) return
    const result = await this.api('user-auth/session')
    if (!result.user?.id) throw new Error('invalid_session_response')
    this.save({ ...this.profile, user: this.account(result.user) })
  }
  async logout(): Promise<void> {
    if (this.profile.token) await this.api('user-auth/sign-out', {})
    this.save(this.signedOut())
  }
  /** Legacy local route: no online model catalog is read in this release. */
  async models(_signal?: AbortSignal): Promise<ConfiguredModel[]> { return [] }
  async infer(model: ConfiguredModel, body: Record<string, unknown>, signal: AbortSignal): Promise<Record<string, any>> {
    if (!/^[1-9][0-9]{0,15}$/u.test(model.id)) throw new Error('model_not_configured: select a model from the current admin configuration')
    const endpoint = model.protocol === 'openai_responses' ? 'responses' : 'chat/completions'
    return this.api(`agent-config/runtime/proxy/${model.id}/v1/${endpoint}`, { ...body, stream: false, ...(model.reasoningEffort ? { reasoning_effort: model.reasoningEffort } : {}) }, signal, true)
  }
}
