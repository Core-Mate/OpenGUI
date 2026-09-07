import { basename, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { boot, loadOverlayPatches } from '@deepseek-ai/dsh-app-boot'

const profilePatchPath = process.argv[2]
if (profilePatchPath === undefined) throw new Error('coremate-mobile snapshot requires a profile patch path')
const rootConfigPath = resolve(process.cwd(), 'root.cordis.yml')
const pluginPatchPath = fileURLToPath(new URL('../../../cordis.patch.yml', import.meta.url))
const pluginSourcePath = fileURLToPath(new URL('../../../src/index.ts', import.meta.url))
const enabled = basename(profilePatchPath) === 'enabled.cordis.yml'
const pluginPatches = enabled ? loadOverlayPatches('coremate-mobile-snapshot', pluginPatchPath) : []
let bundleEntryName: string | undefined
for (const patch of pluginPatches) {
  const entry = patch.insert?.find(candidate => candidate.id === 'coremate-mobile')
  if (entry !== undefined) {
    bundleEntryName = entry.name
    entry.name = pluginSourcePath
  }
}
const ctx = await boot('coremate-mobile-snapshot', rootConfigPath, [
  ...pluginPatches,
  ...loadOverlayPatches('coremate-mobile-snapshot', profilePatchPath),
], undefined, import.meta.url)

const snapshot = async (): Promise<unknown> => {
  const assembly = await ctx.systemPrompt.assemble()
  return {
    commands: ctx.commands.list({} as Parameters<typeof ctx.commands.list>[0])
      .filter(command => ['opengui', 'coremate'].includes(command.name)),
    configurableProviders: ctx.llm.listConfigurableProviders()
      .filter(provider => provider.provider === 'coremate-mobile'),
    providers: ctx.llm.listProviders()
      .filter(provider => ['coremate-inherited', 'coremate-mobile'].includes(provider.id)),
    routingSections: assembly.sections.filter(section => section.name === 'tool:opengui-root-routing'),
    tools: assembly.tools
      .filter(tool => ['phone_agent', 'phone_control', 'browser_agent', 'browser_control'].includes(tool.name)),
  }
}

try {
  const entry = [...ctx.loader.entries()].find(candidate => candidate.options.id === 'coremate-mobile')
  const before = await snapshot()
  if (entry?.fiber !== undefined) await entry.fiber.dispose()
  process.stdout.write(`${JSON.stringify({
    entry: entry === undefined ? null : {
      id: entry.options.id,
      name: bundleEntryName ?? entry.options.name,
      config: entry.options.config as unknown,
    },
    before,
    afterUnload: await snapshot(),
  })}\n`)
} finally {
  await ctx.fiber.dispose()
}
