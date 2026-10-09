import { randomBytes } from 'node:crypto'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { TaskStore } from '../src/task-store.ts'
import { ViewerServer } from '../src/viewer.ts'
import { WorkBuddyOpenGuiService, createControlTask } from '../src/service.ts'
import { consoleKey } from '../src/state.ts'
import { FakeHost } from './fake-host.ts'

const cleanup: Array<() => unknown> = []
afterEach(async () => { for (const close of cleanup.splice(0).reverse()) await close() })
const streams = () => ({ prepare: vi.fn(async () => {}), subscribe: vi.fn(async () => () => {}), async dispose() {} })

describe('打开控制台 link', () => {
  it('reopens the live workbench and, after a restart, a read-only view restored from the archive', async () => {
    const directory = mkdtempSync(join(tmpdir(), 'opengui-console-')); cleanup.push(() => rmSync(directory, { recursive: true, force: true }))
    const store = new TaskStore(join(directory, 'reports')), key = consoleKey(join(directory, 'state'))
    const viewer = new ViewerServer(streams(), Date.now, store, undefined, { consoleKey: key })
    const service = new WorkBuddyOpenGuiService({ viewers: viewer, host: new FakeHost() }); cleanup.push(() => service.dispose(), () => viewer.dispose())
    const display = await service.openViewer(['phone-a'], AbortSignal.timeout(10_000), { owner: 'console-task', task: createControlTask(), objective: '核对设置页' })
    viewer.endOwner('console-task')
    await viewer.archiveReports(display.viewerId)
    const chat = viewer.reportFiles(display.viewerId)?.chatMarkdown ?? ''
    const link = /\[打开控制台\]\((http:\/\/127\.0\.0\.1:\d+\/console\/[0-9a-f-]{36}\?k=[\w-]{32})\)/u.exec(chat)?.[1]
    expect(chat).toContain('输出文件：')
    expect(link).toBeDefined()
    const live = await fetch(link!, { redirect: 'manual' })
    expect(live.status).toBe(302)
    expect(live.headers.get('location')).toBe(`${new URL(display.url).pathname}#board=${new URL(display.workbenchUrl).hash.slice(7)}`)
    // A guessed or tampered capability is refused.
    expect((await fetch(link!.replace(/k=[\w-]+/u, `k=${randomBytes(24).toString('base64url')}`), { redirect: 'manual' })).status).toBe(404)
    expect((await fetch(link!.replace(/console\/[0-9a-f-]+/u, `console/${crypto.randomUUID()}`), { redirect: 'manual' })).status).toBe(404)

    // A new broker process with the same private key and archive restores the finished task read-only.
    const restarted = new ViewerServer(streams(), Date.now, store, undefined, { consoleKey: consoleKey(join(directory, 'state')) }); cleanup.push(() => restarted.dispose())
    const service2 = new WorkBuddyOpenGuiService({ viewers: restarted, host: new FakeHost() }); cleanup.push(() => service2.dispose())
    const other = await service2.openViewer([], AbortSignal.timeout(10_000), { owner: 'other-task', task: createControlTask(), objective: 'Another task' })
    const origin = new URL(other.url).origin
    const reopened = await fetch(new URL(new URL(link!).pathname + new URL(link!).search, origin), { redirect: 'manual' })
    expect(reopened.status).toBe(302)
    const target = new URL(reopened.headers.get('location')!, origin)
    const status = await (await fetch(new URL('status', target))).json() as { board: { objective: string }; devices: unknown[] }
    expect(status.board.objective).toBe('核对设置页')
    expect(status.devices).toEqual([])
    const blocked = await fetch(new URL('board', target), { method: 'POST', headers: { Origin: target.origin, 'Content-Type': 'application/json', 'X-OpenGUI-Board': target.hash.slice(7) }, body: JSON.stringify({ action: 'takeover' }) })
    expect(blocked.status).toBe(409)
  })
})
