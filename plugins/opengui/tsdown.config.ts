import { defineConfig } from 'tsdown'

export default defineConfig({
  entry: { cli: 'src/cli.ts' },
  outDir: 'lib',
  format: ['esm'],
  platform: 'node',
  target: 'node22',
  fixedExtension: false,
  deps: { alwaysBundle: id => !id.startsWith('node:'), onlyBundle: false },
  outputOptions: { codeSplitting: false },
  dts: false,
  clean: true,
})
