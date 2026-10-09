import { mkdtempSync, readFileSync, rmSync, statSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import sharp from 'sharp'
import { afterEach, describe, expect, it } from 'vitest'
import { getDocument, OPS } from 'pdfjs-dist/legacy/build/pdf.mjs'
import { pdfReport } from '../src/pdf-report.ts'
import { TaskStore } from '../src/task-store.ts'
import { reportFileName, reportLinks } from '../src/viewer.ts'
import { WorkBuddyOpenGuiService, createControlTask } from '../src/service.ts'
import { FakeHost } from './fake-host.ts'
import { setup, connect } from './viewer-fixture.ts'

const cleanup: Array<() => Promise<unknown> | void> = []
afterEach(async () => { for (const close of cleanup.splice(0).reverse()) await close() })
async function readPdf(buffer: Buffer) {
  const task = getDocument({ data: new Uint8Array(buffer), useSystemFonts: false, disableFontFace: true, isEvalSupported: false })
  const doc = await task.promise
  cleanup.push(() => task.destroy())
  const pages = await Promise.all(Array.from({ length: doc.numPages }, (_, i) => doc.getPage(i + 1)))
  const texts = await Promise.all(pages.map(page => page.getTextContent()))
  const text = texts.flatMap(content => content.items.flatMap(item => 'str' in item ? [item.str] : [])).join('')
  return { doc, pages, text }
}
const image = () => sharp({ create: { width: 100, height: 200, channels: 3, background: '#31583f' } }).jpeg().toBuffer()

describe('portable direct PDF reports', () => {
  it('preserves Chinese, emoji, long-page content and original UTF-8 text in an independent reader', async () => {
    const markdown = '# 中文检查报告\n\n预期／实际：保留 😀 👍\n换行内容\n\n' + Array.from({ length: 90 }, (_, i) => `检查点 ${i + 1}：实际结果保留，不触发提交。`).join('\n')
    const buffer = await pdfReport(markdown), { doc, text } = await readPdf(buffer)
    expect(doc.numPages).toBeGreaterThan(1)
    expect(text).toContain('中文检查报告'); expect(text).toContain('😀'); expect(text).toContain('👍')
    expect(text).toContain('换行内容'); expect(text).toContain('检查点 90')
    expect(text).not.toContain('\uFFFD')
    const attachment = (await doc.getAttachments())!.get('report.md')!
    expect(attachment.filename).toBe('report.md')
    expect(Buffer.from((await doc.getAttachmentContent('report.md'))!).toString('utf8')).toBe(markdown)
  })

  it('embeds a labeled screenshot on a separate page and rejects unreadable evidence', async () => {
    const { doc, pages, text } = await readPdf(await pdfReport('# 截图检查', [{ name: 'frame-1.jpg', observationId: 'current-image', data: await image() }]))
    expect(doc.numPages).toBe(2); expect(text).toContain('截图证据'); expect(text).toContain('current-image')
    const operations = await pages[1]!.getOperatorList()
    expect(operations.fnArray).toContain(OPS.paintImageXObject)
    await expect(pdfReport('Report', [{ name: 'broken.jpg', data: Buffer.from('not an image') }])).rejects.toThrow()
  })

  it('archives PDF and Word at task completion and serves a real PDF without invoking a browser print dialog', async () => {
    const directory = mkdtempSync(join(tmpdir(), 'opengui-pdf-')); cleanup.push(() => rmSync(directory, { recursive: true, force: true }))
    const store = new TaskStore(directory), { viewer, sinks } = setup(undefined, store), host = new FakeHost()
    const jpeg = await image(), original = host.observe.bind(host)
    host.observe = async actor => ({ ...await original(actor), image: { data: jpeg, bytes: jpeg.length, mimeType: 'image/jpeg', width: 100, height: 200, name: 'frame.jpg' } })
    const service = new WorkBuddyOpenGuiService({ viewers: viewer, host }); cleanup.push(() => service.dispose())
    const signal = AbortSignal.timeout(10_000), options = { owner: 'pdf-task', task: createControlTask() }
    const display = await service.openViewer(['phone-a'], signal, options), page = await connect(display.url, 'phone-a')
    sinks.get('phone-a')!.sendBinary(Buffer.from([2])); await page.receipt()
    const session = await service.openSession(['phone-a'], signal, 'control', { ...options, viewerId: display.viewerId, objective: '检查中文页面', successCriteria: '不触发提交' })
    const observed = await service.observe(session.sessionId, undefined, signal)
    const closed = await service.closeSession(session.sessionId, { outcome: 'completed', summary: '检查完成；提交未执行。😀', evidenceObservationIds: [observed.observationId] })
    // The chat presents these as 任务报告.md/.docx/.pdf, in that order.
    const dir = store.path(display.viewerId)
    expect(closed.reportExports).toEqual({ md: join(dir, '任务报告.md'), docx: join(dir, '任务报告.docx'), pdf: join(dir, '任务报告.pdf'), chatMarkdown: `输出文件：\n\n[任务报告.md](${join(dir, '任务报告.md')})　[任务报告.docx](${join(dir, '任务报告.docx')})　[任务报告.pdf](${join(dir, '任务报告.pdf')})` })
    expect(readFileSync(closed.reportExports!.md!, 'utf8')).toContain('检查完成；提交未执行。😀')
    expect(readFileSync(closed.reportExports!.docx!).subarray(0, 2).toString()).toBe('PK')
    const { text, doc } = await readPdf(readFileSync(closed.reportExports!.pdf!))
    expect(text).toContain('检查完成；提交未执行。'); expect(text).toContain('😀'); expect(doc.numPages).toBeGreaterThan(1)
    if (process.platform !== 'win32') expect(statSync(closed.reportExports!.pdf!).mode & 0o077).toBe(0)
    const response = await fetch(`${display.url}report?format=pdf`)
    expect(response.headers.get('content-type')).toBe('application/pdf'); expect(response.headers.get('content-disposition')).toContain(`${reportFileName(viewer.board(display.viewerId).createdAt)}.pdf`)
    expect(response.headers.get('content-disposition')).toMatch(/filename="opengui-report-\d{8}-\d{6}\.pdf"/)
    expect((await fetch(`${display.url}status`).then(r => r.json())).reportFileName).toBe(reportFileName(viewer.board(display.viewerId).createdAt))
    expect((await readPdf(Buffer.from(await response.arrayBuffer()))).text).toContain('检查中文页面')
  })

  it('names archived testing reports 检查报告 and rejects unsafe report names', async () => {
    const directory = mkdtempSync(join(tmpdir(), 'opengui-report-name-')); cleanup.push(() => rmSync(directory, { recursive: true, force: true }))
    const store = new TaskStore(directory), { viewer } = setup(undefined, store), host = new FakeHost()
    const service = new WorkBuddyOpenGuiService({ viewers: viewer, host }); cleanup.push(() => service.dispose())
    const display = await service.openViewer(['phone-a'], AbortSignal.timeout(10_000), { owner: 'name-task', task: createControlTask() })
    viewer.board(display.viewerId).scenario = 'testing'
    await viewer.archiveReports(display.viewerId)
    expect(viewer.reportFiles(display.viewerId)).toMatchObject({ md: join(store.path(display.viewerId), '检查报告.md'), docx: join(store.path(display.viewerId), '检查报告.docx'), pdf: join(store.path(display.viewerId), '检查报告.pdf') })
    expect(viewer.reportFiles(display.viewerId)?.chatMarkdown).toContain('[检查报告.pdf](')
    for (const name of ['../escape', 'a/b', '']) expect(() => store.exportReport(display.viewerId, 'md', 'x', name)).toThrow('invalid_report_name')
  })

  it('builds the chat 输出文件 block with clickable local links, bracketing paths that contain spaces', () => {
    expect(reportLinks({ md: '/r/a/任务报告.md', pdf: '/r/a/任务报告.pdf' })).toBe('输出文件：\n\n[任务报告.md](/r/a/任务报告.md)　[任务报告.pdf](/r/a/任务报告.pdf)')
    expect(reportLinks({ docx: '/Users/John Doe/r/检查报告.docx' })).toBe('输出文件：\n\n[检查报告.docx](</Users/John Doe/r/检查报告.docx>)')
    expect(reportLinks({})).toBeUndefined()
  })

  it('names downloads opengui-report-<task start time to the second>', () => {
    expect(reportFileName(new Date(2026, 9, 4, 18, 14, 5).toISOString())).toBe('opengui-report-20261004-181405')
    expect(reportFileName('not a date')).toBe('opengui-report')
  })
})
