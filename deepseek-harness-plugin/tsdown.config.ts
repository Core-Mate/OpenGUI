import { defineConfig } from 'tsdown'

/** Bundle the plugin and invariant companion while keeping Harness peers external. */
export default defineConfig([
  {
    entry: ['lib/types/index.js'],
    outDir: 'lib',
    format: ['esm'],
    platform: 'node',
    target: 'es2024',
    fixedExtension: false,
    outputOptions: { codeSplitting: false },
    dts: false,
    clean: false,
  },
  {
    entry: ['lib/types/invariant.js'],
    outDir: 'lib',
    format: ['esm'],
    platform: 'node',
    target: 'es2024',
    fixedExtension: false,
    outputOptions: { codeSplitting: false },
    dts: false,
    clean: false,
  },
  {
    name: 'dsh-coremate-mobile/client',
    entry: { client: 'lib/types/client/index.js' },
    outDir: 'lib',
    format: ['cjs'],
    platform: 'browser',
    target: 'es2022',
    deps: {
      neverBundle: [
        'react',
        'react/jsx-runtime',
        '@deepseek-ai/cordis',
        '@deepseek-ai/dsh-client-ui-slots',
      ],
      alwaysBundle: id => ![
        'react',
        'react/jsx-runtime',
        '@deepseek-ai/cordis',
        '@deepseek-ai/dsh-client-ui-slots',
      ].includes(id),
    },
    sourcemap: true,
    dts: false,
    clean: false,
    outputOptions: {
      entryFileNames: 'client.js',
      banner: 'window.__ModuleLoader__.load({ id: "dsh-coremate-mobile", factory: (require) => {',
      footer: 'return module.exports; } });',
      intro: 'var module = { exports: {} }; var exports = module.exports;',
      codeSplitting: false,
    },
  },
])
