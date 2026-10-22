import { execFileSync } from 'node:child_process'
import { describe, expect, it } from 'vitest'
import { CONFIRMATION_SCRIPT } from '../src/confirmation.ts'

// Run actual AppleScript control flow with a synthetic dialog result. No UI or device is opened.
function runSyntheticDialog(body: string): string {
  const dialogLine = CONFIRMATION_SCRIPT.split('\n').find(line => line.includes('display dialog messageText'))!
  const replacement = dialogLine.startsWith('set dialogReply to ') ? 'set dialogReply to my syntheticDialog()' : 'my syntheticDialog()'
  const script = `on syntheticDialog()\n${body}\nend syntheticDialog\n`
    + CONFIRMATION_SCRIPT.replace('\nactivate\n', '\n').replace(dialogLine, replacement)
  return execFileSync('/usr/bin/osascript', ['-e', script, 'synthetic "quoted" argument'], {
    encoding: 'utf8', timeout: 5000, maxBuffer: 8192,
  }).trim()
}

describe.runIf(process.platform === 'darwin')('actual AppleScript response handling', () => {
  it('preserves Allow once after checking the timeout flag', () => {
    expect(runSyntheticDialog('return {button returned:"Allow once", gave up:false}')).toBe('Allow once')
  })
  it('handles timeout without reading a missing button field', () => {
    expect(runSyntheticDialog('return {gave up:true}')).toBe('timeout')
  })
  it('keeps explicit cancellation separate from a UI error', () => {
    expect(runSyntheticDialog('error number -128')).toBe('cancel')
    expect(runSyntheticDialog('error "synthetic private detail" number -2753')).toBe('unavailable')
  })
})
