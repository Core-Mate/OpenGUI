import { homedir } from 'node:os'
import { join, resolve } from 'node:path'
import { OwnedForwardRegistry as RuntimeRegistry } from '../../packages/device-runtime/src/forward-registry.ts'
export * from '../../packages/device-runtime/src/forward-registry.ts'
export function defaultForwardRegistryPath(): string {
  return join(process.env.DSH_HOME ? resolve(process.env.DSH_HOME) : join(homedir(), '.dsh'), 'cache', 'coremate-mobile', 'owned-forwards.json')
}
export class OwnedForwardRegistry extends RuntimeRegistry {
  constructor(path = defaultForwardRegistryPath()) { super(path) }
}
