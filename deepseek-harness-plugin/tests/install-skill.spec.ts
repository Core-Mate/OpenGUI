import { createServer } from 'node:http'
import { chmod, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { afterEach, describe, expect, it } from 'vitest'

const exec = promisify(execFile)
const roots: string[] = []
const servers: ReturnType<typeof createServer>[] = []
const installer = new URL('../skills/opengui-coremate-install/scripts/install-macos.sh', import.meta.url)

afterEach(async () => {
  await Promise.all(servers.splice(0).map(server => new Promise<void>(resolve => server.close(() => resolve()))))
  await Promise.all(roots.splice(0).map(root => rm(root, { recursive: true, force: true })))
})

async function fixture() {
  const root = await mkdtemp(join(tmpdir(), 'coremate-install-skill-'))
  roots.push(root)
  const bin = join(root, 'bin')
  const release = join(root, 'release', 'v0.1.5')
  const home = join(root, 'dsh-home')
  await Promise.all([mkdir(bin, { recursive: true }), mkdir(release, { recursive: true })])
  const archive = join(release, 'dsh-coremate-mobile-0.1.5.tgz')
  await writeFile(archive, 'verified release fixture')
  const { stdout: checksum } = await exec('shasum', ['-a', '256', archive])
  await writeFile(`${archive}.sha256`, `${checksum.trim().split(/\s+/u)[0]}  dsh-coremate-mobile-0.1.5.tgz\n`)
  await writeFile(join(bin, 'lsof'), '#!/usr/bin/env bash\n[[ "${FAKE_DSH_RUNNING:-0}" == "1" ]]\n')
  await writeFile(join(bin, 'dsh'), `#!/usr/bin/env bash
set -euo pipefail
if [[ "\${1:-}" == "-V" ]]; then printf '%s\\n' "\${FAKE_DSH_VERSION:-0.1.0-rc.7}"; exit 0; fi
profile_dir="\${DSH_HOME}/profiles/web"
mkdir -p "\${profile_dir}/node_modules/dsh-coremate-mobile/lib/types/client"
printf '%s\\n' '{"dependencies":{"dsh-coremate-mobile":"file:fixture"},"dsh":{"profile":{"bundles":["dsh-coremate-mobile"]}}}' > "\${profile_dir}/package.json"
printf '%s\\n' '{"name":"dsh-coremate-mobile","version":"0.1.5"}' > "\${profile_dir}/node_modules/dsh-coremate-mobile/package.json"
printf '%s\\n' 'opengui command host with legacy coremate alias' > "\${profile_dir}/node_modules/dsh-coremate-mobile/lib/index.js"
printf '%s\\n' 'client bundle' > "\${profile_dir}/node_modules/dsh-coremate-mobile/lib/client.js"
printf '%s\\n' 'export {}' > "\${profile_dir}/node_modules/dsh-coremate-mobile/lib/types/client/index.d.ts"
`)
  await Promise.all([chmod(join(bin, 'lsof'), 0o755), chmod(join(bin, 'dsh'), 0o755)])
  return { root, bin, releaseBase: `file://${join(root, 'release')}`, home, archive }
}

async function run(value: Awaited<ReturnType<typeof fixture>>, extraEnv: Record<string, string> = {}) {
  return await exec('bash', [installer.pathname, '--dsh-home', value.home, '--release-base', value.releaseBase, '--no-start', '--no-open'], {
    env: {
      ...process.env,
      PATH: `${value.bin}:${process.env.PATH ?? ''}`,
      COREMATE_INSTALL_PLATFORM_OVERRIDE: 'Darwin',
      COREMATE_INSTALL_NODE_VERSION_OVERRIDE: '24.0.0',
      ...extraEnv,
    },
  })
}

describe('macOS installation Skill', () => {
  it('installs and verifies a first release, then repeats without replacing profile files', async () => {
    const value = await fixture()
    const first = await run(value)
    expect(first.stdout).toContain('Installed and verified dsh-coremate-mobile v0.1.5')
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
})
