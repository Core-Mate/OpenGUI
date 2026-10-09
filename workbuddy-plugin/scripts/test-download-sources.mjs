import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { spawnSync } from 'node:child_process'
import { mkdir, mkdtemp, readFile, realpath, rm, writeFile } from 'node:fs/promises'
import fs from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { createRequire } from 'node:module'
import { runInNewContext } from 'node:vm'

if (process.platform !== 'darwin') { console.log('Download source verification requires macOS.'); process.exit(0) }
const source = resolve(process.argv[2] ?? new URL('./install-macos.command', import.meta.url).pathname)
const original = await readFile(source, 'utf8')
const temporary = await realpath(await mkdtemp(join(tmpdir(), 'opengui-download-source-')))
try {
  const app = join(temporary, 'WorkBuddy.app'), cli = join(app, 'Contents/Resources/app.asar.unpacked/cli'), bin = join(temporary, 'bin')
  await mkdir(join(cli, 'dist'), { recursive: true }); await mkdir(bin)
  await writeFile(join(app, 'Contents/Info.plist'), '<?xml version="1.0"?><plist version="1.0"><dict><key>CFBundleIdentifier</key><string>com.workbuddy.workbuddy</string><key>CFBundleShortVersionString</key><string>5.7.6</string></dict></plist>')
  await writeFile(join(cli, 'product.json'), JSON.stringify({ dataFolderName: '.workbuddy' }))
  await writeFile(join(cli, 'dist/codebuddy.js'), 'UserPromptSubmit PreToolUse Stop SubagentStop FinalStop SessionEnd StopFailure')
  const archive = join(temporary, 'package.tgz')
  await writeFile(archive, 'fixture package')
  await writeFile(archive + '.sha256', createHash('sha256').update('fixture package').digest('hex'))
  // Fail checksum verification before extraction; observe actual selected URLs.
  await writeFile(join(bin, 'curl'), `#!/bin/bash
url= destination=
while [ "$#" -gt 0 ]; do
  case "$1" in https://*) url=$1 ;; -o) shift; destination=$1 ;; esac
  shift
done
printf '%s\\n' "$url" >> "$TEST_FETCH_LOG"
if [ "$TEST_MIRROR_FAIL" = true ] && [[ "$url" == https://npmmirror.com/* ]]; then exit 22; fi
printf 'invalid-node' > "$destination"
`, { mode: 0o755 })
  for (const [name, args, mirrorFail, domains] of [
    ['default', [], false, ['https://npmmirror.com/mirrors/node/']],
    ['official', ['--download-source', 'official'], false, ['https://nodejs.org/dist/']],
    ['fallback', [], true, ['https://npmmirror.com/mirrors/node/', 'https://nodejs.org/dist/']],
  ]) {
    const home = join(temporary, name), log = join(temporary, name + '.urls')
    await mkdir(home)
    const result = spawnSync('bash', [source, '--app', app, '--archive', archive, ...args], { encoding: 'utf8', env: { ...process.env, HOME: home, PATH: bin + ':' + process.env.PATH, OPENGUI_DOWNLOAD_SOURCE: '', OPENGUI_VIDEO_MIRROR: '', WORKBUDDY_CONFIG_DIR: '', CODEBUDDY_CONFIG_DIR: '', WORKBUDDY_INSTANCE_NUMBER: '', TEST_FETCH_LOG: log, TEST_MIRROR_FAIL: String(mirrorFail) } })
    assert.equal(result.status, 1, result.stdout + result.stderr)
    assert.match(result.stderr, /Node checksum mismatch/)
    const urls = (await readFile(log, 'utf8')).trim().split('\n')
    assert.equal(urls.length, domains.length)
    urls.forEach((url, i) => assert(url.startsWith(domains[i]), url))
    assert(!fs.existsSync(join(home, '.workbuddy', 'mcp.json')), 'Failed Node preparation must not write host configuration')
  }
  const payload = original.split("<<'INSTALL_JS'\n")[1]?.split('\nINSTALL_JS\n')[0]
  assert(payload, 'Exercise the actual npm installation payload')
  const realRequire = createRequire(import.meta.url)
  for (const [name, registry, failMirror] of [
    ['cn-npm', 'https://registry.npmmirror.com', false],
    ['official-npm', 'https://registry.npmjs.org', false],
    ['fallback-npm', 'https://registry.npmmirror.com', true],
  ]) {
    const root = join(temporary, name), calls = []
    const execFileSync = (_command, args) => {
      if (args[1] !== 'install') return
      const install = args[args.indexOf('--prefix') + 1], chosen = args[args.indexOf('--registry') + 1]
      calls.push(chosen)
      assert(args.includes('--ignore-scripts'), 'Mirror selection must preserve disabled lifecycle scripts')
      if (failMirror && calls.length === 1) {
        fs.mkdirSync(join(install, 'node_modules'), { recursive: true })
        fs.writeFileSync(join(install, 'node_modules', 'partial-mirror'), 'partial')
        fs.writeFileSync(join(install, 'package-lock.json'), 'mirror tarball URL')
        throw new Error('fixture mirror unavailable')
      }
      assert(!fs.existsSync(join(install, 'node_modules', 'partial-mirror')))
      assert(!fs.existsSync(join(install, 'package-lock.json')))
      const pkg = join(install, 'node_modules/opengui-mcp')
      fs.mkdirSync(pkg, { recursive: true })
      fs.writeFileSync(join(pkg, 'package.json'), JSON.stringify({ name: 'opengui-mcp', version: '0.4.0' }))
    }
    const context = {
      require: name => name === 'node:child_process' ? { execFileSync } : realRequire(name),
      process: { execPath: process.execPath, env: {}, argv: ['node', '-', root, archive, '0.4.0', join(root, 'config'), 'fixture-digest', source, app, 'false', registry] },
      console: { log() {}, error() {} },
    }
    runInNewContext(payload, { ...context })
    assert.deepEqual(calls, failMirror ? [registry, 'https://registry.npmjs.org'] : [registry])
    runInNewContext(payload, context)
    assert.equal(calls.length, failMirror ? 2 : 1, 'A completed cached package must not be reinstalled')
  }
  console.log('PASS: actual Node mirror/official URLs, network fallback, checksum refusal before configuration, npm registry arguments, clean official retry and package-cache reuse.')
} finally { await rm(temporary, { recursive: true, force: true }) }
