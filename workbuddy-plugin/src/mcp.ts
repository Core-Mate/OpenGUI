#!/usr/bin/env node
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'
import { startMcp } from './mcp-server.ts'
import { VERSION } from './state.ts'
import { startHttpMcp } from './mcp-http.ts'
import { nativeEndpoint } from './native-endpoint.ts'

if (process.argv.includes('--help')) {
  process.stdout.write('OpenGUI for WorkBuddy\nUsage: opengui-mcp [--http | --help | --version]\nDefaults to MCP stdio; --http serves the native workbench on an authenticated loopback endpoint.\nNo DSH or Codex installation is read or modified.\n')
} else if (process.argv.includes('--version')) {
  process.stdout.write(`${VERSION}\n`)
} else if (process.argv.length === 3 && process.argv[2] === '--http') {
  try {
    if (process.platform !== 'darwin') throw new Error('Native HTTP installation requires macOS')
    const server = await startHttpMcp(await nativeEndpoint())
    let closing = false
    const close = (): void => {
      if (closing) return
      closing = true
      void server.close().catch(() => { process.exitCode = 1 })
    }
    process.once('SIGINT', close)
    process.once('SIGTERM', close)
    process.stdout.write('OpenGUI native MCP ready\n')
  } catch {
    process.stderr.write('opengui: native MCP startup failed; existing configuration and listeners were retained\n')
    process.exitCode = 1
  }
} else if (process.argv.length > 2) {
  process.stderr.write('opengui: unsupported argument; use --help\n')
  process.exitCode = 1
} else {
  try {
    const server = await startMcp(new StdioServerTransport())
    const close = (): void => { void server.close() }
    process.once('SIGINT', close)
    process.once('SIGTERM', close)
    process.stdin.once('end', close)
  } catch {
    process.stderr.write('opengui: MCP startup failed\n')
    process.exitCode = 1
  }
}
