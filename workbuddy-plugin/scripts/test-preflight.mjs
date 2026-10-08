import assert from 'node:assert/strict'
import { mkdtemp, mkdir, writeFile, rm, access, realpath, chmod, lstat, symlink } from 'node:fs/promises'
import { spawnSync } from 'node:child_process'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
const script = resolve(process.argv[2] ?? new URL('./install-macos.command', import.meta.url).pathname)
if (process.platform !== 'darwin') process.exit(0)
const temporary = await realpath(await mkdtemp(join(tmpdir(), 'workbuddy-preflight-')))
try {
  const app = join(temporary, 'Renamed WorkBuddy AI.app'), home = join(temporary, 'home'), bin = join(temporary, 'bin')
  const cli = join(app, 'Contents/Resources/app.asar.unpacked/cli')
  await mkdir(join(cli, 'dist'), { recursive: true }); await mkdir(home); await mkdir(bin)
  await writeFile(join(bin, 'ps'), '#!/bin/sh\nprintf "%s\\n" "$TEST_PROCESS"\n', {mode: 0o755})
  const plist = version => `<?xml version="1.0"?><plist version="1.0"><dict><key>CFBundleIdentifier</key><string>com.tencent.workbuddy.mac</string><key>CFBundleShortVersionString</key><string>${version}</string><key>CFBundleExecutable</key><string>Electron</string></dict></plist>`
  const product = folder => writeFile(join(cli, 'product.json'), JSON.stringify({dataFolderName: folder}))
  const version = v => writeFile(join(app, 'Contents/Info.plist'), plist(v))
  await version('5.5.3'); await product('.workbuddy-ai')
  await writeFile(join(cli, 'dist/codebuddy.js'), 'UserPromptSubmit PreToolUse Stop SubagentStop FinalStop SessionEnd StopFailure')
  const run = (extra = {}, args = []) => spawnSync('bash', [script, '--check', '--app', app, ...args], {encoding:'utf8',env:{...process.env, HOME:home, PATH:bin+':'+process.env.PATH, WORKBUDDY_CONFIG_DIR:'',CODEBUDDY_CONFIG_DIR:'',WORKBUDDY_INSTANCE_NUMBER:'',TEST_PROCESS:'',...extra}})
  let r = run(); assert.equal(r.status, 0, r.stderr); assert.match(r.stdout, /PREFLIGHT_OK/); assert(r.stdout.includes(join(home,'.workbuddy-ai')))
  await assert.rejects(access(join(home,'.workbuddy-ai')))
  await product('.workbuddy'); r=run(); assert.equal(r.status,0,r.stderr); assert(r.stdout.includes(join(home,'.workbuddy')))
  await writeFile(join(cli,'product.json'), JSON.stringify({dataFolderName:'.workbuddy',config:{customUserDataDir:'.workbuddy-ai'}}))
  r=run(); assert.equal(r.status,0,r.stderr); assert(r.stdout.includes(join(home,'.workbuddy-ai')))
  await writeFile(join(cli,'product.json'), JSON.stringify({dataFolderName:'.workbuddy',config:{customUserDataDir:'.unknown-brand'}}))
  r=run(); assert.notEqual(r.status,0); assert.match(r.stderr,/HOST_CONFIG_UNKNOWN/)
  await product('.workbuddy')
  await version('5.5.2'); r=run(); assert.notEqual(r.status,0); assert.match(r.stderr,/HOST_TOO_OLD/)
  for (const hostVersion of ['5.5.3', '5.5.6', '5.7.6', '6.0.0']) {
    await version(hostVersion)
    for (const process of [join(app,'Contents/MacOS/Electron'), join(app,'Contents/MacOS/Electron')+' --some-option', join(app,'Contents/Frameworks/WorkBuddy Helper.app/Contents/MacOS/WorkBuddy Helper')]) {
      r=run({TEST_PROCESS:process}); assert.equal(r.status,0,r.stderr)
      assert.match(r.stdout,/PREFLIGHT_OK/)
      assert.doesNotMatch(r.stdout,/supports live configuration|desktop is stopped/)
      await assert.rejects(access(join(home,'.workbuddy')), 'Preflight must not write configuration while WorkBuddy is open')
    }
    await writeFile(join(bin, 'ps'), '#!/bin/sh\necho "Operation not permitted" >&2\nexit 1\n', {mode: 0o755})
    r=run(); assert.equal(r.status,0,r.stderr)
    await writeFile(join(bin, 'ps'), '#!/bin/sh\nprintf "%s\\n" "$TEST_PROCESS"\n', {mode: 0o755})
  }
  r=run({TEST_PROCESS:'/Applications/Unrelated.app/Contents/MacOS/Electron'}); assert.equal(r.status,0,r.stderr)
  r=run({WORKBUDDY_CONFIG_DIR:join(home,'custom')}); assert.equal(r.status,0,r.stderr); assert(r.stdout.includes(join(home,'custom')))
  r=run({WORKBUDDY_INSTANCE_NUMBER:'2'}); assert.equal(r.status,0,r.stderr); assert(r.stdout.includes(join(home,'.workbuddy-2')))
  await product('unknown'); r=run(); assert.notEqual(r.status,0); assert.match(r.stderr,/HOST_CONFIG_UNKNOWN/)
  await product('.workbuddy'); await writeFile(join(cli,'dist/codebuddy.js'),'UserPromptSubmit'); r=run(); assert.notEqual(r.status,0); assert.match(r.stderr,/HOST_HOOKS/)
  await rm(join(cli, 'dist/codebuddy.js'))
  await version('5.6.2')
  for (const name of ['codebuddy-headless.js', 'codebuddy-lite-wb.mjs']) {
    await writeFile(join(cli, 'dist', name), 'UserPromptSubmit PreToolUse Stop SubagentStop FinalStop SessionEnd StopFailure')
    r=run(); assert.equal(r.status,0,r.stderr); assert.match(r.stdout,/PREFLIGHT_OK/)
    await writeFile(join(cli, 'dist', name), 'UserPromptSubmit PreToolUse')
    r=run(); assert.notEqual(r.status,0); assert.match(r.stderr,/HOST_HOOKS/)
    await rm(join(cli, 'dist', name))
  }
  // Reused cache directories must satisfy the runtime's owner-only state contract.
  await writeFile(join(cli, 'dist/codebuddy-headless.js'), 'UserPromptSubmit PreToolUse Stop SubagentStop FinalStop SessionEnd StopFailure')
  const stateRoot = join(home, '.workbuddy/opengui')
  await mkdir(stateRoot, {recursive:true})
  await chmod(join(home, '.workbuddy'), 0o755)
  await chmod(stateRoot, 0o755)
  r=run(); assert.equal(r.status,0,r.stderr)
  assert.equal((await lstat(stateRoot)).mode & 0o777, 0o755, 'Preflight must not change permissions')
  const installUntilArchiveCheck = () => spawnSync('bash', [script, '--app', app, '--archive', join(temporary, 'absent.tgz')], {
    encoding:'utf8', env:{...process.env,HOME:home,WORKBUDDY_CONFIG_DIR:'',CODEBUDDY_CONFIG_DIR:'',WORKBUDDY_INSTANCE_NUMBER:''},
  })
  r=installUntilArchiveCheck(); assert.notEqual(r.status,0); assert.match(r.stderr,/Archive and adjacent/)
  assert.equal((await lstat(stateRoot)).mode & 0o777, 0o700, 'Installation must make reused OpenGUI state private')
  assert.equal((await lstat(join(home, '.workbuddy'))).mode & 0o777, 0o755, 'Do not change host directory permissions')
  await rm(stateRoot, {recursive:true})
  const redirected = join(temporary, 'redirected-state')
  await mkdir(redirected); await chmod(redirected, 0o755)
  await symlink(redirected, stateRoot)
  r=installUntilArchiveCheck(); assert.notEqual(r.status,0); assert.match(r.stderr,/Refusing symlink/)
  assert.equal((await lstat(redirected)).mode & 0o777, 0o755, 'Do not chmod symlink targets')
  console.log('PASS: reused state permissions repaired, host permissions preserved, symlink target untouched, preflight remains read-only.')
  console.log('PASS: product-specific paths, old version refusal, open-desktop compatibility on all supported versions, 5.6.2 CLI names with all Hooks, no process-enumeration permission required, custom root, instance suffix, unknown product, missing Hooks and zero-write preflight.')
} finally { await rm(temporary,{recursive:true,force:true}) }
