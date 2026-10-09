/** Request-scoped progress carries only a short status, never screenshots or review text. */
export type ToolProgress = (message: string) => void

/** Subscribe before inspecting state; mutations wake the waiter without a polling timer. */
export async function waitForEvent(
  subscribe: (listener: () => void) => () => void,
  ready: () => boolean,
  waitMs: number,
  signal: AbortSignal,
): Promise<boolean> {
  signal.throwIfAborted()
  return await new Promise<boolean>((resolve, reject) => {
    let settled = false
    let unsubscribe = (): void => {}
    let timer: ReturnType<typeof setTimeout> | undefined
    const finish = (ready: boolean, error?: unknown): void => {
      if (settled) return
      settled = true; unsubscribe(); clearTimeout(timer); signal.removeEventListener('abort', abort)
      if (error !== undefined) reject(error); else resolve(ready)
    }
    const abort = (): void => finish(false, signal.reason)
    const check = (): void => { try { if (ready()) finish(true) } catch (error) { finish(false, error) } }
    unsubscribe = subscribe(check)
    if (settled) { unsubscribe(); return }
    timer = setTimeout(() => finish(false), Math.max(0, waitMs))
    signal.addEventListener('abort', abort, { once: true })
    if (signal.aborted) abort(); else check()
  })
}
