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
const updater = new URL('../scripts/dev-auto-reload.mjs', import.meta.url)

afterEach(async () => {
  await Promise.all(servers.splice(0).map(server => new Promise<void>(resolve => server.close(() => resolve()))))
  await Promise.all(roots.splice(0).map(root => rm(root, { recursive: true, force: true })))
})

async function fixture(linked = true) {
  const root = await mkdtemp(join(tmpdir(), 'opengui-auto-reload-'))
  roots.push(root)
  const repo = join(root, 'repo')
  const dshHome = join(root, 'dsh-home')
  const profile = join(dshHome, 'profiles', 'web')
  const bin = join(root, 'bin')
  await Promise.all([
    mkdir(join(repo, '.githooks'), { recursive: true }),
    mkdir(profile, { recursive: true }),
    mkdir(bin, { recursive: true }),
  ])
  await writeFile(join(repo, '.githooks', 'post-merge'), '#!/usr/bin/env bash\n')
  await writeFile(join(profile, 'package.json'), JSON.stringify({
    dependencies: { 'dsh-coremate-mobile': linked ? `link:${repo}` : 'file:/tmp/release.tgz' },
  }))
  await exec('git', ['init', '-q'], { cwd: repo })
  return { root, repo, dshHome, bin }
}

describe('linked-checkout auto reload', () => {
  it('installs the versioned post-merge hook only for the linked DSH profile', async () => {
    const value = await fixture()
    await exec(process.execPath, [updater.pathname, 'install'], {
      cwd: value.repo,
      env: { ...process.env, OPENGUI_AUTO_RELOAD_REPO_ROOT: value.repo, DSH_HOME: value.dshHome },
    })
    const { stdout } = await exec('git', ['config', '--get', 'core.hooksPath'], { cwd: value.repo })
    expect(stdout.trim()).toBe('.githooks')

    const packaged = await fixture(false)
    await exec(process.execPath, [updater.pathname, 'install', '--if-linked'], {
      cwd: packaged.repo,
      env: { ...process.env, OPENGUI_AUTO_RELOAD_REPO_ROOT: packaged.repo, DSH_HOME: packaged.dshHome },
    })
    await expect(exec('git', ['config', '--get', 'core.hooksPath'], { cwd: packaged.repo })).rejects.toBeDefined()
  })

  it('builds and safely restarts the managed DSH job after a pull', async () => {
    const value = await fixture()
    const calls = join(value.root, 'calls.log')
    await writeFile(join(value.bin, 'pnpm'), `#!/usr/bin/env bash\nprintf 'pnpm %s\\n' "$*" >> "${calls}"\n`)
    await writeFile(join(value.bin, 'launchctl'), `#!/usr/bin/env bash\nprintf 'launchctl %s\\n' "$*" >> "${calls}"\n`)
    await writeFile(join(value.bin, 'git'), `#!/usr/bin/env bash\nif [[ "$1" == "diff" ]]; then printf 'deepseek-harness-plugin/src/index.ts\\n'; exit 0; fi\nif [[ "$1" == "rev-parse" && "$2" == "--show-prefix" ]]; then printf 'deepseek-harness-plugin/\\n'; exit 0; fi\nif [[ "$1" == "rev-parse" ]]; then printf 'abc1234\\n'; exit 0; fi\nexit 1\n`)
    await Promise.all(['pnpm', 'launchctl', 'git'].map(name => chmod(join(value.bin, name), 0o755)))

    const server = createServer((request, response) => {
      if (request.url === '/coremate-mobile/task/status') {
        if (request.headers.origin !== `http://${request.headers.host}`) {
          response.statusCode = 403
          response.end('forbidden')
          return
        }
        response.setHeader('content-type', 'application/json')
        response.end(JSON.stringify({ active: false }))
      } else {
        response.end('<script>window.__DSH_BOOT__={}</script>')
      }
    })
    servers.push(server)
    await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve))
    const address = server.address()
    if (address === null || typeof address === 'string') throw new Error('missing test server port')

    await exec(process.execPath, [updater.pathname, 'after-pull'], {
      cwd: value.repo,
      env: {
        ...process.env,
        PATH: `${value.bin}:${process.env.PATH ?? ''}`,
        DSH_HOME: value.dshHome,
        OPENGUI_AUTO_RELOAD_REPO_ROOT: value.repo,
        OPENGUI_AUTO_RELOAD_PORT: String(address.port),
        OPENGUI_DSH_LAUNCHD_LABEL: 'com.example.opengui',
        OPENGUI_AUTO_RELOAD_NO_OPEN: '1',
      },
    })

    const log = await readFile(calls, 'utf8')
    expect(log).toContain('pnpm run build')
    expect(log).toContain(`launchctl kickstart -k gui/${process.getuid?.() ?? 0}/com.example.opengui`)
  })

  it('does not restart a desktop application ancestor as though it were a DSH service', async () => {
    const value = await fixture()
    const calls = join(value.root, 'calls.log')
    await writeFile(join(value.bin, 'pnpm'), `#!/usr/bin/env bash\nprintf 'pnpm %s\\n' "$*" >> "${calls}"\n`)
    await writeFile(join(value.bin, 'lsof'), '#!/usr/bin/env bash\nprintf \'321\\n\'\n')
    await writeFile(join(value.bin, 'ps'), '#!/usr/bin/env bash\nprintf \'123\\n\'\n')
    await writeFile(join(value.bin, 'launchctl'), `#!/usr/bin/env bash\nprintf '123\\t0\\tapplication.com.example.desktop.1\\n'\n`)
    await writeFile(join(value.bin, 'git'), `#!/usr/bin/env bash\nif [[ "$1" == "diff" ]]; then printf 'deepseek-harness-plugin/src/index.ts\\n'; exit 0; fi\nif [[ "$1" == "rev-parse" && "$2" == "--show-prefix" ]]; then printf 'deepseek-harness-plugin/\\n'; exit 0; fi\nif [[ "$1" == "rev-parse" ]]; then printf 'abc1234\\n'; exit 0; fi\nexit 1\n`)
    await Promise.all(['pnpm', 'lsof', 'ps', 'launchctl', 'git'].map(name => chmod(join(value.bin, name), 0o755)))

    const server = createServer((request, response) => {
      if (request.url === '/coremate-mobile/task/status') {
        response.setHeader('content-type', 'application/json')
        response.end(JSON.stringify({ active: false }))
      } else {
        response.end('<script>window.__DSH_BOOT__={}</script>')
      }
    })
    servers.push(server)
    await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve))
    const address = server.address()
    if (address === null || typeof address === 'string') throw new Error('missing test server port')

    const { stdout } = await exec(process.execPath, [updater.pathname, 'after-pull'], {
      cwd: value.repo,
      env: {
        ...process.env,
        PATH: `${value.bin}:${process.env.PATH ?? ''}`,
        DSH_HOME: value.dshHome,
        OPENGUI_AUTO_RELOAD_REPO_ROOT: value.repo,
        OPENGUI_AUTO_RELOAD_PORT: String(address.port),
        OPENGUI_AUTO_RELOAD_NO_OPEN: '1',
      },
    })

    expect(await readFile(calls, 'utf8')).toContain('pnpm run build')
    expect(stdout).toContain('not launchd-managed')
  })
})
