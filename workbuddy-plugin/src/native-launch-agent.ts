import { createHash } from 'node:crypto'
import { isAbsolute, join } from 'node:path'

/** A host-owned launch agent; credentials stay in private state, never in argv or plist. */
export function nativeLaunchAgent(options: { configRoot: string; stateRoot: string; node: string; packageDir: string }) {
  for (const value of Object.values(options)) {
    if (!isAbsolute(value) || /[\x00-\x1f]/.test(value)) throw new Error('Native service paths must be absolute and contain no control characters')
  }
  const label = 'org.opengui.workbuddy.' + createHash('sha256').update(options.configRoot).digest('hex').slice(0, 16)
  const xml = (value: string) => value.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;').replaceAll("'", '&apos;')
  const str = (value: string) => `<string>${xml(value)}</string>`
  const plist = `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict>
<key>Label</key>${str(label)}
<key>ProgramArguments</key><array>${[options.node, join(options.packageDir, 'lib/mcp.js'), '--http'].map(str).join('')}</array>
<key>EnvironmentVariables</key><dict><key>OPENGUI_WORKBUDDY_HOME</key>${str(options.stateRoot)}</dict>
<key>WorkingDirectory</key>${str(options.packageDir)}
<key>RunAtLoad</key><true/>
<key>KeepAlive</key><true/>
<key>ThrottleInterval</key><integer>10</integer>
<key>Umask</key><integer>63</integer>
<key>StandardOutPath</key>${str(join(options.stateRoot, 'native-mcp.stdout.log'))}
<key>StandardErrorPath</key>${str(join(options.stateRoot, 'native-mcp.stderr.log'))}
</dict></plist>\n`
  return { label, plist }
}
