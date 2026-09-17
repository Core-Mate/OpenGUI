import { readdirSync } from 'node:fs'
import { defineConfig } from 'tsdown'

// Retain the existing JS entry points consumed by the installer and package QA.
export default defineConfig({
  entry: Object.fromEntries(readdirSync('src').filter(name => name.endsWith('.ts'))
    .map(name => [name.slice(0, -3), `src/${name}`])),
  outDir: 'lib', format: ['esm'], platform: 'node', target: 'node22',
  fixedExtension: false, dts: false, clean: true,
  deps: { neverBundle: [/^@modelcontextprotocol\//, /^sharp(?:\/|$)/, /^ajv(?:\/|$)/, /^tar(?:\/|$)/, /^yauzl(?:\/|$)/] },
})
