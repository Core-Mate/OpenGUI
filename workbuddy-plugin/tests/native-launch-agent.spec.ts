import { execFileSync } from 'node:child_process'
import { expect, it } from 'vitest'
import { nativeLaunchAgent } from '../src/native-launch-agent.ts'

it.skipIf(process.platform !== 'darwin')('produces a launchd plist with literal paths and no shell interpretation', () => {
  const options = { configRoot: '/tmp/workbuddy & special', stateRoot: '/tmp/state', node: '/tmp/node with space', packageDir: '/tmp/package <one> $HOME' }
  const service = nativeLaunchAgent(options)
  const decoded = JSON.parse(execFileSync('/usr/bin/plutil', ['-convert', 'json', '-o', '-', '-'], { input: service.plist, encoding: 'utf8' }))
  expect(decoded.ProgramArguments).toEqual([options.node, options.packageDir + '/lib/mcp.js', '--http'])
  expect(decoded.EnvironmentVariables).toEqual({ OPENGUI_WORKBUDDY_HOME: options.stateRoot })
  expect(decoded.KeepAlive).toBe(true)
  expect(decoded.Umask).toBe(0o077)
  expect(nativeLaunchAgent({ ...options, packageDir: '/tmp/new-version' }).label).toBe(service.label)
  expect(nativeLaunchAgent({ ...options, configRoot: '/tmp/other-host' }).label).not.toBe(service.label)
  expect(() => nativeLaunchAgent({ ...options, node: 'relative' })).toThrow()
})
