import { defineConfig } from 'tsdown'

const base = {
  outDir: 'lib',
  format: 'esm' as const,
  platform: 'node' as const,
  target: 'node22',
  fixedExtension: false,
  deps: { alwaysBundle: (id: string) => !id.startsWith('node:'), onlyBundle: false as const },
  outputOptions: { codeSplitting: false },
  dts: false,
}

export default defineConfig([
  { ...base, entry: { cli: 'src/cli.ts' }, clean: true },
  { ...base, entry: { 'task-service': 'src/task-service-main.ts' }, clean: false },
])
