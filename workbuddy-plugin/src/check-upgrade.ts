import { connect } from 'node:net'
import { brokerPort } from './state.ts'
await new Promise<void>((resolve, reject) => {
  const socket = connect({ host: '127.0.0.1', port: brokerPort() })
  socket.setTimeout(1500, () => { socket.destroy(); reject(new Error('upgrade_check_timeout: existing runtime left untouched')) })
  socket.once('connect', () => { socket.destroy(); reject(new Error('upgrade_blocked: finish old phone tasks and close their viewers/mirrors using the old runtime; quit WorkBuddy and wait for its idle exit before rerunning this installer')) })
  socket.once('error', error => { socket.destroy(); if ((error as NodeJS.ErrnoException).code === 'ECONNREFUSED') resolve(); else reject(error) })
})
process.stdout.write('upgrade_ready: no existing broker; no process was terminated\n')
