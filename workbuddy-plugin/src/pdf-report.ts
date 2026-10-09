import PDFDocument from 'pdfkit'
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'

const { create } = createRequire(import.meta.url)('fontkit') as { create(data: Buffer): { hasGlyphForCodePoint(code: number): boolean } }
type Face = { name: string; data: Buffer; hasGlyphForCodePoint(code: number): boolean }
let reportFonts: Face[] | undefined
function fonts(): Face[] {
  return reportFonts ??= ['NotoSansSC-Regular.otf', 'NotoEmoji.ttf'].map((file, index) => {
    const data = readFileSync(new URL(`../assets/fonts/${file}`, import.meta.url)), font = create(data)
    return { name: index ? 'Emoji' : 'Report', data, hasGlyphForCodePoint: code => font.hasGlyphForCodePoint(code) }
  })
}
export interface ReportEvidence { name: string; observationId?: string; data: Buffer }

/** Local, selectable Unicode text and embedded screenshot evidence; no browser or remote resources. */
export async function pdfReport(markdown: string, evidence: readonly ReportEvidence[] = []): Promise<Buffer> {
  const doc = new PDFDocument({ size: 'A4', margin: 48, bufferPages: true, info: { Title: 'OpenGUI 任务报告', Author: 'OpenGUI', Creator: 'OpenGUI' } })
  const chunks: Buffer[] = []
  const output = new Promise<Buffer>((resolve, reject) => {
    doc.on('data', (chunk: Buffer) => chunks.push(chunk))
    doc.once('end', () => resolve(Buffer.concat(chunks))); doc.once('error', reject)
  })
  // Attach the original text as data, preserving characters outside the bundled font coverage.
  try {
    const faces = fonts()
    for (const face of faces) doc.registerFont(face.name, face.data)
    const paragraph = (value: string, size: number, color = '#24332a') => {
      const runs: Array<{ font: string; text: string }> = []
      for (const char of value.replace(/[\x00-\x08\x0b\x0c\x0e-\x1f]/gu, '')) {
        const code = char.codePointAt(0)!, face = faces.find(font => font.hasGlyphForCodePoint(code))
        const font = face?.name ?? 'Report', text = face ? char : `[U+${code.toString(16).toUpperCase()}]`
        if (runs.at(-1)?.font === font) runs[runs.length - 1]!.text += text
        else runs.push({ font, text })
      }
      if (!runs.length) { doc.moveDown(0.35); return }
      runs.forEach((run, index) => doc.font(run.font).fontSize(size).fillColor(color).text(run.text, { continued: index < runs.length - 1, lineGap: 3 }))
      doc.font('Report').moveDown(0.3)
    }
    // The report's Markdown subset: headings, a quoted conclusion, key/value and log tables, bullets and
    // per-step screenshots, which are embedded inline as thumbnails (the full set follows as evidence pages).
    const pictures = new Map(evidence.map(item => [item.name, item]))
    for (const raw of markdown.split('\n')) {
      const heading = /^(#{1,3})\s+(.*)$/u.exec(raw)
      if (heading) {
        if (doc.y > doc.page.height - 120) doc.addPage()
        paragraph(heading[2]!, heading[1]!.length === 1 ? 20 : heading[1]!.length === 2 ? 15 : 12, '#31583f'); continue
      }
      if (/^\|\s*-{3}/u.test(raw)) continue
      const row = /^\|(.*)\|\s*$/u.exec(raw)
      if (row) { const cells = row[1]!.split('|').map(value => value.trim()); if (cells.join() === '项目,内容') continue; paragraph(cells.length === 2 ? `${cells[0]}：${cells[1]}` : cells.join('  ·  '), cells.length === 2 ? 10 : 9); continue }
      const image = /^!\[([^\]]*)\]\(evidence\/([^)]+)\)$/u.exec(raw)
      if (image) {
        const item = pictures.get(image[2]!)
        if (!item) { paragraph(`[截图] ${image[1]}`, 9, '#647568'); continue }
        // PDFKit's openImage (missing from its typings) reads the size so the flow continues below the picture.
        const picture = (doc as unknown as { openImage(data: Buffer): { width: number; height: number } }).openImage(item.data), scale = Math.min(170 / picture.width, 230 / picture.height, 1)
        if (doc.y + picture.height * scale + 30 > doc.page.height - 60) doc.addPage()
        paragraph(image[1]!, 9, '#647568')
        const top = doc.y + 2
        doc.image(picture as unknown as Buffer, 48, top, { width: picture.width * scale, height: picture.height * scale })
        doc.x = 48; doc.y = top + picture.height * scale + 10; continue
      }
      const quote = /^>\s?(.*)$/u.exec(raw)
      if (quote) { paragraph(quote[1]!, 11, '#31583f'); continue }
      const bullet = /^-\s+(.*)$/u.exec(raw)
      paragraph(bullet ? `• ${bullet[1]}` : raw, 10)
    }
    for (const item of evidence) {
      doc.addPage()
      paragraph('截图证据 · ' + item.name, 15, '#31583f')
      if (item.observationId) paragraph('观察 ID：' + item.observationId, 9)
      doc.image(item.data, 48, doc.y + 8, { fit: [doc.page.width - 96, doc.page.height - doc.y - 76], align: 'center' })
    }
    doc.file(Buffer.from(markdown), { name: 'report.md', type: 'text/markdown', description: '原始 UTF-8 报告；字体不支持的字符在页面中以 Unicode 编号标注。' })
    const range = doc.bufferedPageRange()
    for (let index = 0; index < range.count; index++) {
      doc.switchToPage(range.start + index)
      doc.font('Report').fontSize(8).fillColor('#647568').text(`OpenGUI · ${index + 1} / ${range.count}`, 48, doc.page.height - 30, { lineBreak: false })
    }
    doc.end()
  } catch (error) { doc.destroy(error instanceof Error ? error : new Error('pdf_generation_failed')) }
  return output
}
