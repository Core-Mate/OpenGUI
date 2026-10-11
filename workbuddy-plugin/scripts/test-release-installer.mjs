import { createHash } from 'node:crypto'
import { createServer } from 'node:net'
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { cp, mkdir, mkdtemp, readFile, realpath, rm, writeFile, readdir } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
if (process.platform !== 'darwin') { console.log('Release installer execution requires macOS.'); process.exit(0) }
const root = fileURLToPath(new URL('..', import.meta.url))
const testCurl = process.argv.includes('--curl')
const deniedCwd = process.argv.includes('--denied-cwd')
const temporary = await realpath(await mkdtemp(join(tmpdir(), 'opengui-workbuddy-installer-')))
try {
 const home = join(temporary, 'home with spaces'), config = join(home, '.workbuddy-ai'), stateRoot = join(home, '.workbuddy/opengui'), bin = join(home, 'bin')
 await mkdir(bin, { recursive: true })
 if (process.env.OPENGUI_TEST_VIDEO_CACHE) await cp(process.env.OPENGUI_TEST_VIDEO_CACHE, join(stateRoot, 'scrcpy'), {recursive:true})
 if (process.env.OPENGUI_TEST_NODE_CACHE) {
  const nodeCache = await realpath(process.env.OPENGUI_TEST_NODE_CACHE)
  await cp(nodeCache, join(stateRoot, 'runtime', nodeCache.split('/').at(-1)), {recursive:true})
 }
 // Model an open desktop in an isolated configuration; never quit the real app.
 const app = join(temporary, 'WorkBuddy AI.app')
 const cli = join(app, 'Contents/Resources/app.asar.unpacked/cli')
 await mkdir(join(cli,'dist'), {recursive:true})
 await writeFile(join(app,'Contents/Info.plist'), '<?xml version="1.0"?><plist version="1.0"><dict><key>CFBundleIdentifier</key><string>com.tencent.workbuddy.mac</string><key>CFBundleExecutable</key><string>Electron</string><key>CFBundleShortVersionString</key><string>5.5.3</string></dict></plist>')
 await writeFile(join(cli,'product.json'), JSON.stringify({dataFolderName:'.workbuddy-ai'}))
 await writeFile(join(cli,'dist/codebuddy.js'), 'UserPromptSubmit PreToolUse Stop SubagentStop FinalStop SessionEnd StopFailure')
 await writeFile(join(bin, 'ps'), '#!/bin/sh\nprintf "%s\\n" "$TEST_APP/Contents/MacOS/Electron"\n', {mode:0o755})
 await writeFile(join(bin, 'pgrep'), '#!/bin/sh\nexit 1\n', {mode:0o755})
 await mkdir(config, {recursive:true})
 await writeFile(join(config, 'mcp.json'), JSON.stringify({mcpServers:{other:{command:'keep-me'}}}))
 await writeFile(join(config, 'settings.json'), JSON.stringify({custom:true,hooks:{Stop:[{hooks:[{type:'command',command:'other-hook'}]}]}}))
 const archive = join(root, 'dist/opengui-mcp-0.4.1.tgz')
 const installer = testCurl ? join(root, 'install.sh') : process.argv[2] ?? join(root, 'scripts/install-macos.command')
 const bootstrapSource = testCurl ? await readFile(installer, 'utf8') : undefined
 const opened = join(temporary, 'opened-guides.txt')
 if (testCurl) {
  await writeFile(join(bin, 'curl'), `#!/bin/bash
url= target=
for ((i=1; i<=$#; i++)); do
 arg=\${!i}
 case "$arg" in https://*) url=$arg ;; -o) ((i+=1)); target=\${!i} ;; esac
done
case "$url" in
 https://raw.githubusercontent.com/Core-Mate/OpenGUI/main/workbuddy-plugin/scripts/install-macos.command) cp "$TEST_SOURCE/scripts/install-macos.command" "$target" ;;
 https://raw.githubusercontent.com/Core-Mate/OpenGUI/main/workbuddy-plugin/resources/OpenGUI-*) cp "$TEST_SOURCE/resources/OpenGUI-授权指南.html" "$target" ;;
 *) exec /usr/bin/curl "$@" ;;
esac
`, {mode:0o755})
  await writeFile(join(bin, 'open'), '#!/bin/bash\nprintf "%s\\n" "$1" >> "$TEST_OPEN_LOG"\n', {mode:0o755})
 }
 const launchDirectory = join(temporary, 'restricted launch directory')
 await mkdir(launchDirectory)
 const sandboxProfile = `(version 1) (allow default) (deny file-read-metadata (subpath ${JSON.stringify(launchDirectory)}))`
 const run = (extra={}) => spawnSync(deniedCwd ? '/usr/bin/sandbox-exec' : 'bash', [...(deniedCwd ? ['-p', sandboxProfile, 'bash'] : []), ...(testCurl ? ['-s', '--'] : [installer]), '--archive', archive, ...(!testCurl && process.argv[2] ? [] : ['--app', app])], {encoding:'utf8',cwd:launchDirectory,input:bootstrapSource,env:{...process.env,HOME:home,WORKBUDDY_CONFIG_DIR:'',CODEBUDDY_CONFIG_DIR:'',WORKBUDDY_INSTANCE_NUMBER:'',TEST_APP:app,TEST_SOURCE:root,TEST_OPEN_LOG:opened,PATH:bin+':'+process.env.PATH,...extra}})
 const originalMcp = await readFile(join(config,'mcp.json'),'utf8')
 assert.equal(JSON.parse(originalMcp).mcpServers.opengui, undefined)
 let result
 const timings = []
 for (let i=0;i<2;i++) {
  if (i === 1) {
   const plist = join(app,'Contents/Info.plist')
   await writeFile(plist, (await readFile(plist,'utf8')).replace('5.5.3','5.7.6'))
  }
  const started = Date.now()
  result=run(); assert.equal(result.status,0,result.stderr+'\n'+result.stdout)
  const mcp=JSON.parse(await readFile(join(config,'mcp.json'))), settings=JSON.parse(await readFile(join(config,'settings.json')))
  assert.equal(mcp.mcpServers.other.command,'keep-me'); assert.equal(settings.custom,true)
  assert.equal(settings.hooks.Stop.length,2, JSON.stringify({iteration:i, settings, stdout:result.stdout, stderr:result.stderr}))
  assert.match(await readFile(join(config,'skills/opengui/SKILL.md'),'utf8'),/opengui/)
  timings.push(Date.now() - started)
  assert.doesNotMatch(result.stdout, /LIVE_CONFIG_WRITTEN/)
  assert.match(result.stdout, /fully quit WorkBuddy with Command-Q, then reopen it once/)
  if (i === 0) assert.match(result.stdout, /CONFIG_WRITTEN/)
  else assert.match(result.stdout, /ALREADY_CONFIGURED/)
  const state=JSON.parse(await readFile(join(stateRoot,`local-install-${createHash('sha256').update(config).digest('hex').slice(0,16)}.json`)))
  assert.equal(state.version,'0.4.1'); assert.equal(state.configRoot, config); assert(state.backups.every(b=>b.backup===null || b.backup.includes('before-opengui')))
  if (testCurl) {
   const receiptPath = result.stdout.match(/INSTALLATION_RESULT: (.+)/)?.[1]
   assert(receiptPath, result.stdout)
   const receipt = await readFile(receiptPath, 'utf8')
   assert.match(receipt, /status=configuration_written/)
   assert.match(receipt, /hostLoaded=unverified/)
   const guides = (await readFile(opened, 'utf8')).trim().split('\n')
   assert.equal(guides.length, i + 1)
   assert((await readFile(guides.at(-1))).equals(await readFile(join(root, 'resources/OpenGUI-授权指南.html'))))
  }
  assert((await readFile(join(state.packageDir,'scripts/install-local.mjs'),'utf8')).includes('mergeHostHooks'))
 }
 assert.equal((await readdir(join(stateRoot, 'packages'))).length, 1, 'Repeat installation must reuse the same package directory')
 // An open host is allowed, but an existing OpenGUI service must still block upgrades.
 const port = 43000 + createHash('sha256').update(stateRoot).digest().readUInt32BE(0) % 10000
 const oldService = createServer(socket => socket.end())
 await new Promise((resolve, reject) => { oldService.once('error', reject); oldService.listen(port, '127.0.0.1', resolve) })
 try {
  const beforeMcp = await readFile(join(config,'mcp.json'),'utf8')
  const beforeSettings = await readFile(join(config,'settings.json'),'utf8')
  result=run(); assert.notEqual(result.status,0); assert.match(result.stderr + result.stdout,/upgrade_blocked/)
  assert.equal(await readFile(join(config,'mcp.json'),'utf8'),beforeMcp)
  assert.equal(await readFile(join(config,'settings.json'),'utf8'),beforeSettings)
  if (testCurl) assert.equal((await readFile(opened, 'utf8')).trim().split('\n').length, 2, 'A blocked upgrade must not open the authorization guide')
 } finally { await new Promise(resolve => oldService.close(resolve)) }

 console.log(JSON.stringify({curlEntry:testCurl, deniedCwd, firstInstallMs:timings[0], repeatInstallMs:timings[1]}))
 console.log('PASS: real release installer with a synthetic WorkBuddy bundle/process fixture, open desktop installation on 5.5.3 and 5.7.6, native dependency import, active service upgrade refusal, retained foreign MCP/Hooks, idempotency, paths with spaces and rollback receipts; real host loading remains unverified.')
} finally { await rm(temporary,{recursive:true,force:true}) }
