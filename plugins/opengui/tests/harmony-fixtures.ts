import { writeFile } from 'node:fs/promises'
import { vi } from 'vitest'
import type { HdcRunner } from '../src/hdc.ts'

export function layout(text = '', bounds = '[10,20][90,40]', extra: Record<string, string> = {}) {
  return { attributes: { type: 'WindowScene', bounds: '[0,0][100,200]', bundleName: 'com.example.demo', hostWindowId: '1', visible: 'true' }, children: [
    { attributes: { type: 'TextInput', text, hint: 'Search', bounds, focused: 'true', visible: 'true', ...extra }, children: [] },
  ] }
}

export function png(width = 100, height = 200): Buffer {
  const header = Buffer.alloc(24)
  Buffer.from('89504e470d0a1a0a0000000d49484452', 'hex').copy(header)
  header.writeUInt32BE(width, 16); header.writeUInt32BE(height, 20)
  return header
}

export function fakeHdc() {
  const files = new Map<string, Buffer>()
  const localFiles: string[] = []
  const state = { api: 24, layouts: [layout()], transferFails: false, failAction: false }
  const commands: string[] = []
  const run = vi.fn<HdcRunner>(async (args, signal) => {
    signal.throwIfAborted()
    if (args[0] === 'list') return 'device-a\tUSB\tConnected\tlocalhost\n'
    if (args[2] === 'file') {
      const remote = args[4]!, local = args[5]!
      localFiles.push(local)
      await writeFile(local, files.get(remote)!)
      return state.transferFails ? 'partial transfer' : 'FileTransfer finish'
    }
    const raw = args[3]!
    const marker = raw.match(/__opengui_[a-f0-9]+__/)![0]
    const command = raw.split('; opengui_status=')[0]!
    commands.push(command)
    let output = ''
    const remote = command.match(/'([^']+\.(?:png|json))'/)?.[1]
    if (command.includes("'const.ohos.apiversion'")) output = String(state.api)
    else if (command.includes("'const.product.model'")) output = 'TEST-PHONE'
    else if (command.includes("'--version'")) output = '6.0.2.3'
    else if (command.includes("'dumpLayout'")) {
      const current = state.layouts.length > 1 ? state.layouts.shift()! : state.layouts[0]!
      files.set(remote!, Buffer.from(JSON.stringify(current)))
      output = 'DumpLayout saved to:' + remote
    } else if (command.includes("'screenCap'")) { files.set(remote!, png()); output = 'ScreenCap saved to ' + remote }
    else if (command.startsWith("'rm'")) files.delete(remote!)
    else if (command.includes("'uiInput'")) output = state.failAction ? 'unknown command' : 'No Error'
    else if (command.startsWith("'aa'")) output = 'start ability successfully.'
    return `${output}\n${marker}0\n`
  })
  return { run, state, files, localFiles, commands }
}
