import { closeSync, existsSync, fsyncSync, lstatSync, mkdirSync, openSync, readFileSync, readdirSync, renameSync, unlinkSync, writeFileSync } from 'node:fs'
import { randomUUID } from 'node:crypto'
import { join } from 'node:path'
import type { WorkbenchState, CommentReview } from './workbench.ts'
import type { TaskStep } from './todos.ts'

export interface StoredTask {
  version: 1
  id: string
  owner: string
  principal?: string
  devices: readonly { id: string; serial: string; name: string }[]
  board: WorkbenchState
  todos: readonly TaskStep[]
  updatedAt: string
  displayError?: string | undefined
}

/** Local task records contain data, never control grants or reusable observations. */
export class TaskStore {
  constructor(readonly directory: string) {
    mkdirSync(directory, { recursive: true, mode: 0o700 })
    const info = lstatSync(directory)
    if (!info.isDirectory() || info.isSymbolicLink() || (process.platform !== 'win32' && (info.uid !== process.getuid?.() || (info.mode & 0o077)))) throw new Error('unsafe_task_store')
  }

  path(id: string): string {
    if (!/^[0-9a-f-]{36}$/iu.test(id)) throw new Error('invalid_task_id')
    return join(this.directory, id)
  }
  private directoryInfo(path: string): void {
    const info = lstatSync(path)
    if (!info.isDirectory() || info.isSymbolicLink() || (process.platform !== 'win32' && (info.uid !== process.getuid?.() || (info.mode & 0o077)))) throw new Error('unsafe_task_directory')
  }

  private write(path: string, data: string | Buffer): void {
    const temporary = `${path}.${randomUUID()}.tmp`
    const file = openSync(temporary, 'wx', 0o600)
    try { writeFileSync(file, data); fsyncSync(file) } finally { closeSync(file) }
    try { renameSync(temporary, path) } catch (error) { unlinkSync(temporary); throw error }
    if (process.platform !== 'win32') {
      const directory = openSync(join(path, '..'), 'r')
      try { fsyncSync(directory) } finally { closeSync(directory) }
    }
  }

  save(task: StoredTask, markdown: string): void {
    const directory = this.path(task.id)
    mkdirSync(directory, { mode: 0o700, recursive: true })
    this.directoryInfo(directory)
    // The record is committed last. A failed write never authorizes a dependent action.
    this.write(join(directory, 'report.md'), markdown)
    this.write(join(directory, 'task.json'), JSON.stringify(task))
  }

  evidence(id: string, name: string, data: Buffer): void {
    if (!/^frame-[0-9]+\.jpg$/u.test(name)) throw new Error('invalid_evidence_name')
    const directory = join(this.path(id), 'evidence')
    mkdirSync(directory, { recursive: true, mode: 0o700 })
    this.directoryInfo(this.path(id)); this.directoryInfo(directory)
    this.write(join(directory, name), data)
  }

  /** `name` is the user-facing file name shown when the host presents the archived report. */
  exportReport(id: string, format: 'md' | 'pdf' | 'docx', data: string | Buffer, name = 'report'): string {
    if (!/^[\p{L}\p{N}_-]{1,64}$/u.test(name)) throw new Error('invalid_report_name')
    const directory = this.path(id); this.directoryInfo(directory)
    const path = join(directory, `${name}.${format}`)
    this.write(path, data)
    return path
  }

  load(id: string): StoredTask {
    this.directoryInfo(this.path(id))
    const path = join(this.path(id), 'task.json')
    const info = lstatSync(path)
    if (!info.isFile() || info.isSymbolicLink()) throw new Error('unsafe_task_record')
    const record = JSON.parse(readFileSync(path, 'utf8')) as StoredTask
    if (record.version !== 1 || record.id !== id || !Array.isArray(record.devices) || !Array.isArray(record.todos) || !record.board || !Array.isArray(record.board.reviews)) throw new Error('invalid_task_record')
    return record
  }

  list(): StoredTask[] {
    return readdirSync(this.directory).filter(id => /^[0-9a-f-]{36}$/iu.test(id) && existsSync(join(this.path(id), 'task.json')))
      .map(id => this.load(id)).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
  }

  previousComment(account: string, target: string, currentTask: string, principal = 'local'): CommentReview | undefined {
    // Corrupt or unreadable history fails closed rather than silently dropping deduplication.
    return this.list().filter(task => task.id !== currentTask && (task.principal ?? 'local') === principal).flatMap(task => task.board.reviews)
      .find(review => review.account === account && review.target === target && ['sent', 'submitted', 'unknown'].includes(review.status))
  }

  readEvidence(id: string, name: string): Buffer {
    if (!/^frame-[0-9]+\.jpg$/u.test(name)) throw new Error('invalid_evidence_name')
    this.directoryInfo(this.path(id)); this.directoryInfo(join(this.path(id), 'evidence'))
    const path = join(this.path(id), 'evidence', name), info = lstatSync(path)
    if (!info.isFile() || info.isSymbolicLink()) throw new Error('unsafe_evidence_file')
    return readFileSync(path)
  }
}
