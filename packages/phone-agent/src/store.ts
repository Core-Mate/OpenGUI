import { mkdir, open, readFile, readdir, truncate, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import type { Task } from './contracts.ts'

/** Durable snapshots in an append-only journal. A torn final record is ignored. */
export class TaskStore {
  private pending = Promise.resolve()
  constructor(readonly root: string) {}
  async events(id: string): Promise<{ sequence: number; event: string; at: string; step: number; summary: string; action?: string }[]> {
    const lines = (await readFile(join(this.root, id + '.jsonl'), 'utf8')).split('\n'); lines.pop()
    return lines.map(line => {
      const { task, event } = JSON.parse(line) as { task: Task; event: string }
      return { sequence: task.sequence, event, at: task.updatedAt, step: task.steps, summary: task.summary,
        ...(typeof task.lastAction?.action === 'string' ? { action: task.lastAction.action } : {}) }
    })
  }
  async load(): Promise<Task[]> {
    await mkdir(this.root, { recursive: true, mode: 0o700 })
    const tasks: Task[] = []
    for (const file of await readdir(this.root)) {
      if (!/^[a-f0-9-]+\.jsonl$/.test(file)) continue
      const path = join(this.root, file)
      const raw = await readFile(path, 'utf8')
      const lines = raw.split('\n')
      const tail = lines.pop()
      if (tail) {
        await writeFile(path + '.incomplete', tail, { mode: 0o600 })
        await truncate(path, Buffer.byteLength(raw) - Buffer.byteLength(tail))
      }
      let latest: Task | undefined
      for (const line of lines) {
        const event = JSON.parse(line) as { version: number; task: Task }
        if (event.version !== 1) throw new Error('Unsupported task journal version')
        if (event.task.id + '.jsonl' !== file) throw new Error('Invalid task journal identity')
        latest = event.task
      }
      if (latest) tasks.push(latest)
    }
    return tasks
  }
  append(task: Task, event: string): Promise<void> {
    const data = JSON.stringify({ version: 1, event, task }) + '\n'
    const next = this.pending.then(async () => {
      const file = await open(join(this.root, task.id + '.jsonl'), 'a', 0o600)
      try { await file.writeFile(data); await file.sync() } finally { await file.close() }
    })
    this.pending = next.catch(() => {})
    return next
  }
}
