import { createServer } from 'node:http'
import { access, chmod, mkdir, mkdtemp, readFile, realpath, rm, writeFile } from 'node:fs/promises'
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
  const release = join(root, 'release', 'dsh-coremate-mobile-v0.1.10')
  const home = join(root, 'dsh-home')
  await Promise.all([mkdir(bin, { recursive: true }), mkdir(release, { recursive: true })])
  const archive = join(release, 'dsh-coremate-mobile-0.1.10.tgz')
  await writeFile(archive, 'verified release fixture')
  const { stdout: checksum } = await exec('shasum', ['-a', '256', archive])
  await writeFile(`${archive}.sha256`, `${checksum.trim().split(/\s+/u)[0]}  dsh-coremate-mobile-0.1.10.tgz\n`)
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
state="\${FAKE_LAUNCHCTL_STATE:-}"
case "\${1:-}" in
  print)
    if [[ -n "$state" && -f "$state" ]]; then exit 0; else exit 1; fi
    ;;
  bootout)
    [[ "\${FAKE_BOOTOUT_FAIL:-0}" != "1" ]] || exit 55
    [[ -z "$state" ]] || rm -f "$state"
    ;;
  bootstrap)
    [[ -z "$state" ]] || touch "$state"
    ;;
esac
exit 0
`)
  await writeFile(join(bin, 'plutil'), '#!/usr/bin/env bash\nexit 0\n')
  await writeFile(join(bin, 'dsh'), `#!/usr/bin/env bash
set -euo pipefail
if [[ "\${1:-}" == "-V" ]]; then printf '%s\\n' "\${FAKE_DSH_VERSION:-\${FAKE_GLOBAL_DSH_VERSION:-0.1.0-rc.7}}"; exit 0; fi
if [[ "\${1:-}" == "plugin" && "\${4:-}" == "remove" ]]; then
  [[ "\${FAKE_DSH_REMOVE_FAIL:-0}" != "1" ]] || exit 42
  rm -rf "\${DSH_HOME}/profiles/web/node_modules/dsh-coremate-mobile"
  printf '%s\\n' '{"dependencies":{},"dsh":{"profile":{"bundles":[]}}}' > "\${DSH_HOME}/profiles/web/package.json"
  exit 0
fi
profile_dir="\${DSH_HOME}/profiles/web"
mkdir -p "\${profile_dir}/node_modules/dsh-coremate-mobile/lib/types/client"
printf '%s\\n' '{"dependencies":{"dsh-coremate-mobile":"file:fixture"},"dsh":{"profile":{"bundles":["dsh-coremate-mobile"]}}}' > "\${profile_dir}/package.json"
printf '%s\\n' '{"name":"dsh-coremate-mobile","version":"0.1.10"}' > "\${profile_dir}/node_modules/dsh-coremate-mobile/package.json"
printf '%s\\n' 'opengui command host with legacy coremate alias' > "\${profile_dir}/node_modules/dsh-coremate-mobile/lib/index.js"
printf '%s\\n' 'client bundle' > "\${profile_dir}/node_modules/dsh-coremate-mobile/lib/client.js"
printf '%s\\n' 'export {}' > "\${profile_dir}/node_modules/dsh-coremate-mobile/lib/types/client/index.d.ts"
`)
  await writeFile(join(bin, 'pnpm'), `#!/usr/bin/env bash
set -euo pipefail
[[ "\${FAKE_PNPM_FAIL:-0}" != "1" ]] || exit 99
if [[ "\${1:-}" == "--dir" ]]; then
  runtime_dir="$2"
  managed_dsh="\${runtime_dir}/node_modules/.bin/dsh"
  mkdir -p "$(dirname "$managed_dsh")"
  printf '#!/usr/bin/env bash\\nFAKE_DSH_VERSION=0.1.0-rc.7 exec "%s" "$@"\\n' "$(dirname "$0")/dsh" > "$managed_dsh"
  chmod 755 "$managed_dsh"
  exit 0
fi
if [[ "\${1:-}" == "dlx" ]]; then shift 2; fi
FAKE_DSH_VERSION=0.1.0-rc.7 exec "$(dirname "$0")/dsh" "$@"
`)
  await Promise.all([
    chmod(join(bin, 'lsof'), 0o755), chmod(join(bin, 'launchctl'), 0o755),
    chmod(join(bin, 'plutil'), 0o755), chmod(join(bin, 'dsh'), 0o755), chmod(join(bin, 'pnpm'), 0o755),
  ])
  return {
    root, bin, releaseBase: `file://${join(root, 'release')}`, home, archive,
    launchctlLog: join(root, 'launchctl.log'), launchctlState: join(root, 'launchctl.state'),
  }
}

async function run(
  value: Awaited<ReturnType<typeof fixture>>,
  extraEnv: Record<string, string> = {},
  start = false,
  version: string | null = '0.1.10',
) {
  return await exec('bash', [
    installer.pathname,
    ...(version === null ? [] : ['--version', version]),
    '--dsh-home', value.home,
    '--release-base', value.releaseBase,
    ...(start ? [] : ['--no-start']),
    '--no-open',
  ], {
    env: {
      ...process.env,
      PATH: `${value.bin}:${process.env.PATH ?? ''}`,
      COREMATE_INSTALL_PLATFORM_OVERRIDE: 'Darwin',
      COREMATE_INSTALL_NODE_VERSION_OVERRIDE: '24.0.0',
      COREMATE_INSTALL_LAUNCH_AGENTS_DIR_OVERRIDE: join(value.root, 'LaunchAgents'),
      FAKE_LAUNCHCTL_LOG: value.launchctlLog,
      FAKE_LAUNCHCTL_STATE: value.launchctlState,
      ...extraEnv,
    },
  })
}

describe('macOS installation Skill', () => {
  it('downloads the namespaced plugin release from the public OpenGUI repository', async () => {
    const source = await readFile(installer, 'utf8')
    expect(source).toContain('github_repository="Core-Mate/OpenGUI"')
    expect(source).toContain('/releases?per_page=100')
    expect(source).toContain('release_tag="${package_name}-v${release_version}"')
    expect(source).not.toContain('Coremate-Mobile-Plugin')
    expect(source).toContain('<key>KeepAlive</key>')
    expect(source).toContain('launchctl bootstrap')
    expect(source).not.toContain('launchctl submit')
  })

  it('resolves the newest stable namespaced release when no version is specified', async () => {
    const value = await fixture()
    const server = createServer((request, response) => {
      response.setHeader('content-type', 'application/json')
      const url = new URL(request.url ?? '/', `http://${request.headers.host}`)
      if (url.searchParams.get('page') === '2') {
        response.end(JSON.stringify([
          { tag_name: 'dsh-coremate-mobile-v0.1.10', draft: false, prerelease: false },
          { tag_name: 'dsh-coremate-mobile-v0.1.10', draft: true, prerelease: false },
        ]))
        return
      }
      response.setHeader('link', `<http://${request.headers.host}/releases?page=2>; rel="next"`)
      response.end(JSON.stringify([
        { tag_name: 'unrelated-v9.9.9', draft: false, prerelease: false },
        { tag_name: 'dsh-coremate-mobile-v0.2.0', draft: false, prerelease: true },
        { tag_name: 'dsh-coremate-mobile-v0.1.6', draft: false, prerelease: false },
      ]))
    })
    servers.push(server)
    await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve))
    const address = server.address()
    if (address === null || typeof address === 'string') throw new Error('missing release API test port')

    const result = await run(value, {
      COREMATE_INSTALL_RELEASES_API_OVERRIDE: `http://127.0.0.1:${address.port}/releases`,
    }, false, null)
    expect(result.stdout).toContain('Resolving the latest stable OpenGUI plugin release')
    expect(result.stdout).toContain('Using OpenGUI plugin v0.1.10')
    expect(result.stdout).toContain('Installed and verified dsh-coremate-mobile v0.1.10')
  })

  it('installs and verifies a first release, then repeats without replacing profile files', async () => {
    const value = await fixture()
    const first = await run(value)
    expect(first.stdout).toContain('Installed and verified dsh-coremate-mobile v0.1.10')
    const marker = join(value.home, 'profiles', 'web', 'user-setting.txt')
    await writeFile(marker, 'keep me')
    const repeated = await run(value)
    expect(repeated.stdout).toContain('Preserving existing DSH profile')
    await expect(readFile(marker, 'utf8')).resolves.toBe('keep me')
  })

  it('uses an already compatible DSH without depending on a package-manager launcher', async () => {
    const value = await fixture()
    const result = await run(value, { FAKE_PNPM_FAIL: '1' })
    expect(result.stdout).toContain('Installed and verified dsh-coremate-mobile v0.1.10')
  })

  it('rejects a checksum mismatch and uses the pinned CLI when PATH has an incompatible DSH', async () => {
    const checksum = await fixture()
    await writeFile(checksum.archive, 'tampered after checksum')
    await expect(run(checksum)).rejects.toMatchObject({ stderr: expect.stringContaining('checksum mismatch') })

    const version = await fixture()
    const result = await run(version, { FAKE_GLOBAL_DSH_VERSION: '0.1.2-alpha.3' })
    expect(result.stdout).toContain('Detected DSH 0.1.2-alpha.3 on PATH')
    expect(result.stdout).toContain('will use the compatible version for the web profile')
    expect(result.stdout).toContain('Installing managed DSH 0.1.0-rc.7')
    expect(result.stdout).toContain('Installed and verified dsh-coremate-mobile v0.1.10')
    await expect(access(join(version.home, 'runtime/dsh-0.1.0-rc.7/node_modules/.bin/dsh'))).resolves.toBeUndefined()
  })

  it('preserves an existing DSH process and reports that a restart is required', async () => {
    const value = await fixture()
    const server = createServer((_request, response) => { response.end('<script>window.__DSH_BOOT__={}</script>') })
    servers.push(server)
    await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve))
    const address = server.address()
    if (address === null || typeof address === 'string') throw new Error('missing test server port')
    const result = await run(value, { FAKE_DSH_RUNNING: '1', COREMATE_INSTALL_PORT_OVERRIDE: String(address.port) })
    expect(result.stdout).toContain('Quit that DSH process, then rerun this installer without --no-start')
  })

  it('installs a persistent custom LaunchAgent without terminating an unowned DSH process', async () => {
    const value = await fixture()
    const server = createServer((_request, response) => { response.end('<script>window.__DSH_BOOT__={}</script>') })
    servers.push(server)
    await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve))
    const address = server.address()
    if (address === null || typeof address === 'string') throw new Error('missing test server port')

    const result = await run(value, {
      FAKE_DSH_RUNNING: '1', FAKE_GLOBAL_DSH_VERSION: '0.1.2-alpha.3',
      COREMATE_INSTALL_PORT_OVERRIDE: String(address.port),
    }, true)
    expect(result.stdout).toContain('is not managed by OpenGUI; leaving it untouched')
    const launchAgents = join(value.root, 'LaunchAgents')
    const { stdout: names } = await exec('find', [launchAgents, '-maxdepth', '1', '-name', 'com.coremate.opengui.web.*.plist', '-print'])
    const plist = names.trim()
    expect(plist).not.toBe('')
    const source = await readFile(plist, 'utf8')
    expect(source).toContain('<key>KeepAlive</key>')
    expect(source).toContain(`<string>${await realpath(value.home)}</string>`)
    expect(source).toContain(`<string>${String(address.port)}</string>`)
    expect(source).toContain(`${await realpath(value.home)}/runtime/dsh-0.1.0-rc.7/node_modules/.bin/dsh`)
    await expect(readFile(value.launchctlLog, 'utf8')).resolves.not.toContain('bootstrap')

    await writeFile(value.launchctlState, 'loaded')
    await expect(exec('bash', [uninstaller.pathname, '--dsh-home', value.home, '--port', String(address.port)], {
      env: {
        ...process.env,
        PATH: `${value.bin}:${process.env.PATH ?? ''}`,
        COREMATE_INSTALL_LAUNCH_AGENTS_DIR_OVERRIDE: launchAgents,
        FAKE_LAUNCHCTL_LOG: value.launchctlLog,
        FAKE_LAUNCHCTL_STATE: value.launchctlState,
        FAKE_BOOTOUT_FAIL: '1',
      },
    })).rejects.toMatchObject({ stderr: expect.stringContaining('OpenGUI remains installed') })
    await expect(readFile(plist, 'utf8')).resolves.toContain('<key>KeepAlive</key>')
    await expect(readFile(join(value.home, 'profiles/web/node_modules/dsh-coremate-mobile/package.json'), 'utf8'))
      .resolves.toContain('0.1.10')
    await expect(readFile(value.launchctlState, 'utf8')).resolves.toBe('loaded')

    await expect(exec('bash', [uninstaller.pathname, '--dsh-home', value.home, '--port', String(address.port)], {
      env: {
        ...process.env,
        PATH: `${value.bin}:${process.env.PATH ?? ''}`,
        COREMATE_INSTALL_LAUNCH_AGENTS_DIR_OVERRIDE: launchAgents,
        FAKE_LAUNCHCTL_LOG: value.launchctlLog,
        FAKE_LAUNCHCTL_STATE: value.launchctlState,
        FAKE_GLOBAL_DSH_VERSION: '0.1.2-alpha.3',
        FAKE_DSH_REMOVE_FAIL: '1',
      },
    })).rejects.toMatchObject({
      code: 1,
      stderr: expect.stringContaining('The LaunchAgent definition was preserved'),
    })
    await expect(readFile(plist, 'utf8')).resolves.toContain('<key>KeepAlive</key>')
    await expect(readFile(value.launchctlState, 'utf8')).resolves.toBe('')

    const removed = await exec('bash', [uninstaller.pathname, '--dsh-home', value.home, '--port', String(address.port)], {
      env: {
        ...process.env,
        PATH: `${value.bin}:${process.env.PATH ?? ''}`,
        COREMATE_INSTALL_LAUNCH_AGENTS_DIR_OVERRIDE: launchAgents,
        FAKE_LAUNCHCTL_LOG: value.launchctlLog,
        FAKE_LAUNCHCTL_STATE: value.launchctlState,
        FAKE_GLOBAL_DSH_VERSION: '0.1.2-alpha.3',
      },
    })
    expect(removed.stdout).toContain('Settings and caches were preserved')
    await expect(readFile(plist, 'utf8')).rejects.toThrow()
    await expect(readFile(value.launchctlLog, 'utf8')).resolves.toContain('bootout gui/')

    const repeated = await exec('bash', [uninstaller.pathname, '--dsh-home', value.home, '--port', String(address.port)], {
      env: {
        ...process.env,
        PATH: `${value.bin}:${process.env.PATH ?? ''}`,
        COREMATE_INSTALL_LAUNCH_AGENTS_DIR_OVERRIDE: launchAgents,
        FAKE_LAUNCHCTL_LOG: value.launchctlLog,
        FAKE_LAUNCHCTL_STATE: value.launchctlState,
      },
    })
    expect(repeated.stdout).toContain('Settings and caches were preserved')
  })

  it('preserves the installation when the profile manifest cannot be inspected', async () => {
    for (const manifestState of ['malformed', 'missing', 'absent'] as const) {
      const value = await fixture()
      const server = createServer((_request, response) => { response.end('<script>window.__DSH_BOOT__={}</script>') })
      servers.push(server)
      await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve))
      const address = server.address()
      if (address === null || typeof address === 'string') throw new Error('missing test server port')
      await run(value, {
        FAKE_DSH_RUNNING: 'after-start', COREMATE_INSTALL_PORT_OVERRIDE: String(address.port),
      }, true)
      const launchAgents = join(value.root, 'LaunchAgents')
      const { stdout: names } = await exec('find', [
        launchAgents, '-maxdepth', '1', '-name', 'com.coremate.opengui.web.*.plist', '-print',
      ])
      const plist = names.trim()
      const manifest = join(value.home, 'profiles/web/package.json')
      if (manifestState === 'malformed') await writeFile(manifest, '{broken')
      else if (manifestState === 'missing') await rm(manifest)
      else await writeFile(manifest, '{"dependencies":{},"dsh":{"profile":{"bundles":[]}}}\n')
      await writeFile(value.launchctlState, 'loaded')

      await expect(exec('bash', [
        uninstaller.pathname, '--dsh-home', value.home, '--port', String(address.port),
      ], {
        env: {
          ...process.env,
          PATH: `${value.bin}:${process.env.PATH ?? ''}`,
          COREMATE_INSTALL_LAUNCH_AGENTS_DIR_OVERRIDE: launchAgents,
          FAKE_LAUNCHCTL_LOG: value.launchctlLog,
          FAKE_LAUNCHCTL_STATE: value.launchctlState,
        },
      })).rejects.toMatchObject({
        code: 1,
        stderr: expect.stringContaining('OpenGUI remains installed'),
      })
      await expect(readFile(plist, 'utf8')).resolves.toContain('<key>KeepAlive</key>')
      await expect(readFile(value.launchctlState, 'utf8')).resolves.toBe('loaded')
      await expect(readFile(join(value.home, 'profiles/web/node_modules/dsh-coremate-mobile/package.json'), 'utf8'))
        .resolves.toContain('0.1.10')
      await expect(readFile(value.launchctlLog, 'utf8')).resolves.not.toContain('bootout')
    }
  }, 20_000)

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
    await writeFile(managed.launchctlState, 'loaded')
    const restarted = await run(managed, {
      FAKE_DSH_RUNNING: '1', COREMATE_INSTALL_PORT_OVERRIDE: String(managedAddress.port),
    }, true)
    expect(restarted.stdout).toContain('PID 4242, LaunchAgent com.coremate.opengui.web.')
    const managedLog = await readFile(managed.launchctlLog, 'utf8')
    expect(managedLog).toContain('bootout gui/')
    expect(managedLog).toContain('bootstrap gui/')
    expect(managedLog).toContain('kickstart -k gui/')
  }, 10_000)
})
