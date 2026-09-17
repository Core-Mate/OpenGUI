import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { execFileSync, spawnSync } from 'node:child_process'
import { cp, copyFile, mkdir, mkdtemp, readFile, readdir, realpath, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

if (process.platform !== 'darwin') { console.log('Installer execution requires macOS; shell syntax is checked on every host.'); process.exit(0) }
const root = fileURLToPath(new URL('..', import.meta.url))
const temporary = await realpath(await mkdtemp(join(tmpdir(), 'opengui-codex-installer-')))
try {
  const home = join(temporary, 'home with spaces')
  const codexHome = join(home, '.codex')
  const bin = join(home, 'bin')
  if (process.env.OPENGUI_TEST_VIDEO_CACHE) await cp(process.env.OPENGUI_TEST_VIDEO_CACHE, join(codexHome, 'opengui-codex/scrcpy'), {recursive:true})
  await mkdir(bin, { recursive: true })
  const fixture = join(bin, 'codex')
  await writeFile(fixture, `#!${process.execPath}
const fs = require('fs'), p = require('path');
const state = p.join(process.env.HOME, 'plugins.json');
const args = process.argv.slice(2);
if (args.includes('--help')) process.exit(0);
if (args[1] === 'list') console.log(fs.existsSync(state) ? fs.readFileSync(state, 'utf8') : '{"installed":[]}');
else if (args[1] === 'marketplace') {
 const file = p.join(process.env.HOME, 'market');
 if (args[2] === 'list') { const root = fs.existsSync(file) ? fs.readFileSync(file, 'utf8') : null; console.log(JSON.stringify({marketplaces:root?[{name:'opengui-standalone',root,marketplaceSource:{sourceType:'local',source:root}}]:[]})); }
 else if (args[2] === 'remove') fs.rmSync(file, {force:true});
 else if (fs.existsSync(file)) throw Error('Duplicate marketplace source');
 else fs.writeFileSync(file, args[3]);
}
else if (args[1] === 'add') {
 if (process.env.FAIL_INSTALL) process.exit(7);
 const manifest = JSON.parse(fs.readFileSync(p.join(fs.readFileSync(p.join(process.env.HOME, 'market'), 'utf8'), 'opengui/.codex-plugin/plugin.json')));
 fs.writeFileSync(state, JSON.stringify({installed:[{name:'opengui',marketplaceName:'opengui-standalone',pluginId:'opengui@opengui-standalone',version:manifest.version,enabled:true}]}));
}
`, { mode: 0o755 })
  const runtime = join(codexHome, 'opengui-codex/runtime', `node-v22.23.2-darwin-${process.arch}`)
  await mkdir(join(runtime, 'bin'), { recursive: true })
  await writeFile(join(runtime, 'bin/node'), '#!/bin/sh\nexec ' + JSON.stringify(process.execPath) + ' \"$@\"\n', { mode: 0o755 })
  const digest = createHash('sha256').update(await readFile(join(runtime, 'bin/node'))).digest('hex')
  const archiveSha = process.arch === 'arm64' ? '61130f394c1630d211dd50aecc4353d379480f36d3ac913cd85dbba1aed585c6' : '58e99022c2ff89395576cc7fd4d98cea24bb68081475d5f88b801ee8729fb026'
  await writeFile(join(runtime, '.verified'), archiveSha + '\n' + digest + '\n')
  await writeFile(join(codexHome, 'config.toml'), '# Existing unrelated settings\n')
  const env = { ...process.env, HOME: home, CODEX_HOME: codexHome, PATH: bin + ':' + process.env.PATH }
  const archive = join(root, '.artifacts/opengui-codex-0.3.0.tar.gz')
  const script = join(root, 'scripts/install-macos.command')
  const run = (file = archive, extra = {}) => spawnSync('bash', [script, '--archive', file], { env: { ...env, ...extra }, encoding: 'utf8' })
  const timings = [], started = Date.now()
  let result = run(); timings.push(Date.now() - started); assert.equal(result.status, 0, result.stderr)
  assert.match(result.stdout, /CONFIG_WRITTEN; hostLoaded=unverified/)
  const packageRoot = join(codexHome, 'opengui-codex/packages')
  const installedPackage = join(packageRoot, (await readdir(packageRoot))[0])
  const firstReceipt = (await readdir(installedPackage)).find(name => name.startsWith('install-receipt-'))
  assert(firstReceipt, 'Each attempt must retain an independent recovery receipt')
  const originalInventory = await readFile(join(installedPackage, firstReceipt, 'previous-marketplaces.json'), 'utf8')
  const repeated = Date.now()
  result = run(); timings.push(Date.now() - repeated); assert.equal(result.status, 0, result.stderr)
  assert.equal(await readFile(join(installedPackage, firstReceipt, 'previous-marketplaces.json'), 'utf8'), originalInventory, 'Repeat install must not overwrite original recovery evidence')
  assert.equal((await readdir(installedPackage)).filter(name => name.startsWith('install-receipt-')).length, 2)
  assert.equal(await readFile(join(codexHome, 'config.toml'), 'utf8'), '# Existing unrelated settings\n')
  await writeFile(join(bin, 'curl'), '#!/bin/sh\nexit 22\n', { mode: 0o755 })
  result = spawnSync('bash', [script], { env, encoding: 'utf8' })
  assert.notEqual(result.status, 0); assert.match(result.stderr, /No downloadable codex/)
  const bad = join(temporary, 'bad.tar.gz'); await cp(archive, bad); await writeFile(bad + '.sha256', '0'.repeat(64))
  result = run(bad); assert.notEqual(result.status, 0); assert.match(result.stderr, /checksum mismatch/)
  await writeFile(join(home, 'plugins.json'), '{"installed":[]}')
  result = run(archive, { FAIL_INSTALL: '1' }); assert.notEqual(result.status, 0)
  assert.equal(await readFile(join(codexHome, 'config.toml'), 'utf8'), '# Existing unrelated settings\n')
  await writeFile(join(home, 'plugins.json'), JSON.stringify({ installed: [{ name: 'opengui', marketplaceName: 'personal', pluginId: 'opengui@personal' }] }))
  result = run(); assert.notEqual(result.status, 0); assert.match(result.stderr, /another source/)
  console.log(JSON.stringify({ firstInstallMs: timings[0], repeatInstallMs: timings[1], codexHost: 'fixture', privateNode: 'fixture', videoDownload: process.env.OPENGUI_TEST_VIDEO_CACHE ? 'verified-cache' : 'real' }))
  console.log('PASS: packaged install, repeat install, spaces, checksum rejection, host failure and duplicate-source rejection; existing configuration retained.')
} finally { await rm(temporary, { recursive: true, force: true }) }
