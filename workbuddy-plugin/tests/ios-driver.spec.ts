import { describe, expect, it } from 'vitest'
import { runSimulatorCommand } from '../src/ios-driver.ts'

describe('bounded iOS driver processes', () => {
  it('passes Unicode through stdin without shell evaluation', async () => {
    const text = '中文 😀 `literal` $(literal)'
    const output = await runSimulatorCommand(process.execPath, ['-e', 'let s="";process.stdin.setEncoding("utf8");process.stdin.on("data",x=>s+=x);process.stdin.on("end",()=>process.stdout.write(s))'], AbortSignal.timeout(5000), text)
    expect(String(output)).toBe(text)
  })
  it('redacts private stdout, stderr, command arguments and exception details on failure', async () => {
    const secret = 'private-original-clipboard'
    const action = runSimulatorCommand(process.execPath, ['-e', `process.stderr.write(${JSON.stringify(secret)});process.stdout.write(${JSON.stringify(secret)});process.exit(1)`], AbortSignal.timeout(5000))
    await expect(action).rejects.toThrow('ios_simulator_command_failed')
    await action.catch(error => expect(JSON.stringify(error)).not.toContain(secret))
  })
  it('aborts an in-flight simulator process and rejects already-cancelled invocations', async () => {
    const controller = new AbortController()
    const pending = runSimulatorCommand(process.execPath, ['-e', 'setInterval(()=>{},1000)'], controller.signal)
    controller.abort()
    await expect(pending).rejects.toThrow('ios_simulator_command_failed')
    expect(() => runSimulatorCommand(process.execPath, ['-e', 'process.exit(0)'], controller.signal)).toThrow()
  })
})
