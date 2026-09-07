#!/usr/bin/env node
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'
import { startMcp } from './mcp-server.ts'
import { VERSION } from './state.ts'

if (process.argv.includes('--help')) {
  process.stdout.write('OpenGUI for WorkBuddy\nUsage: opengui-mcp [--help | --version]\nStarts a local MCP stdio server with eleven Android tools.\nNo DSH or Codex installation is read or modified.\n')
} else if (process.argv.includes('--version')) {
  process.stdout.write(`${VERSION}\n`)
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
