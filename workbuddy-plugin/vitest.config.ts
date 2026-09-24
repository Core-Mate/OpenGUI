import { defineConfig } from 'vitest/config'
export default defineConfig({ test: { include: ['tests/**/*.spec.ts', '../packages/device-runtime/tests/**/*.spec.ts'] } })
