import { startBroker } from './broker.ts'
import { assertNoUpgrade, brokerPort, brokerToken } from './state.ts'

try {
  assertNoUpgrade()
  const broker = await startBroker({ token: await brokerToken(), port: brokerPort() })
  try { assertNoUpgrade() } catch (error) { await broker.close(); throw error }
  let stopping = false
  const stop = (): void => {
    if (stopping) return
    stopping = true
    void broker.close().catch(() => { process.exitCode = 1 })
  }
  process.once('SIGINT', stop)
  process.once('SIGTERM', stop)
} catch (error) {
  if ((error as NodeJS.ErrnoException).code !== 'EADDRINUSE') {
    process.stderr.write('opengui: WorkBuddy broker failed to start\n')
    process.exitCode = 1
  }
}
