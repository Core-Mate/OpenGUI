import type { DeviceInfo } from './device-info.ts'

export interface EnvironmentSpec {
  packageName: string
  expectedVersion?: string
  requiredPermissions: string[]
  requireAccount: boolean
  requireService: boolean
}
export interface EnvironmentCheck {
  id: string
  label: string
  required: boolean
  status: 'passed' | 'failed' | 'unknown'
  source: 'adb' | 'simctl' | 'model_observation'
  detail: string
  observedValue?: string
  evidenceObservationId?: string
}
export interface EnvironmentState {
  spec: EnvironmentSpec
  deviceId: string
  checkedAt?: string
  stale: boolean
  checks: EnvironmentCheck[]
}
export const environmentSpecSchema = {
  type: 'object', additionalProperties: false,
  properties: {
    packageName: { type: 'string', maxLength: 200, pattern: '^[A-Za-z][A-Za-z0-9_]*(\\.[A-Za-z][A-Za-z0-9_]*)+$' },
    expectedVersion: { type: 'string', minLength: 1, maxLength: 100 },
    requiredPermissions: { type: 'array', maxItems: 30, uniqueItems: true, items: { type: 'string', maxLength: 200, pattern: '^[A-Za-z][A-Za-z0-9_]*(\\.[A-Za-z][A-Za-z0-9_]*)+$' } },
    requireAccount: { type: 'boolean', description: 'True only if the task requires an already logged-in test account; do not require it for login tests themselves.' },
    requireService: { type: 'boolean', description: 'True only if a specific test service/environment must be verified on screen. Never infer a test environment from a simulator.' },
  }, required: ['packageName'],
}
const identifier = /^[A-Za-z][A-Za-z0-9_]*(\.[A-Za-z][A-Za-z0-9_]*)+$/u
export function environmentSpec(input: unknown): EnvironmentSpec {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw new Error('environment_spec_invalid')
  const value = input as Record<string, unknown>
  if (Object.keys(value).some(key => !['packageName', 'expectedVersion', 'requiredPermissions', 'requireAccount', 'requireService'].includes(key))
    || typeof value.packageName !== 'string' || value.packageName.length > 200 || !identifier.test(value.packageName)
    || value.expectedVersion !== undefined && (typeof value.expectedVersion !== 'string' || !value.expectedVersion.trim() || value.expectedVersion.length > 100 || /[\u0000-\u001f]/u.test(value.expectedVersion))
    || value.requireAccount !== undefined && typeof value.requireAccount !== 'boolean'
    || value.requireService !== undefined && typeof value.requireService !== 'boolean') throw new Error('environment_spec_invalid')
  const permissions = value.requiredPermissions ?? []
  if (!Array.isArray(permissions) || permissions.length > 30 || permissions.some(item => typeof item !== 'string' || item.length > 200 || !identifier.test(item)) || new Set(permissions).size !== permissions.length) throw new Error('environment_permissions_invalid')
  return { packageName: value.packageName, ...(value.expectedVersion ? { expectedVersion: value.expectedVersion as string } : {}), requiredPermissions: [...permissions].sort(), requireAccount: value.requireAccount === true, requireService: value.requireService === true }
}
export function initialEnvironment(spec: EnvironmentSpec, deviceId: string, os: 'android' | 'ios' = 'android'): EnvironmentState {
  const native = os === 'ios' ? 'simctl' : 'adb'
  const check = (id: string, label: string, source: EnvironmentCheck['source'] = native, required = true): EnvironmentCheck => ({ id, label, required, status: 'unknown', source, detail: '尚未检查' })
  return { spec: structuredClone(spec), deviceId, stale: true, checks: [check(os, os === 'ios' ? 'iOS 模拟器版本' : 'Android 版本'), check('app', '目标应用已安装'),
    check('version', '目标应用版本', native, Boolean(spec.expectedVersion)), ...spec.requiredPermissions.map(name => check(`permission:${name}`, `权限 ${name}`)),
    ...(spec.requireAccount ? [check('account', '所需测试账号', 'model_observation')] : []), ...(spec.requireService ? [check('service', '所需测试服务／环境', 'model_observation')] : []), ...(os === 'android' ? [check('usb', 'USB 文件传输模式', 'adb', false)] : [])] }
}
export function environmentReady(state: EnvironmentState | undefined): boolean { return !state || !state.stale && state.checks.filter(item => item.required).every(item => item.status === 'passed') }
export function environmentSetupAllowed(state: EnvironmentState, action: Record<string, unknown>): boolean {
  return !state.stale && state.checks.filter(item => item.required && item.source !== 'model_observation').every(item => item.status === 'passed')
    && (action.action === 'launch' && action.packageName === state.spec.packageName || action.action === 'wait')
}

/** Only project bounded package/version/grant facts; never return raw dumpsys output. */
export async function inspectAndroidEnvironment(device: DeviceInfo, spec: EnvironmentSpec, run: (args: string[]) => Promise<string>, signal: AbortSignal): Promise<EnvironmentState> {
  const state = initialEnvironment(spec, device.id)
  const put = (id: string, status: EnvironmentCheck['status'], detail: string) => Object.assign(state.checks.find(check => check.id === id)!, { status, detail })
  const results = await Promise.allSettled([run(['shell', 'getprop', 'ro.build.version.sdk']), run(['shell', 'am', 'get-current-user']), run(['shell', 'getprop', 'sys.usb.state'])])
  signal.throwIfAborted()
  const text = (index: number) => results[index]?.status === 'fulfilled' ? String((results[index] as PromiseFulfilledResult<string>).value).trim() : undefined
  const sdk = text(0), user = text(1), usb = text(2)
  if (sdk && /^\d{1,3}$/u.test(sdk)) put('android', Number(sdk) >= 21 ? 'passed' : 'failed', `SDK ${Number(sdk)}；要求 SDK ≥ 21`)
  else put('android', 'unknown', '未能读取 Android SDK 版本')
  if (device.connection === 'network' || device.connection === 'local_simulator') put('usb', 'passed', '当前为网络或模拟器连接，不要求 USB 文件传输')
  else if (usb?.split(',').includes('mtp')) put('usb', 'passed', '已检测到 MTP 文件传输')
  else put('usb', 'unknown', 'ADB 可用，未确认 MTP；可在手机 USB 设置选择传输文件。此项不阻断已可用的 ADB。')
  if (!user || !/^\d{1,5}$/u.test(user)) put('app', 'unknown', '未能确认当前 Android 用户；不能推断该用户已安装应用')
  else {
    const reads = await Promise.allSettled([run(['shell', 'pm', 'path', '--user', user, spec.packageName]), run(['shell', 'dumpsys', 'package', spec.packageName])])
    signal.throwIfAborted()
    const path = reads[0].status === 'fulfilled' ? reads[0].value.trim() : undefined
    const dump = reads[1].status === 'fulfilled' ? reads[1].value : undefined
    const packageMarker = `Package [${spec.packageName}]`
    const sectionStart = dump?.indexOf(packageMarker) ?? -1
    // Shared UID and other package sections cannot satisfy the selected package's checks.
    const packageSection = sectionStart < 0 ? undefined : dump!.slice(sectionStart).split(/\n\s*Package \[/u)[0]!
    const userMatch = packageSection?.match(new RegExp(`^( +)User ${user}:([^\\n]*)`, 'mu'))
    const installed = userMatch && /\binstalled=true\b/u.test(userMatch[2]!)
    if (path && /^(package:\/[^\r\n]+)(\r?\npackage:\/[^\r\n]+)*$/u.test(path) && installed) put('app', 'passed', '当前 Android 用户已安装目标应用')
    else if (path === '' && packageSection !== undefined && userMatch && /\binstalled=false\b/u.test(userMatch[2]!)) put('app', 'failed', '当前 Android 用户未安装目标应用')
    else if (path === '' && dump !== undefined && /Unable to find package|No packages found/u.test(dump)) put('app', 'failed', '未安装目标应用')
    else put('app', 'unknown', '安装状态未能可靠确认；未把命令错误当作未安装')
    {
      const version = packageSection?.match(/^\s*versionName=([^\r\n]{1,100})$/mu)?.[1]?.trim()
      if (version && !/[\u0000-\u001f]/u.test(version)) { state.checks.find(check => check.id === 'version')!.observedValue = version; put('version', !spec.expectedVersion || version === spec.expectedVersion ? 'passed' : 'failed', `实际 ${version}${spec.expectedVersion ? '；要求 ' + spec.expectedVersion : '；未指定要求版本'}`) }
      else put('version', 'unknown', '未能读取目标应用版本')
    }
    const userSection = userMatch ? packageSection!.slice(userMatch.index!).split(new RegExp(`\\n${userMatch[1]}User \\d+:`, 'u'))[0]! : ''
    const installSection = packageSection?.match(/^\s*install permissions:\s*\n([\s\S]*?)(?=\n\s*User \d+:|$)/mu)?.[1] ?? ''
    for (const name of spec.requiredPermissions) {
      const pattern = new RegExp(`^\\s*${name.replace(/\./gu, '\\.')}: granted=(true|false)(?:,|\\s|$)`, 'gmu')
      const grants = [...`${installSection}\n${userSection}`.matchAll(pattern)].map(match => match[1])
      if (grants.length && grants.every(value => value === 'true')) put(`permission:${name}`, 'passed', '当前用户／应用权限已授予')
      else if (grants.includes('false')) put(`permission:${name}`, 'failed', '所需权限未授予；请由用户在手机设置处理')
      else put(`permission:${name}`, 'unknown', '未能读取所需权限，不自动授予或绕过安全设置')
    }
  }
  state.stale = false; state.checkedAt = new Date().toISOString()
  return state
}
