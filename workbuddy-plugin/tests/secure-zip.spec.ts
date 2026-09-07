import { createWriteStream } from 'node:fs'
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { pipeline } from 'node:stream/promises'
import { afterEach, describe, expect, it } from 'vitest'
import yazl from 'yazl'
import { extractSafeZip } from '../src/secure-zip.ts'

const temporary: string[] = []

async function archive(name: string, mode = 0o100644): Promise<{ root: string, path: string }> {
  const root = await mkdtemp(join(tmpdir(), 'coremate-zip-test-'))
  temporary.push(root)
  const path = join(root, 'archive.zip')
  const zip = new yazl.ZipFile()
  zip.addBuffer(Buffer.from('safe payload'), name, { mode })
  zip.end()
  await pipeline(zip.outputStream, createWriteStream(path))
  return { root, path }
}

afterEach(async () => {
  await Promise.all(temporary.splice(0).map(path => rm(path, { recursive: true, force: true })))
})

describe('safe ZIP extraction', () => {
  it('extracts ordinary files inside the selected destination', async () => {
    const fixture = await archive('bundle/tool')
    const destination = join(fixture.root, 'output')

    await extractSafeZip(fixture.path, destination)

    await expect(readFile(join(destination, 'bundle/tool'), 'utf8')).resolves.toBe('safe payload')
  })

  it('rejects symbolic-link entries before materializing them', async () => {
    const fixture = await archive('bundle/link', 0o120777)
    const destination = join(fixture.root, 'output')

    await expect(extractSafeZip(fixture.path, destination)).rejects.toThrow('unsafe ZIP symbolic link')
  })

  it('rejects parent traversal even when it is encoded directly in the archive directory', async () => {
    const fixture = await archive('safe.txt')
    const bytes = await readFile(fixture.path)
    const safeName = Buffer.from('safe.txt')
    const unsafeName = Buffer.from('../x.txt')
    for (let offset = bytes.indexOf(safeName); offset !== -1; offset = bytes.indexOf(safeName, offset + safeName.length)) {
      unsafeName.copy(bytes, offset)
    }
    await writeFile(fixture.path, bytes)

    await expect(extractSafeZip(fixture.path, join(fixture.root, 'output'))).rejects.toThrow(/invalid relative path|unsafe ZIP entry path/u)
  })
})
