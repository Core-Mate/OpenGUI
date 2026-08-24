#!/usr/bin/env node

import { chmod, mkdir, readFile, realpath, rm } from 'node:fs/promises'
import { dirname, isAbsolute, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { execFile, spawn } from 'node:child_process'
import { promisify } from 'node:util'

const exec = promisify(execFile)
const packageName = 'dsh-coremate-mobile'
const repoRoot = resolve(process.env.OPENGUI_AUTO_RELOAD_REPO_ROOT
  ?? join(dirname(fileURLToPath(import.meta.url)), '..'))
const dshHome = resolve(process.env.DSH_HOME ?? join(process.env.HOME ?? '', '.dsh'))
const profile = process.env.OPENGUI_AUTO_RELOAD_PROFILE ?? 'web'
const port = Number.parseInt(process.env.OPENGUI_AUTO_RELOAD_PORT ?? '3080', 10)
const origin = `http://127.0.0.1:${port}`
const hookPath = join(repoRoot, '.githooks', 'post-merge')
const profilePath = join(dshHome, 'profiles', profile, 'package.json')

function log(message) {
  process.stdout.write(`[OpenGUI auto-reload] ${message}\n`)
}

async function run(command, args, options = {}) {
  return await exec(command, args, { cwd: repoRoot, ...options })
}

async function linkedCheckout() {
  let parsed
  try {
    parsed = JSON.parse(await readFile(profilePath, 'utf8'))
  } catch {
    return false
  }
  const specifier = parsed.dependencies?.[packageName]
  if (typeof specifier !== 'string' || !specifier.startsWith('link:')) return false
  const raw = specifier.slice('link:'.length)
  const target = isAbsolute(raw) ? raw : resolve(dirname(profilePath), raw)
  try {
    return await realpath(target) === await realpath(repoRoot)
  } catch {
    return false
  }
}

async function installHook(ifLinked) {
  if (!await linkedCheckout()) {
    if (ifLinked) return
    throw new Error(`DSH profile ${profile} is not linked to ${repoRoot}`)
  }
  await chmod(hookPath, 0o755)
  await run('git', ['config', 'core.hooksPath', '.githooks'])
  log('installed the repository post-merge hook; future pulls will build and reload automatically')
}

async function changedFiles() {
  try {
    const { stdout } = await run('git', ['diff', '--name-only', 'ORIG_HEAD..HEAD'])
    return stdout.split(/\r?\n/u).filter(Boolean)
  } catch {
    return ['src/unknown']
  }
}

function affectsBundle(path) {
  return path === 'package.json'
    || path === 'pnpm-lock.yaml'
    || path === 'tsconfig.json'
    || path === 'tsdown.config.ts'
    || path === 'cordis.patch.yml'
    || /^(?:src|assets)\//u.test(path)
}

async function build(files) {
  if (files.some(path => path === 'package.json' || path === 'pnpm-lock.yaml')) {
    await run('pnpm', ['install', '--frozen-lockfile', '--ignore-scripts'])
  }
  await run('pnpm', ['run', 'build'])
  log('built the pulled source into lib/')
}

async function taskStatus() {
  try {
    const response = await fetch(`${origin}/coremate-mobile/task/status`, {
      cache: 'no-store',
      headers: { Origin: origin },
      signal: AbortSignal.timeout(2_000),
    })
    if (!response.ok) return undefined
    return await response.json()
  } catch {
    return undefined
  }
}

async function gitConfig(key) {
  try {
    return (await run('git', ['config', '--get', key])).stdout.trim() || undefined
  } catch {
    return undefined
  }
}

async function launchdLabel() {
  if (process.env.OPENGUI_DSH_LAUNCHD_LABEL) return process.env.OPENGUI_DSH_LAUNCHD_LABEL
  const configured = await gitConfig('opengui.launchdLabel')
  if (configured) return configured
  try {
    const value = (await readFile(join(dshHome, 'logs', 'opengui-coremate-web.job'), 'utf8')).trim()
    if (value) return value
  } catch { /* older local services may not have a job file */ }

  if (process.platform !== 'darwin') return undefined
  try {
    const listener = (await exec('lsof', ['-nP', '-t', `-iTCP:${port}`, '-sTCP:LISTEN'])).stdout
      .split(/\r?\n/u).find(Boolean)
    if (!listener) return undefined
    const ancestors = new Set([listener])
    let pid = listener
    for (let depth = 0; depth < 5; depth += 1) {
      const parent = (await exec('ps', ['-o', 'ppid=', '-p', pid])).stdout.trim()
      if (!parent || parent === '1' || ancestors.has(parent)) break
      ancestors.add(parent)
      pid = parent
    }
    const rows = (await exec('launchctl', ['list'])).stdout.split(/\r?\n/u)
    for (const row of rows) {
      const match = /^\s*(\d+)\s+\S+\s+(\S+)\s*$/u.exec(row)
      if (match && ancestors.has(match[1])) return match[2]
    }
  } catch { /* unmanaged processes are left untouched */ }
  return undefined
}

async function waitUntilReady() {
  for (let attempt = 0; attempt < 60; attempt += 1) {
    try {
      const body = await (await fetch(origin, { signal: AbortSignal.timeout(2_000) })).text()
      if (body.includes('__DSH_BOOT__')) return true
    } catch { /* restart still in progress */ }
    await new Promise(resolveDelay => setTimeout(resolveDelay, 1_000))
  }
  return false
}

async function reload(head) {
  const label = await launchdLabel()
  if (!label) {
    log('bundle is current, but the running DSH process is not launchd-managed; it will load on its next start')
    return
  }
  const domain = `gui/${process.getuid?.() ?? process.env.UID ?? 0}/${label}`
  await exec('launchctl', ['kickstart', '-k', domain])
  if (!await waitUntilReady()) throw new Error(`DSH did not become ready at ${origin}`)
  log(`restarted ${label} and verified ${origin}`)
  if (process.env.OPENGUI_AUTO_RELOAD_NO_OPEN !== '1' && process.platform === 'darwin') {
    await exec('open', [`${origin}/?opengui-revision=${encodeURIComponent(head)}`])
  }
}

async function deferredReload(head) {
  const lock = join(dshHome, 'cache', 'coremate-mobile', 'dev-auto-reload.lock')
  await mkdir(dirname(lock), { recursive: true })
  try {
    await mkdir(lock, { recursive: false })
  } catch {
    return
  }
  try {
    for (let attempt = 0; attempt < 8_640; attempt += 1) {
      const status = await taskStatus()
      if (status === undefined || status.active !== true) {
        await reload(head)
        return
      }
      await new Promise(resolveDelay => setTimeout(resolveDelay, 5_000))
    }
    log('an OpenGUI task remained active for 12 hours; skipped the pending restart')
  } finally {
    await rm(lock, { recursive: true, force: true })
  }
}

async function afterPull() {
  if (!await linkedCheckout()) return
  const files = await changedFiles()
  if (!files.some(affectsBundle)) return
  await build(files)
  const head = (await run('git', ['rev-parse', '--short', 'HEAD'])).stdout.trim()
  const status = await taskStatus()
  if (status?.active === true) {
    const child = spawn(process.execPath, [fileURLToPath(import.meta.url), 'wait-reload', head], {
      detached: true,
      stdio: 'ignore',
      env: process.env,
    })
    child.unref()
    log('an OpenGUI task is active; queued the DSH restart until the task becomes idle')
    return
  }
  if (status === undefined) {
    log('DSH is not reachable; the new bundle will load automatically on its next start')
    return
  }
  await reload(head)
}

const [mode, ...args] = process.argv.slice(2)
try {
  if (mode === 'install') await installHook(args.includes('--if-linked'))
  else if (mode === 'after-pull') await afterPull()
  else if (mode === 'wait-reload' && args[0]) await deferredReload(args[0])
  else throw new Error('Usage: dev-auto-reload.mjs install [--if-linked] | after-pull')
} catch (error) {
  process.stderr.write(`[OpenGUI auto-reload] ${error instanceof Error ? error.message : String(error)}\n`)
  process.exitCode = 1
}
