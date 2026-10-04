import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    // Bound concurrent device/report fixtures so CPU contention does not exhaust their timeouts.
    maxWorkers: 2,
  },
})
