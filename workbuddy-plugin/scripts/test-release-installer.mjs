import { createHash } from 'node:crypto'
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { cp, mkdir, mkdtemp, readFile, realpath, rm, writeFile, readdir } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
if (process.platform !== 'darwin') { console.log('Release installer execution requires macOS.'); process.exit(0) }
const root = fileURLToPath(new URL('..', import.meta.url))
const temporary = await realpath(await mkdtemp(join(tmpdir(), 'opengui-workbuddy-installer-')))
try {
 const home = join(temporary, 'home with spaces'), config = join(home, '.workbuddy-ai'), stateRoot = join(home, '.workbuddy/opengui'), bin = join(home, 'bin')
 await mkdir(bin, { recursive: true })
 if (process.env.OPENGUI_TEST_VIDEO_CACHE) await cp(process.env.OPENGUI_TEST_VIDEO_CACHE, join(stateRoot, 'scrcpy'), {recursive:true})
 // Only the isolated test host is considered stopped; never quit the real app.
 const app = join(temporary, 'WorkBuddy AI.app')
 const cli = join(app, 'Contents/Resources/app.asar.unpacked/cli')
 await mkdir(join(cli,'dist'), {recursive:true})
 await writeFile(join(app,'Contents/Info.plist'), '<?xml version="1.0"?><plist version="1.0"><dict><key>CFBundleIdentifier</key><string>com.tencent.workbuddy.mac</string><key>CFBundleShortVersionString</key><string>5.5.3</string></dict></plist>')
 await writeFile(join(cli,'product.json'), JSON.stringify({dataFolderName:'.workbuddy-ai'}))
 await writeFile(join(cli,'dist/codebuddy.js'), 'UserPromptSubmit PreToolUse Stop SubagentStop FinalStop SessionEnd StopFailure')
 await writeFile(join(bin, 'ps'), '#!/bin/sh\nif [ "$TEST_HOST_RUNNING" = 0 ]; then printf "%s\\n" "$TEST_APP/Contents/MacOS/Electron"; fi\n', {mode:0o755})
 await writeFile(join(bin, 'pgrep'), '#!/bin/sh\nexit 1\n', {mode:0o755})
 await mkdir(config, {recursive:true})
 await writeFile(join(config, 'mcp.json'), JSON.stringify({mcpServers:{other:{command:'keep-me'}}}))
 await writeFile(join(config, 'settings.json'), JSON.stringify({custom:true,hooks:{Stop:[{hooks:[{type:'command',command:'other-hook'}]}]}}))
 const archive = join(root, 'dist/opengui-mcp-0.3.0.tgz')
 const installer = process.argv[2] ?? join(root, 'scripts/install-macos.command')
 const run = (extra={}) => spawnSync('bash', [installer, '--archive', archive, ...(process.argv[2] ? [] : ['--app', app])], {encoding:'utf8',env:{...process.env,HOME:home,WORKBUDDY_CONFIG_DIR:'',CODEBUDDY_CONFIG_DIR:'',WORKBUDDY_INSTANCE_NUMBER:'',TEST_APP:app,PATH:bin+':'+process.env.PATH,...extra}})
 let result=run({TEST_HOST_RUNNING:'0'}); assert.notEqual(result.status,0); assert.match(result.stderr,/Quit WorkBuddy/)
 const timings = []
 for (let i=0;i<2;i++) {
  const started = Date.now()
  result=run(); assert.equal(result.status,0,result.stderr+'\n'+result.stdout)
  const mcp=JSON.parse(await readFile(join(config,'mcp.json'))), settings=JSON.parse(await readFile(join(config,'settings.json')))
  assert.equal(mcp.mcpServers.other.command,'keep-me'); assert.equal(settings.custom,true)
  assert.equal(settings.hooks.Stop.length,2, JSON.stringify({iteration:i, settings, stdout:result.stdout, stderr:result.stderr}))
  assert.match(await readFile(join(config,'skills/opengui/SKILL.md'),'utf8'),/opengui/)
  timings.push(Date.now() - started)
  if (i === 1) assert.match(result.stdout, /ALREADY_CONFIGURED/)
  const state=JSON.parse(await readFile(join(stateRoot,`local-install-${createHash('sha256').update(config).digest('hex').slice(0,16)}.json`)))
  assert.equal(state.version,'0.3.0'); assert.equal(state.configRoot, config); assert(state.backups.every(b=>b.backup===null || b.backup.includes('before-opengui')))
  assert((await readFile(join(state.packageDir,'scripts/install-local.mjs'),'utf8')).includes('mergeHostHooks'))
 }
 assert.equal((await readdir(join(stateRoot, 'packages'))).length, 1, 'Repeat installation must reuse the same package directory')
 console.log(JSON.stringify({firstInstallMs:timings[0], repeatInstallMs:timings[1]}))
 console.log('PASS: real prebuilt npm install, native dependency import, packaged config installer, upgrade, retained foreign MCP/Hooks, paths with spaces and running-host rejection.')
} finally { await rm(temporary,{recursive:true,force:true}) }
