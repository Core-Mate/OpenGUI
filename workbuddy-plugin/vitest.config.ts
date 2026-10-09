import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    // Bound concurrent device/report fixtures so CPU contention does not exhaust their timeouts.
    maxWorkers: 2,
    // Hosted Windows runners can be several times slower than local machines for socket-heavy fixtures.
    testTimeout: 20_000,
  },
})
