import { crc32 } from 'node:zlib'

/** Small uncompressed ZIP writer for local reports and already-compressed JPEGs. */
export function zip(files: readonly { name: string; data: Buffer }[]): Buffer {
  const locals: Buffer[] = [], entries: Buffer[] = []
  let offset = 0
  for (const file of files) {
    const name = Buffer.from(file.name), checksum = crc32(file.data)
    const local = Buffer.alloc(30)
    local.writeUInt32LE(0x04034b50); local.writeUInt16LE(20, 4); local.writeUInt16LE(0x800, 6)
    local.writeUInt16LE(0x21, 12); local.writeUInt32LE(checksum, 14)
    local.writeUInt32LE(file.data.length, 18); local.writeUInt32LE(file.data.length, 22); local.writeUInt16LE(name.length, 26)
    const entry = Buffer.alloc(46)
    entry.writeUInt32LE(0x02014b50); entry.writeUInt16LE(20, 4); entry.writeUInt16LE(20, 6); entry.writeUInt16LE(0x800, 8)
    entry.writeUInt16LE(0x21, 14); entry.writeUInt32LE(checksum, 16)
    entry.writeUInt32LE(file.data.length, 20); entry.writeUInt32LE(file.data.length, 24); entry.writeUInt16LE(name.length, 28); entry.writeUInt32LE(offset, 42)
    locals.push(local, name, file.data); entries.push(entry, name)
    offset += local.length + name.length + file.data.length
  }
  const directory = Buffer.concat(entries), end = Buffer.alloc(22)
  end.writeUInt32LE(0x06054b50); end.writeUInt16LE(files.length, 8); end.writeUInt16LE(files.length, 10)
  end.writeUInt32LE(directory.length, 12); end.writeUInt32LE(offset, 16)
  return Buffer.concat([...locals, directory, end])
}

export function wordReport(markdown: string): Buffer {
  const escape = (value: string) => value.replace(/[\x00-\x08\x0b\x0c\x0e-\x1f]/g, '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
  // The same Markdown subset as the PDF: tables become key：value or dotted rows, bullets and the
  // quoted conclusion keep their meaning, and screenshots are referenced by name.
  const text = (line: string): string | undefined => {
    if (/^\|\s*-{3}/u.test(line)) return undefined
    const row = /^\|(.*)\|\s*$/u.exec(line)
    if (row) { const cells = row[1]!.split('|').map(value => value.trim()); if (cells.join() === '项目,内容') return undefined; return cells.length === 2 ? `${cells[0]}：${cells[1]}` : cells.join('  ·  ') }
    const image = /^!\[([^\]]*)\]\(([^)]+)\)$/u.exec(line)
    if (image) return `[截图] ${image[1]}（${image[2]}）`
    return line.replace(/^#+ /u, '').replace(/^>\s?/u, '').replace(/^-\s+/u, '• ')
  }
  const paragraphs = markdown.split('\n').flatMap(line => {
    const value = text(line)
    if (value === undefined) return []
    const heading = line.startsWith('#'), quote = line.startsWith('>')
    return [`<w:p>${heading ? '<w:pPr><w:spacing w:before="180" w:after="100"/></w:pPr>' : ''}<w:r>${heading || quote ? '<w:rPr><w:b/></w:rPr>' : ''}<w:t xml:space="preserve">${escape(value)}</w:t></w:r></w:p>`]
  }).join('')
  return zip([
    { name: '[Content_Types].xml', data: Buffer.from('<?xml version="1.0" encoding="UTF-8"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>') },
    { name: '_rels/.rels', data: Buffer.from('<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>') },
    { name: 'word/document.xml', data: Buffer.from(`<?xml version="1.0" encoding="UTF-8"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>${paragraphs}<w:sectPr><w:pgSz w:w="11906" w:h="16838"/><w:pgMar w:top="1134" w:right="1134" w:bottom="1134" w:left="1134"/></w:sectPr></w:body></w:document>`) },
  ])
}
