import { createServer } from 'node:http'
import { chmod, mkdir, mkdtemp, readFile, realpath, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { afterEach, describe, expect, it } from 'vitest'

const exec = promisify(execFile)
const roots: string[] = []
const servers: ReturnType<typeof createServer>[] = []
const installer = new URL('../skills/opengui-coremate-install/scripts/install-macos.sh', import.meta.url)
const uninstaller = new URL('../skills/opengui-coremate-install/scripts/uninstall-macos.sh', import.meta.url)

afterEach(async () => {
  await Promise.all(servers.splice(0).map(server => new Promise<void>(resolve => server.close(() => resolve()))))
  await Promise.all(roots.splice(0).map(root => rm(root, { recursive: true, force: true })))
})

async function fixture() {
  const root = await mkdtemp(join(tmpdir(), 'coremate-install-skill-'))
  roots.push(root)
  const bin = join(root, 'bin')
  const release = join(root, 'release', 'dsh-coremate-mobile-v0.1.7')
  const home = join(root, 'dsh-home')
  await Promise.all([mkdir(bin, { recursive: true }), mkdir(release, { recursive: true })])
  const archive = join(release, 'dsh-coremate-mobile-0.1.7.tgz')
  await writeFile(archive, 'verified release fixture')
  const { stdout: checksum } = await exec('shasum', ['-a', '256', archive])
  await writeFile(`${archive}.sha256`, `${checksum.trim().split(/\s+/u)[0]}  dsh-coremate-mobile-0.1.7.tgz\n`)
  await writeFile(join(bin, 'lsof'), `#!/usr/bin/env bash
if [[ "\${FAKE_DSH_RUNNING:-0}" == "1" ]]; then
  [[ " $* " == *" -t "* ]] && printf '%s\\n' 4242
  exit 0
fi
if [[ "\${FAKE_DSH_RUNNING:-0}" == "after-start" && " $* " == *" -t "* ]]; then printf '%s\\n' 4343; exit 0; fi
exit 1
`)
  await writeFile(join(bin, 'launchctl'), `#!/usr/bin/env bash
printf '%s\\n' "$*" >> "\${FAKE_LAUNCHCTL_LOG}"
if [[ "\${1:-}" == "print" ]]; then [[ "\${FAKE_MANAGED:-0}" == "1" ]]; else exit 0; fi
`)
  await writeFile(join(bin, 'plutil'), '#!/usr/bin/env bash\nexit 0\n')
  await writeFile(join(bin, 'dsh'), `#!/usr/bin/env bash
set -euo pipefail
if [[ "\${1:-}" == "-V" ]]; then printf '%s\\n' "\${FAKE_DSH_VERSION:-0.1.0-rc.7}"; exit 0; fi
if [[ "\${1:-}" == "plugin" && "\${4:-}" == "remove" ]]; then rm -rf "\${DSH_HOME}/profiles/web/node_modules/dsh-coremate-mobile"; exit 0; fi
profile_dir="\${DSH_HOME}/profiles/web"
mkdir -p "\${profile_dir}/node_modules/dsh-coremate-mobile/lib/types/client"
printf '%s\\n' '{"dependencies":{"dsh-coremate-mobile":"file:fixture"},"dsh":{"profile":{"bundles":["dsh-coremate-mobile"]}}}' > "\${profile_dir}/package.json"
printf '%s\\n' '{"name":"dsh-coremate-mobile","version":"0.1.7"}' > "\${profile_dir}/node_modules/dsh-coremate-mobile/package.json"
printf '%s\\n' 'opengui command host with legacy coremate alias' > "\${profile_dir}/node_modules/dsh-coremate-mobile/lib/index.js"
printf '%s\\n' 'client bundle' > "\${profile_dir}/node_modules/dsh-coremate-mobile/lib/client.js"
printf '%s\\n' 'export {}' > "\${profile_dir}/node_modules/dsh-coremate-mobile/lib/types/client/index.d.ts"
`)
  await Promise.all([
    chmod(join(bin, 'lsof'), 0o755), chmod(join(bin, 'launchctl'), 0o755),
    chmod(join(bin, 'plutil'), 0o755), chmod(join(bin, 'dsh'), 0o755),
  ])
  return { root, bin, releaseBase: `file://${join(root, 'release')}`, home, archive, launchctlLog: join(root, 'launchctl.log') }
}

async function run(value: Awaited<ReturnType<typeof fixture>>, extraEnv: Record<string, string> = {}, start = false) {
  return await exec('bash', [installer.pathname, '--dsh-home', value.home, '--release-base', value.releaseBase, ...(start ? [] : ['--no-start']), '--no-open'], {
    env: {
      ...process.env,
      PATH: `${value.bin}:${process.env.PATH ?? ''}`,
      COREMATE_INSTALL_PLATFORM_OVERRIDE: 'Darwin',
      COREMATE_INSTALL_NODE_VERSION_OVERRIDE: '24.0.0',
      COREMATE_INSTALL_LAUNCH_AGENTS_DIR_OVERRIDE: join(value.root, 'LaunchAgents'),
      FAKE_LAUNCHCTL_LOG: value.launchctlLog,
      ...extraEnv,
    },
  })
}

describe('macOS installation Skill', () => {
  it('downloads the namespaced plugin release from the public OpenGUI repository', async () => {
    const source = await readFile(installer, 'utf8')
    expect(source).toContain('github_repository="Core-Mate/OpenGUI"')
    expect(source).toContain('release_tag="${package_name}-v${release_version}"')
    expect(source).not.toContain('Coremate-Mobile-Plugin')
    expect(source).toContain('<key>KeepAlive</key>')
    expect(source).toContain('launchctl bootstrap')
    expect(source).not.toContain('launchctl submit')
  })

  it('installs and verifies a first release, then repeats without replacing profile files', async () => {
    const value = await fixture()
    const first = await run(value)
    expect(first.stdout).toContain('Installed and verified dsh-coremate-mobile v0.1.7')
    const marker = join(value.home, 'profiles', 'web', 'user-setting.txt')
    await writeFile(marker, 'keep me')
    const repeated = await run(value)
    expect(repeated.stdout).toContain('Preserving existing DSH profile')
    await expect(readFile(marker, 'utf8')).resolves.toBe('keep me')
  })

  it('rejects a checksum mismatch and an incompatible DSH version', async () => {
    const checksum = await fixture()
    await writeFile(checksum.archive, 'tampered after checksum')
    await expect(run(checksum)).rejects.toMatchObject({ stderr: expect.stringContaining('checksum mismatch') })

    const version = await fixture()
    await expect(run(version, { FAKE_DSH_VERSION: '0.1.0-rc.8' }))
      .rejects.toMatchObject({ stderr: expect.stringContaining('Expected DSH 0.1.0-rc.7') })
  })

  it('preserves an existing DSH process and reports that a restart is required', async () => {
    const value = await fixture()
    const server = createServer((_request, response) => { response.end('<script>window.__DSH_BOOT__={}</script>') })
    servers.push(server)
    await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve))
    const address = server.address()
    if (address === null || typeof address === 'string') throw new Error('missing test server port')
    const result = await run(value, { FAKE_DSH_RUNNING: '1', COREMATE_INSTALL_PORT_OVERRIDE: String(address.port) })
    expect(result.stdout).toContain('It was not restarted; restart it manually')
  })

  it('installs a persistent custom LaunchAgent without terminating an unowned DSH process', async () => {
    const value = await fixture()
    const server = createServer((_request, response) => { response.end('<script>window.__DSH_BOOT__={}</script>') })
    servers.push(server)
    await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve))
    const address = server.address()
    if (address === null || typeof address === 'string') throw new Error('missing test server port')

    const result = await run(value, { FAKE_DSH_RUNNING: '1', COREMATE_INSTALL_PORT_OVERRIDE: String(address.port) }, true)
    expect(result.stdout).toContain('is not managed by OpenGUI; leaving it untouched')
    const launchAgents = join(value.root, 'LaunchAgents')
    const { stdout: names } = await exec('find', [launchAgents, '-maxdepth', '1', '-name', 'com.coremate.opengui.web.*.plist', '-print'])
    const plist = names.trim()
    expect(plist).not.toBe('')
    const source = await readFile(plist, 'utf8')
    expect(source).toContain('<key>KeepAlive</key>')
    expect(source).toContain(`<string>${await realpath(value.home)}</string>`)
    expect(source).toContain(`<string>${String(address.port)}</string>`)
    await expect(readFile(value.launchctlLog, 'utf8')).resolves.not.toContain('bootstrap')

    const removed = await exec('bash', [uninstaller.pathname, '--dsh-home', value.home, '--port', String(address.port)], {
      env: {
        ...process.env,
        PATH: `${value.bin}:${process.env.PATH ?? ''}`,
        COREMATE_INSTALL_LAUNCH_AGENTS_DIR_OVERRIDE: launchAgents,
        FAKE_LAUNCHCTL_LOG: value.launchctlLog,
      },
    })
    expect(removed.stdout).toContain('Settings and caches were preserved')
    await expect(readFile(plist, 'utf8')).rejects.toThrow()
    await expect(readFile(value.launchctlLog, 'utf8')).resolves.toContain('bootout gui/')
  })

  it('bootstraps a persistent LaunchAgent and restarts only an already managed instance', async () => {
    const first = await fixture()
    const firstServer = createServer((_request, response) => { response.end('<script>window.__DSH_BOOT__={}</script>') })
    servers.push(firstServer)
    await new Promise<void>(resolve => firstServer.listen(0, '127.0.0.1', resolve))
    const firstAddress = firstServer.address()
    if (firstAddress === null || typeof firstAddress === 'string') throw new Error('missing test server port')
    const started = await run(first, {
      FAKE_DSH_RUNNING: 'after-start', COREMATE_INSTALL_PORT_OVERRIDE: String(firstAddress.port),
    }, true)
    expect(started.stdout).toContain('PID 4343, LaunchAgent com.coremate.opengui.web.')
    const firstLog = await readFile(first.launchctlLog, 'utf8')
    expect(firstLog).toContain('bootstrap gui/')
    expect(firstLog).toContain('kickstart -k gui/')
    expect(firstLog).not.toContain('bootout')

    const managed = await fixture()
    const managedServer = createServer((_request, response) => { response.end('<script>window.__DSH_BOOT__={}</script>') })
    servers.push(managedServer)
    await new Promise<void>(resolve => managedServer.listen(0, '127.0.0.1', resolve))
    const managedAddress = managedServer.address()
    if (managedAddress === null || typeof managedAddress === 'string') throw new Error('missing test server port')
    const restarted = await run(managed, {
      FAKE_DSH_RUNNING: '1', FAKE_MANAGED: '1', COREMATE_INSTALL_PORT_OVERRIDE: String(managedAddress.port),
    }, true)
    expect(restarted.stdout).toContain('PID 4242, LaunchAgent com.coremate.opengui.web.')
    const managedLog = await readFile(managed.launchctlLog, 'utf8')
    expect(managedLog).toContain('bootout gui/')
    expect(managedLog).toContain('bootstrap gui/')
    expect(managedLog).toContain('kickstart -k gui/')
  })
})
