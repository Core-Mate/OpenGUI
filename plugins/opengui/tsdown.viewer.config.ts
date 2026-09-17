import { defineConfig } from 'tsdown'
export default defineConfig({
  entry: { viewer: 'src/viewer.ts' }, outDir: '.artifacts/browser',
  format: ['esm'], platform: 'node', target: 'node22', fixedExtension: false,
  deps: { alwaysBundle: id => !id.startsWith('node:'), onlyBundle: false },
  outputOptions: { codeSplitting: false }, dts: false, clean: true,
})
