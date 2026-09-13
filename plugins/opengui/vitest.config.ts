import { defineConfig } from 'vitest/config'

// Browser QA compilation may leave generated tests below .artifacts.
export default defineConfig({ test: { include: ['tests/**/*.spec.ts'] } })
