import { TaskStore } from '../src/task-store.ts'
import { mkdtemp, readFile, rm, symlink, writeFile, stat } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { apkManifest, prepareApk, validatePreparedApk, type ApkRecord, type PreparedApk } from '../src/apk.ts'
import { Workbench } from '../src/workbench.ts'
import { WorkBuddyOpenGuiService } from '../src/service.ts'
import { inspectAndroidEnvironment, initialEnvironment } from '../src/environment.ts'
import { OpenGuiError } from '../src/errors.ts'
import { callOpenGuiTool } from '../src/tools.ts'
import { FakeHost } from './fake-host.ts'
import { setup, connect } from './viewer-fixture.ts'
import { apkFile, compiledManifest } from './apk-fixture.ts'
const resources: Array<() => Promise<unknown>> = []
afterEach(async () => { for (const close of resources.splice(0).reverse()) await close() })
async function directory() { const root = await mkdtemp(join(tmpdir(), 'opengui-apk-test-')); resources.push(() => rm(root, { recursive: true, force: true })); return root }
const signal = () => AbortSignal.timeout(10000)
function mutateAttribute(name: string, mutate: (data: Buffer, offset: number) => void): Buffer {
  const data = Buffer.from(compiledManifest)
  const stringCount = data.readUInt32LE(16), stringsStart = 8 + data.readUInt32LE(28), strings: string[] = []
  for (let index = 0; index < stringCount; index++) { const offset = stringsStart + data.readUInt32LE(36 + index * 4), length = data.readUInt16LE(offset); strings.push(data.subarray(offset + 2, offset + 2 + length * 2).toString('utf16le')) }
  for (let offset = 8; offset < data.length; offset += data.readUInt32LE(offset + 4)) {
    if (data.readUInt16LE(offset) !== 0x102) continue
    const ext = offset + data.readUInt16LE(offset + 2), start = ext + data.readUInt16LE(ext + 8), size = data.readUInt16LE(ext + 10), count = data.readUInt16LE(ext + 12)
    for (let index = 0; index < count; index++) { const at = start + index * size; if (strings[data.readUInt32LE(at + 4)] === name) { mutate(data, at); return data } }
  }
  throw new Error('fixture attribute missing')
}
async function fixture(environment: unknown = { packageName: 'com.example', expectedVersion: '2.3' }, durable = false) {
  const root = await directory(), path = await apkFile(root, { name: '用户 APK $(never-executed).apk' }), store = durable ? new TaskStore(join(root, 'reports')) : undefined, { viewer, sinks } = setup(undefined, store), host = new FakeHost()
  let installed = false
  const run = async (args: string[]) => {
    if (args.includes('ro.build.version.sdk')) return '35'
    if (args.includes('get-current-user')) return '0'
    if (args.includes('sys.usb.state')) return 'adb'
    if (args.includes('path')) return installed ? 'package:/data/app/original.apk' : ''
    if (args.includes('package')) return installed ? '  Package [com.example] (a):\n    versionName=2.3\n    User 0: installed=true\n' : 'Unable to find package: com.example'
    throw new Error('unexpected command')
  }
  const check = vi.fn(async (device, spec, currentSignal) => inspectAndroidEnvironment(device, spec, run, currentSignal))
  const install = vi.fn(async (_device, apk: PreparedApk) => { await validatePreparedApk(apk, signal()); installed = true })
  Object.assign(host, { checkEnvironment: check, installApk: install })
  const service = new WorkBuddyOpenGuiService({ viewers: viewer, host }), currentSignal = signal()
  resources.push(() => service.dispose())
  const display = await service.openViewer(['phone-a'], currentSignal, { owner: 'apk-task' }), page = await connect(display.url, 'phone-a')
  sinks.get('phone-a')!.sendBinary(Buffer.from([2])); await page.receipt()
  const session = await service.openSession(['phone-a'], currentSignal, 'control', { owner: 'apk-task', viewerId: display.viewerId, ...(environment ? { environment } : {}) })
  const call = (command: string, extra = {}) => callOpenGuiTool(service, 'opengui_prepare_apk', { sessionId: session.sessionId, command, ...extra }, currentSignal) as Promise<{ apk: ApkRecord }>
  return { store, root, path, host, viewer, service, currentSignal, display, session, call, install, check }
}

describe('bounded user-requested APK preparation', () => {
  it('reads real aapt2-compiled metadata independently verified by aapt badging', () => {
    expect(apkManifest(compiledManifest)).toEqual({ packageName: 'com.example', versionName: '2.3', versionCode: '42', minSdk: 23, testOnly: true })
  })
  it('rejects plain XML, truncated chunks, corrupt string offsets, oversized attribute arrays and unresolved SDKs', () => {
    expect(() => apkManifest(Buffer.from('<manifest package="com.example"/>'))).toThrow('manifest_invalid')
    expect(() => apkManifest(compiledManifest.subarray(0, -1))).toThrow('manifest_invalid')
    const invalid = Buffer.from(compiledManifest); invalid.writeUInt32LE(0x7fffffff, 36); expect(() => apkManifest(invalid)).toThrow('manifest_invalid')
    const sdk = mutateAttribute('minSdkVersion', (data, at) => { data[at + 15] = 1 }); expect(() => apkManifest(sdk)).toThrow('manifest_invalid')
    const raw = mutateAttribute('package', (data, at) => { data.writeUInt32LE(0, at + 8) }); expect(() => apkManifest(raw)).toThrow('manifest_invalid')
  })
  it('stages exact bytes privately, ignores later original-file changes and rejects staged changes', async () => {
    const root = await directory(), path = await apkFile(root), prepared = await prepareApk(path, 'phone-a', true, signal())
    resources.push(prepared.dispose)
    expect(prepared.record.sha256).toMatch(/^[0-9a-f]{64}$/u)
    expect((await stat(prepared.path)).mode & 0o077).toBe(0)
    const original = await readFile(prepared.path)
    await writeFile(path, 'changed original'); expect(await readFile(prepared.path)).toEqual(original)
    await expect(validatePreparedApk(prepared, signal())).resolves.toBeUndefined()
    await writeFile(prepared.path, Buffer.alloc(original.length)); await expect(validatePreparedApk(prepared, signal())).rejects.toThrow('apk_stage_changed')
  })
  it('rejects symlink sources, duplicate or link manifests and source/manifest size limits', async () => {
    const root = await directory(), path = await apkFile(root), link = join(root, 'link.apk'); await symlink(path, link)
    await expect(prepareApk(link, 'phone-a', true, signal())).rejects.toThrow('apk_file_invalid')
    await expect(prepareApk('relative.apk', 'phone-a', true, signal())).rejects.toThrow('apk_path_invalid')
    await expect(prepareApk(await apkFile(root, { name: 'duplicate.apk', duplicate: true }), 'phone-a', true, signal())).rejects.toThrow('apk_manifest_unsafe')
    await expect(prepareApk(await apkFile(root, { name: 'link-manifest.apk', symlink: true }), 'phone-a', true, signal())).rejects.toThrow('apk_manifest_unsafe')
    await expect(prepareApk(await apkFile(root, { name: 'large-manifest.apk', manifest: Buffer.alloc(2 * 1024 * 1024 + 1) }), 'phone-a', true, signal())).rejects.toThrow('apk_manifest_unsafe')
  })
  it('derives target metadata only from the requested APK and installs the staged original once with fresh preflight', async () => {
    const f = await fixture(null), act = vi.spyOn(f.host, 'act')
    const prepared = await f.call('inspect', { path: f.path, allowTestApk: true })
    expect(prepared.apk).toMatchObject({ packageName: 'com.example', versionName: '2.3', status: 'prepared', fileName: '用户 APK $(never-executed).apk' })
    const image = await f.service.observe(f.session.sessionId, undefined, f.currentSignal)
    await expect(f.service.act(f.session.sessionId, undefined, { action: 'key', key: 'Home', observationId: image.observationId }, f.currentSignal)).rejects.toThrow('apk_not_installed')
    await writeFile(f.path, 'source changed after inspection')
    const result = await f.call('install', { artifactId: prepared.apk.id })
    expect(result.apk.status).toBe('installed'); expect(f.install).toHaveBeenCalledTimes(1); expect(f.check).toHaveBeenCalledTimes(3)
    expect(f.install.mock.calls[0]![1].path).not.toBe(f.path)
    expect(f.service.snapshotSession(f.session.sessionId)).toMatchObject({ devices: [{ operationCount: 2 }], environment: { spec: { packageName: 'com.example', expectedVersion: '2.3' }, stale: false } })
    await expect(f.service.act(f.session.sessionId, undefined, { action: 'key', key: 'Home', observationId: image.observationId }, f.currentSignal)).rejects.toThrow('observe again')
    await expect(f.call('install', { artifactId: prepared.apk.id })).rejects.toThrow('apk_artifact_required')
    await expect(f.call('inspect', { path: f.path, allowTestApk: true })).rejects.toThrow('apk_attempt_recorded')
    expect(act).not.toHaveBeenCalled()
    expect(f.viewer.board(f.display.viewerId).markdown([])).toContain('## APK 准备')
    expect(JSON.stringify(result)).not.toContain('opengui-apk-')
  })
  it('removes private staged copies at session closure while preserving the user original', async () => {
    const f = await fixture(), prepared = await f.call('inspect', { path: f.path, allowTestApk: true })
    let stagedPath = ''
    f.install.mockImplementation(async (_device, artifact) => { stagedPath = artifact.path })
    await f.call('install', { artifactId: prepared.apk.id })
    await expect(stat(stagedPath)).rejects.toMatchObject({ code: 'ENOENT' })
    expect((await stat(f.path)).isFile()).toBe(true)
    const uninstalled = await fixture(), item = await uninstalled.call('inspect', { path: uninstalled.path, allowTestApk: true })
    await uninstalled.service.closeSession(uninstalled.session.sessionId, { outcome: 'blocked', summary: 'Not installed by agreement' })
    expect(item.apk.status).toBe('prepared'); expect(uninstalled.install).not.toHaveBeenCalled()
    expect((await stat(uninstalled.path)).isFile()).toBe(true)
  })

  it('rejects another package/version, changed bytes and unrequested test-only overrides before dispatch', async () => {
    const f = await fixture({ packageName: 'com.other', expectedVersion: '2.3' })
    await expect(f.call('inspect', { path: f.path, allowTestApk: true })).rejects.toThrow('apk_target_mismatch')
    expect(f.viewer.board(f.display.viewerId).apk).toBeUndefined(); expect(f.install).not.toHaveBeenCalled()
    const version = await fixture({ packageName: 'com.example', expectedVersion: '1.0' })
    await expect(version.call('inspect', { path: version.path, allowTestApk: true })).rejects.toThrow('apk_target_mismatch')
    const testOnly = await fixture()
    await expect(testOnly.call('inspect', { path: testOnly.path })).rejects.toThrow('apk_test_only')
    const prepared = await testOnly.call('inspect', { path: testOnly.path, allowTestApk: true })
    await expect(testOnly.call('install', { artifactId: 'foreign' })).rejects.toThrow('apk_artifact_required')
    await expect(testOnly.call('inspect', { path: await apkFile(testOnly.root, { name: 'changed.apk', manifest: mutateAttribute('versionCode', (data, at) => data.writeUInt32LE(43, at + 16)) }), allowTestApk: true })).rejects.toThrow('apk_frozen')
    expect(testOnly.install).not.toHaveBeenCalled(); expect(prepared.apk.status).toBe('prepared')
  })
  it('requires actual scoped human confirmation to replace an installed app and invalidates it when the existing version changes', async () => {
    const f = await fixture(), board = f.viewer.board(f.display.viewerId)
    let existingVersion = '1.0'
    f.check.mockImplementation(async (_device, spec) => {
      const state = initialEnvironment(spec, 'phone-a'); state.stale = false
      state.checks.forEach(item => item.status = 'passed'); state.checks.find(item => item.id === 'version')!.observedValue = existingVersion; return state
    })
    const prepared = await f.call('inspect', { path: f.path, allowTestApk: true })
    expect(prepared.apk.existingApp).toEqual({ version: '1.0' })
    await expect(f.call('install', { artifactId: prepared.apk.id })).rejects.toMatchObject({ code: 'apk_update_confirmation_required' }); expect(f.install).not.toHaveBeenCalled()
    const approve = (version: string, token = new URL(f.display.workbenchUrl).hash.slice(7)) => fetch(`${f.display.url}board`, { method: 'POST', headers: { Origin: new URL(f.display.url).origin, 'Content-Type': 'application/json', 'X-OpenGUI-Board': token }, body: JSON.stringify({ action: 'apk_update_confirm', artifactId: prepared.apk.id, sha256: prepared.apk.sha256, existingVersion: version }) })
    expect((await approve('1.0', 'wrong-capability')).status).toBe(403)
    expect((await approve('wrong-version')).status).not.toBe(200); expect(board.apk?.updateApprovedAt).toBeUndefined()
    expect((await approve('1.0')).status).toBe(200); expect(board.apk?.updateApprovedAt).toEqual(expect.any(String))
    existingVersion = '1.1'
    await expect(f.call('install', { artifactId: prepared.apk.id })).rejects.toMatchObject({ code: 'apk_update_confirmation_required' }); expect(board.apk?.updateApprovedAt).toBeUndefined(); expect(f.install).not.toHaveBeenCalled()
    expect((await approve('1.1')).status).toBe(200)
    await f.call('install', { artifactId: prepared.apk.id }); expect(f.install).toHaveBeenCalledTimes(1)
    expect(board.markdown([])).toContain('用户确认：')
  })

  it('does not infer permission to replace an app when installation state is unknown', async () => {
    const f = await fixture()
    f.check.mockImplementation(async (_device, spec) => { const state = initialEnvironment(spec, 'phone-a'); state.stale = false; return state })
    await expect(f.call('inspect', { path: f.path, allowTestApk: true })).rejects.toThrow('apk_existing_app_unverified')
    expect(f.install).not.toHaveBeenCalled()
    await expect(f.call('install', { artifactId: 'unknown' })).rejects.toThrow('apk_artifact_required')
  })

  it('records definite installation failures and refuses retry or false completion', async () => {
    const f = await fixture(), prepared = await f.call('inspect', { path: f.path, allowTestApk: true })
    f.install.mockRejectedValue(new OpenGuiError('INSTALL_FAILED_UPDATE_INCOMPATIBLE', 'signature mismatch'))
    await expect(f.call('install', { artifactId: prepared.apk.id })).rejects.toThrow('signature mismatch')
    expect((await f.call('read')).apk).toMatchObject({ status: 'failed', code: 'INSTALL_FAILED_UPDATE_INCOMPATIBLE' })
    await expect(f.call('install', { artifactId: prepared.apk.id })).rejects.toThrow('apk_artifact_required')
    await expect(f.service.closeSession(f.session.sessionId, { outcome: 'completed' })).rejects.toThrow('apk_preparation_incomplete')
    expect(f.install).toHaveBeenCalledTimes(1)
  })
  it('records interrupted installation as unknown, cancels it on takeover and never replays after handback', async () => {
    const f = await fixture(), prepared = await f.call('inspect', { path: f.path, allowTestApk: true })
    let start!: () => void; const entered = new Promise<void>(resolve => { start = resolve })
    f.install.mockImplementation((_device, _apk, currentSignal: AbortSignal) => new Promise((_resolve, reject) => { start(); currentSignal.addEventListener('abort', () => reject(currentSignal.reason), { once: true }) }))
    const installing = f.call('install', { artifactId: prepared.apk.id }), rejected = expect(installing).rejects.toThrow('paused')
    await entered; await expect(f.service.observe(f.session.sessionId, undefined, f.currentSignal)).rejects.toThrow('apk_preparation_busy'); await f.service.requestHandoff(f.session.sessionId, 'security', 'Handle installation warning on the phone', 0, f.currentSignal)
    await rejected
    expect((await f.call('read')).apk.status).toBe('unknown'); expect(f.install).toHaveBeenCalledTimes(1)
    expect(f.viewer.board(f.display.viewerId).environment?.stale).toBe(true)
  })
  it('persists installation intent before dispatch and keeps uncertain receipts non-replayable when saving fails', async () => {
    const f = await fixture(undefined, true), board = f.viewer.board(f.display.viewerId), prepared = await f.call('inspect', { path: f.path, allowTestApk: true })
    const save = vi.spyOn(board, 'checkpoint').mockImplementation(() => { if (board.apk?.status === 'installing') throw new Error('disk full') })
    await expect(f.call('install', { artifactId: prepared.apk.id })).rejects.toThrow('disk full')
    expect(f.install).not.toHaveBeenCalled(); expect(board.apk?.status).toBe('prepared')
    save.mockRestore()
    f.install.mockImplementation(async () => { expect(board.apk?.status).toBe('installing'); expect(f.store!.load(f.display.viewerId).board.apk?.status).toBe('installing'); vi.spyOn(board, 'checkpoint').mockImplementation(() => { throw new Error('disk full after install') }) })
    await expect(f.call('install', { artifactId: prepared.apk.id })).rejects.toThrow('disk full after install')
    expect(board.apk?.status).toBe('unknown'); expect(f.install).toHaveBeenCalledTimes(1); expect(new Workbench(f.store!.load(f.display.viewerId).board).apk?.status).toBe('unknown')
    await expect(f.call('install', { artifactId: prepared.apk.id })).rejects.toThrow('apk_artifact_required')
    vi.restoreAllMocks()
  })
  it('restores installation intents as unknown and retains metadata without staging or action authority', async () => {
    const root = await directory(), apk = await prepareApk(await apkFile(root), 'phone-a', true, signal()); resources.push(apk.dispose)
    const board = new Workbench(); board.saveApk({ ...apk.record, status: 'installing' })
    const restored = new Workbench(board.snapshot())
    expect(restored.apk).toMatchObject({ sha256: apk.record.sha256, status: 'unknown' })
    expect(restored.snapshot()).not.toHaveProperty('path')
    expect(() => restored.saveApk({ ...apk.record, sha256: '0'.repeat(64) })).toThrow('apk_frozen')
  })
})
