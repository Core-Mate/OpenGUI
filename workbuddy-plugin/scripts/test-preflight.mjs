import assert from 'node:assert/strict'
import { mkdtemp, mkdir, writeFile, rm, access, realpath } from 'node:fs/promises'
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
  await version('5.5.3'); r=run({TEST_PROCESS:join(app,'Contents/MacOS/Electron')}); assert.notEqual(r.status,0); assert.match(r.stderr,/HOST_RESTART_REQUIRED/)
  r=run({TEST_PROCESS:join(app,'Contents/Frameworks/WorkBuddy Helper.app/Contents/MacOS/WorkBuddy Helper')}); assert.notEqual(r.status,0); assert.match(r.stderr,/HOST_RESTART_REQUIRED/)
  await version('5.5.6'); r=run({TEST_PROCESS:join(app,'Contents/MacOS/Electron')}); assert.equal(r.status,0,r.stderr); assert.match(r.stdout,/LIVE_PREFLIGHT_OK/)
  r=run({TEST_PROCESS:join(app,'Contents/Frameworks/WorkBuddy Helper.app/Contents/MacOS/WorkBuddy Helper')}); assert.equal(r.status,0,r.stderr); assert.match(r.stdout,/LIVE_PREFLIGHT_OK/)
  await version('5.5.3')
  r=run({TEST_PROCESS:'/Applications/Unrelated.app/Contents/MacOS/Electron'}); assert.equal(r.status,0,r.stderr)
  r=run({WORKBUDDY_CONFIG_DIR:join(home,'custom')}); assert.equal(r.status,0,r.stderr); assert(r.stdout.includes(join(home,'custom')))
  r=run({WORKBUDDY_INSTANCE_NUMBER:'2'}); assert.equal(r.status,0,r.stderr); assert(r.stdout.includes(join(home,'.workbuddy-2')))
  await product('unknown'); r=run(); assert.notEqual(r.status,0); assert.match(r.stderr,/HOST_CONFIG_UNKNOWN/)
  await product('.workbuddy'); await writeFile(join(cli,'dist/codebuddy.js'),'UserPromptSubmit'); r=run(); assert.notEqual(r.status,0); assert.match(r.stderr,/HOST_HOOKS/)
  console.log('PASS: product-specific paths, old version refusal, live 5.5.6 Electron/helper preflight, older-host restart fallback, custom root, instance suffix, unknown product, missing Hooks and zero-write preflight.')
} finally { await rm(temporary,{recursive:true,force:true}) }
