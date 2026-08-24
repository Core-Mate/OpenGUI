/** Fair abort-aware permit pool used to bound expensive host/device media work. */
export class AsyncSemaphore {
  private active = 0
  private readonly queued: Array<{
    readonly signal: AbortSignal
    readonly resolve: (release: () => void) => void
    readonly reject: (reason: unknown) => void
  }> = []

  constructor(readonly limit: number) {
    if (!Number.isSafeInteger(limit) || limit < 1) throw new Error('semaphore limit must be a positive integer')
  }

  async acquire(signal: AbortSignal): Promise<() => void> {
    signal.throwIfAborted()
    if (this.active < this.limit) return this.grant()
    return await new Promise<() => void>((resolvePermit, rejectPermit) => {
      const request = { signal, resolve: resolvePermit, reject: rejectPermit }
      const onAbort = (): void => {
        const index = this.queued.indexOf(request)
        if (index >= 0) this.queued.splice(index, 1)
        rejectPermit(signal.reason)
      }
      signal.addEventListener('abort', onAbort, { once: true })
      this.queued.push({
        ...request,
        resolve: release => {
          signal.removeEventListener('abort', onAbort)
          resolvePermit(release)
        },
      })
    })
  }

  private grant(): () => void {
    this.active += 1
    let released = false
    return () => {
      if (released) return
      released = true
      this.active -= 1
      while (this.queued.length > 0) {
        const next = this.queued.shift()!
        if (next.signal.aborted) {
          next.reject(next.signal.reason)
          continue
        }
        next.resolve(this.grant())
        break
      }
    }
  }
}
