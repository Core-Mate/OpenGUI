import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { execFileSync } from 'node:child_process'
import { cp, mkdir, readFile, readdir, realpath, writeFile } from 'node:fs/promises'
import { dirname, isAbsolute, relative, resolve, sep } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createRequire } from 'node:module'

const core = dirname(fileURLToPath(import.meta.url))
const repository = resolve(core, '../..')
const inside = (root, path) => path === root || path.startsWith(root + sep)

async function files(root) {
  const result = []
  for (const entry of await readdir(root, { withFileTypes: true })) {
    const path = resolve(root, entry.name)
    assert(!entry.isSymbolicLink(), `Symlink in build input: ${entry.name}`)
    if (entry.isDirectory()) result.push(...await files(path))
    else result.push(path)
  }
  return result.sort()
}

async function digest() {
  const hash = createHash('sha256')
  for (const name of ['device-runtime', 'phone-agent', 'workbench']) for (const path of await files(resolve(core, '..', name, 'src'))) {
    const data = await readFile(path)
    hash.update(relative(core, path).split(sep).join('/')).update('\0')
    hash.update(String(data.length)).update('\0').update(data)
  }
  return hash.digest('hex')
}

async function sourceCommit() {
  try {
    const metadata = JSON.parse(await readFile(resolve(core, 'build-source.json'), 'utf8'))
    assert.match(metadata.sourceCommit, /^[a-f0-9]{40}$/)
    return metadata.sourceCommit
  } catch (error) {
    if (error.code !== 'ENOENT') throw error
  }
  return execFileSync('git', ['rev-parse', 'HEAD'], { cwd: repository, encoding: 'utf8' }).trim()
}

export async function validateSourceBoundary(hostRoot) {
  const host = await realpath(resolve(hostRoot, 'src'))
  const shared = await Promise.all(['device-runtime', 'phone-agent', 'workbench'].map(name => realpath(resolve(core, '..', name, 'src'))))
  for (const root of [host, ...shared]) for (const path of await files(root)) {
    if (!path.endsWith('.ts')) continue
    const source = await readFile(path, 'utf8')
    // Validate static imports, re-exports and literal dynamic imports/requires.
    const imports = source.matchAll(/(?:\bfrom\s*|\bimport\s*\(?\s*|\brequire\s*\(\s*)['"]([^'"]+)['"]/g)
    for (const [, specifier] of imports) {
      assert(!isAbsolute(specifier), `Absolute source import: ${path}`)
      if (!specifier.startsWith('.')) {
        if (shared.includes(root)) assert(specifier.startsWith('node:'), `Host dependency in core: ${specifier}`)
        continue
      }
      const target = await realpath(resolve(dirname(path), specifier))
      assert(shared.some(root => inside(root, target)) || (root === host && inside(host, target)), `Import escapes allowed source: ${path}`)
    }
  }
}

export function bundleImports(text, ts) {
  const source = ts.createSourceFile('bundle.js', text, ts.ScriptTarget.Latest, true, ts.ScriptKind.JS)
  assert.equal(source.parseDiagnostics.length, 0, 'Invalid JavaScript in bundle')
  const imports = []
  const visit = node => {
    if ((ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) && node.moduleSpecifier && ts.isStringLiteral(node.moduleSpecifier)) imports.push(node.moduleSpecifier.text)
    if (ts.isCallExpression(node) && (node.expression.kind === ts.SyntaxKind.ImportKeyword || ts.isIdentifier(node.expression) && node.expression.text === 'require')) {
      const argument = node.arguments[0]
      if (argument && (ts.isStringLiteral(argument) || ts.isNoSubstitutionTemplateLiteral(argument))) imports.push(argument.text)
    }
    ts.forEachChild(node, visit)
  }
  visit(source)
  return imports
}

export async function validateManifest(hostRoot) {
  const manifest = JSON.parse(await readFile(resolve(hostRoot, 'lib/runtime-manifest.json'), 'utf8'))
  const pkg = JSON.parse(await readFile(resolve(hostRoot, 'package.json'), 'utf8'))
  assert.equal(manifest.packageVersion, pkg.version)
  assert.equal(manifest.coreDigest, await digest())
  assert.equal(manifest.sourceCommit, await sourceCommit())
  assert.equal(manifest.contractVersion, 1)
  assert.equal(manifest.host, pkg.name === 'opengui-codex' ? 'codex' : pkg.name === 'opengui-mcp' ? 'workbuddy' : 'dsh')
  // Bundles must not retain imports of source files or paths outside lib.
  const lib = await realpath(resolve(hostRoot, 'lib'))
  const ts = createRequire(resolve(hostRoot, 'package.json'))('typescript')
  for (const path of await files(lib)) if (path.endsWith('.js') || path.endsWith('.mjs')) {
    const text = await readFile(path, 'utf8')
    for (const specifier of bundleImports(text, ts)) {
      assert(!isAbsolute(specifier), `Absolute bundle import: ${path}`)
      if (specifier.startsWith('.')) {
        assert(!specifier.endsWith('.ts'), `Uncompiled source import: ${path}`)
        assert(inside(lib, await realpath(resolve(dirname(path), specifier))), `Bundle import escapes lib: ${path}`)
      }
    }
  }
}

async function manifest(host, root) {
  assert(['codex', 'workbuddy', 'dsh'].includes(host))
  const pkg = JSON.parse(await readFile(resolve(root, 'package.json'), 'utf8'))
  await writeFile(resolve(root, 'lib/runtime-manifest.json'), JSON.stringify({
    host, packageVersion: pkg.version, sourceCommit: await sourceCommit(),
    contractVersion: 1, coreDigest: await digest(),
  }, null, 2) + '\n')
}

/** Export only one adapter and the core, preserving their relative layout. */
async function stage(host, destination) {
  const hostPath = host === 'codex' ? 'plugins/opengui' : host === 'workbuddy' ? 'workbuddy-plugin' : host === 'dsh' ? 'deepseek-harness-plugin' : undefined
  assert(hostPath, 'Expected codex or workbuddy')
  const target = resolve(destination)
  assert(!inside(repository, target) && !inside(target, repository), 'Use an external isolated build directory')
  await mkdir(target) // Refuse to merge into an existing tree.
  const filter = source => !/(^|[/\\])(node_modules|lib|dist|\.artifacts|coverage|artifacts)([/\\]|$)/.test(source)
  await cp(resolve(repository, hostPath), resolve(target, hostPath), { recursive: true, filter })
  for (const name of ['device-runtime', 'phone-agent', 'workbench']) await cp(resolve(core, '..', name), resolve(target, 'packages', name), { recursive: true, filter })
  await writeFile(resolve(target, 'packages/device-runtime/build-source.json'), JSON.stringify({ sourceCommit: await sourceCommit() }) + '\n')
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const [command, host, root] = process.argv.slice(2)
  assert(root, 'Usage: build.mjs manifest|stage codex|workbuddy directory')
  if (command === 'manifest') await manifest(host, resolve(root))
  else if (command === 'stage') await stage(host, root)
  else throw new Error('Unknown build command')
}
