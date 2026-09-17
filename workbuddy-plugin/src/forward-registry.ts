import { join } from 'node:path'
import { workbuddyStateDir } from './state.ts'
import { OwnedForwardRegistry as RuntimeForwardRegistry } from '../../packages/device-runtime/src/forward-registry.ts'
export * from '../../packages/device-runtime/src/forward-registry.ts'
export function defaultForwardRegistryPath(): string { return join(workbuddyStateDir(), 'owned-forwards.json') }
export class OwnedForwardRegistry extends RuntimeForwardRegistry {
  constructor(path = defaultForwardRegistryPath()) { super(path) }
}
