import { createHash, randomBytes } from 'node:crypto'
import { constants } from 'node:fs'
import { open } from 'node:fs/promises'
import { join } from 'node:path'
import { ensurePrivateState, workbuddyStateDir } from './state.ts'

export interface NativeEndpoint { version: 1; port: number; token: string }

/** Persist independently of package versions so supervised restarts retain their endpoint. */
export async function nativeEndpoint(stateDir = workbuddyStateDir()): Promise<NativeEndpoint> {
  await ensurePrivateState(stateDir)
  const path = join(stateDir, 'native-mcp.json')
  const candidate: NativeEndpoint = {
    version: 1,
    port: 54000 + createHash('sha256').update(stateDir).digest().readUInt32BE(0) % 10000,
    token: randomBytes(32).toString('base64url'),
  }
  try {
    const file = await open(path, 'wx', 0o600)
    try { await file.writeFile(JSON.stringify(candidate) + '\n'); await file.sync() }
    finally { await file.close() }
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error
  }
  // O_NOFOLLOW prevents a replacement symlink between inspection and open.
  const file = await open(path, constants.O_RDONLY | constants.O_NOFOLLOW)
  try {
    const info = await file.stat()
    if (!info.isFile() || info.size > 4096 || info.uid !== process.getuid?.() || (info.mode & 0o077) !== 0) {
      throw new Error('Unsafe native MCP configuration permissions')
    }
    const value: unknown = JSON.parse(await file.readFile('utf8'))
    if (!value || typeof value !== 'object') throw new Error('Invalid native MCP configuration')
    const config = value as NativeEndpoint
    if (config.version !== 1 || !Number.isInteger(config.port) || config.port < 1024 || config.port > 65535
      || typeof config.token !== 'string' || !/^[A-Za-z0-9_-]{43}$/.test(config.token)) {
      throw new Error('Invalid native MCP configuration')
    }
    return { version: 1, port: config.port, token: config.token }
  } finally { await file.close() }
}
