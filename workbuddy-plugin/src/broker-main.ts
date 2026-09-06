import { startBroker } from './broker.ts'
import { brokerPort, brokerToken } from './state.ts'

try {
  const broker = await startBroker({ token: await brokerToken(), port: brokerPort() })
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
