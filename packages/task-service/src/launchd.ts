import { mkdir, writeFile } from 'node:fs/promises'
import { homedir } from 'node:os'
import { isAbsolute, join } from 'node:path'
import { TASK_SERVICE_LABEL, serviceRoot } from './paths.ts'

const xml = (value: string) => value.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;')

/** User launch agent for the shared service. */
export function taskServicePlist(options: { node: string; entry: string; root?: string }): string {
  for (const value of [options.node, options.entry]) {
    if (!isAbsolute(value) || /[\x00-\x1f]/.test(value)) throw new Error('task service paths must be absolute')
  }
  const root = options.root ?? serviceRoot()
  const str = (value: string) => `<string>${xml(value)}</string>`
  return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict>
<key>Label</key>${str(TASK_SERVICE_LABEL)}
<key>ProgramArguments</key><array>${[options.node, options.entry].map(str).join('')}</array>
<key>EnvironmentVariables</key><dict><key>OPENGUI_TASK_SERVICE_ROOT</key>${str(root)}<key>OPENGUI_WORKBENCH_PORT</key>${str('58894')}</dict>
<key>RunAtLoad</key><true/>
<key>KeepAlive</key><true/>
<key>ThrottleInterval</key><integer>10</integer>
<key>Umask</key><integer>63</integer>
<key>StandardOutPath</key>${str(join(root, 'service.stdout.log'))}
<key>StandardErrorPath</key>${str(join(root, 'service.stderr.log'))}
</dict></plist>\n`
}

export async function installTaskServiceLaunchAgent(options: { node: string; entry: string; agentsDir?: string; root?: string }): Promise<string> {
  const dir = options.agentsDir ?? join(homedir(), 'Library', 'LaunchAgents')
  await mkdir(dir, { recursive: true, mode: 0o700 })
  const path = join(dir, TASK_SERVICE_LABEL + '.plist')
  await writeFile(path, taskServicePlist(options), { mode: 0o644 })
  return path
}
