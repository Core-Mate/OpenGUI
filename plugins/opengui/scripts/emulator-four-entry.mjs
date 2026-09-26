/**
 * Runs the four-entry Android emulator acceptance test.
 * Start opengui_e2e_api35 first; see tests/emulator-four-entry.e2e.spec.ts.
 * Skipped unless this launcher sets OPENGUI_EMULATOR_E2E=1.
 */
import { spawnSync } from 'node:child_process'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = dirname(fileURLToPath(import.meta.url))
const result = spawnSync(join(root, '../node_modules/.bin/vitest'), ['run', 'tests/emulator-four-entry.e2e.spec.ts'], {
  cwd: join(root, '..'),
  stdio: 'inherit',
  env: { ...process.env, OPENGUI_EMULATOR_E2E: '1' },
})
process.exit(result.status ?? 1)
