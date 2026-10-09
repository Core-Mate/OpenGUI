import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { mkdtemp, mkdir, readFile, readdir, realpath, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'

if (process.platform !== 'darwin') { console.log('Host discovery verification requires macOS.'); process.exit(0) }
const source = resolve(process.argv[2] ?? new URL('./install-macos.command', import.meta.url).pathname)
const temporary = await realpath(await mkdtemp(join(tmpdir(), 'workbuddy-discovery-')))
try {
  const home = join(temporary, 'home with spaces'), installer = join(temporary, 'installer.command')
  const original = await readFile(source, 'utf8')
  const locations = '/Applications/*.app "$HOME"/Applications/*.app /Volumes/*/*.app'
  assert(original.includes(locations), 'The discovery fixture must replace the actual application search locations')
  // Isolate search locations while exercising the actual installer and PlistBuddy.
  await writeFile(installer, original.replace(locations, '"$HOME"/Applications/*.app "$HOME"/Volumes/*/*.app'))
  await mkdir(home)
  const bundle = async (name, id, folder = '.workbuddy') => {
    const app = join(home, 'Applications', name + '.app')
    const cli = join(app, 'Contents/Resources/app.asar.unpacked/cli')
    await mkdir(join(cli, 'dist'), { recursive: true })
    await writeFile(join(app, 'Contents/Info.plist'), `<?xml version="1.0"?><plist version="1.0"><dict><key>CFBundleIdentifier</key><string>${id}</string><key>CFBundleShortVersionString</key><string>5.7.6</string></dict></plist>`)
    await writeFile(join(cli, 'product.json'), JSON.stringify({ dataFolderName: folder }))
    await writeFile(join(cli, 'dist/codebuddy.js'), 'UserPromptSubmit PreToolUse Stop SubagentStop FinalStop SessionEnd StopFailure')
    return app
  }
  const run = (...args) => spawnSync('bash', [installer, '--check', ...args], {
    encoding: 'utf8', env: { ...process.env, HOME: home, WORKBUDDY_CONFIG_DIR: '', CODEBUDDY_CONFIG_DIR: '', WORKBUDDY_INSTANCE_NUMBER: '', OPENGUI_DOWNLOAD_SOURCE: '', OPENGUI_VIDEO_MIRROR: '' },
  })
  const passes = (result, folder) => {
    assert.equal(result.status, 0, result.stderr + result.stdout)
    assert.match(result.stdout, /PREFLIGHT_OK/)
    assert(result.stdout.includes(join(home, folder)), result.stdout)
  }
  const fails = (result, code) => {
    assert.equal(result.status, 1, result.stderr + result.stdout)
    assert(result.stderr.includes('[' + code + ']'), result.stderr)
  }
  fails(run(), 'HOST_NOT_FOUND')
  const legacy = await bundle('Legacy renamed host', 'com.tencent.workbuddy.mac')
  passes(run(), '.workbuddy')
  passes(run('--app', legacy), '.workbuddy')
  await rm(legacy, { recursive: true })
  const ai = await bundle('A renamed host', 'com.workbuddy.workbuddy-ai', '.workbuddy-ai')
  passes(run('--app', ai), '.workbuddy-ai')
  passes(run(), '.workbuddy-ai')
  const standard = await bundle('Z renamed host', 'com.workbuddy.workbuddy')
  passes(run('--app', standard), '.workbuddy')
  passes(run(), '.workbuddy')
  passes(run('--app', ai), '.workbuddy-ai')
  passes(run('--app', ai, '--config-root', join(home, 'custom')), 'custom')
  const secondaryAi = await bundle('Second AI host', 'com.workbuddy.workbuddy-ai', '.workbuddy-ai')
  passes(run(), '.workbuddy')
  await rm(secondaryAi, { recursive: true })
  const duplicate = await bundle('Another standard host', 'com.workbuddy.workbuddy')
  fails(run(), 'HOST_AMBIGUOUS')
  passes(run('--app', standard), '.workbuddy')
  await rm(duplicate, { recursive: true })
  const unknown = await bundle('WorkBuddy lookalike', 'com.workbuddy.workbuddy-other')
  passes(run(), '.workbuddy')
  fails(run('--app', unknown), 'HOST_IDENTITY')
  fails(run('--app', unknown, '--config-root', join(home, 'custom')), 'HOST_IDENTITY')
  await rm(standard, { recursive: true })
  passes(run(), '.workbuddy-ai')
  const legacyWithAi = await bundle('Legacy alongside AI', 'com.tencent.workbuddy.mac')
  passes(run(), '.workbuddy')
  await rm(legacyWithAi, { recursive: true })
  const duplicateAi = await bundle('Another AI host', 'com.workbuddy.workbuddy-ai', '.workbuddy-ai')
  fails(run(), 'HOST_AMBIGUOUS')
  passes(run('--app', ai), '.workbuddy-ai')
  await rm(duplicateAi, { recursive: true })
  await rm(ai, { recursive: true })
  fails(run(), 'HOST_NOT_FOUND')
  assert.deepEqual(await readdir(home), ['Applications'], 'Read-only preflight must not create configuration or state')
  console.log('PASS: legacy and both WorkBuddy identities, standard-over-AI discovery, explicit AI override, product configuration paths, same-tier ambiguity, unknown identity refusal and zero-write preflight.')
} finally { await rm(temporary, { recursive: true, force: true }) }
