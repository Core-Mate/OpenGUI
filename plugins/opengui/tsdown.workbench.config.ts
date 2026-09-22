import { defineConfig } from 'tsdown'
export default defineConfig({
  entry: { hostExecutor: '../../packages/phone-agent/src/host-executor.ts', runtime: '../../packages/phone-agent/src/runtime.ts', workbench: '../../packages/phone-agent/src/workbench.ts' }, outDir: '.artifacts/workbench',
  format: ['esm'], platform: 'node', target: 'node22', fixedExtension: false,
  deps: { alwaysBundle: id => !id.startsWith('node:'), onlyBundle: false },
  outputOptions: { codeSplitting: true }, dts: false, clean: true,
})
