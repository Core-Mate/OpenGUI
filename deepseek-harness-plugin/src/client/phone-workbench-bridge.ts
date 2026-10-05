/** Accept only task identities from the exact authenticated workbench frame. */
export function acceptedPhoneTask(event: Pick<MessageEvent, 'origin' | 'source' | 'data'>, origin: string, frame: MessageEventSource | null | undefined): string | undefined {
  if (!frame || event.source !== frame || event.origin !== origin) return undefined
  const value = event.data as { type?: unknown; taskId?: unknown } | null
  if (value?.type !== 'opengui-task-accepted' || typeof value.taskId !== 'string') return undefined
  return /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/u.test(value.taskId) ? value.taskId : undefined
}

export interface PhoneWorkbenchViewState { opened: boolean; route: string }
const views = new Map<string, PhoneWorkbenchViewState>()
/** Keep navigation only in this host page, isolated by conversation. No bearer URL is retained. */
export function phoneWorkbenchView(sessionId: string | undefined): PhoneWorkbenchViewState {
  if (!sessionId) return { opened: false, route: 'home' }
  let state = views.get(sessionId)
  if (!state) { state = { opened: false, route: 'home' }; views.set(sessionId, state) }
  return state
}
/** Route notifications never dispatch a task or accept a URL from the frame. */
export function phoneWorkbenchRoute(event: Pick<MessageEvent, 'origin' | 'source' | 'data'>, origin: string, frame: MessageEventSource | null | undefined): string | undefined {
  if (!frame || event.source !== frame || event.origin !== origin) return undefined
  const value = event.data as { type?: unknown; route?: unknown } | null
  if (value?.type !== 'opengui-workbench-route' || typeof value.route !== 'string') return undefined
  return /^(home|devices|tasks|settings|guide|task\/[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12})$/u.test(value.route) ? value.route : undefined
}

export interface PhoneTaskHandoff { taskId: string; key: string }
/** Deduplicate deliveries, while allowing later user replies to wake the same task. */
export function phoneTaskHandoff(event: Pick<MessageEvent, 'origin' | 'source' | 'data'>, origin: string, frame: MessageEventSource | null | undefined): PhoneTaskHandoff | undefined {
  const initial = acceptedPhoneTask(event, origin, frame)
  if (initial) return { taskId: initial, key: initial + ':accepted' }
  if (!frame || event.source !== frame || event.origin !== origin) return undefined
  const value = event.data as { type?: unknown; taskId?: unknown; sequence?: unknown } | null
  if (value?.type !== 'opengui-task-continued' || typeof value.taskId !== 'string' || !/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/u.test(value.taskId)) return undefined
  if (typeof value.sequence !== 'number' || !Number.isSafeInteger(value.sequence) || value.sequence < 1) return undefined
  return { taskId: value.taskId, key: value.taskId + ':' + value.sequence }
}

interface CommandSession {
  getSnapshot(): { nodes: readonly { kind: string; seq: number; name?: string | null; args?: string | null; outcome?: { kind: string } | null }[] }
  subscribe(listener: () => void): () => void
  command(line: string): Promise<{ ok: boolean; value?: { matched: boolean } }>
}
export type PhoneHandoffOutcome = 'accepted' | 'rejected' | 'unknown'
/** Admission is not execution: wait for the host's matching durable command outcome. */
export async function executePhoneHandoff(session: CommandSession, taskId: string, timeoutMs = 30_000): Promise<PhoneHandoffOutcome> {
  const baseline = Math.max(0, ...session.getSnapshot().nodes.map(node => node.seq))
  let finish!: (outcome: PhoneHandoffOutcome) => void
  const settled = new Promise<PhoneHandoffOutcome>(resolve => { finish = resolve })
  const inspect = () => {
    const node = session.getSnapshot().nodes.find(node => node.seq > baseline && node.kind === 'command' && node.name === 'opengui' && node.args?.trim() === `continue ${taskId}` && node.outcome)
    if (node?.outcome) finish(node.outcome.kind === 'success' ? 'accepted' : 'rejected')
  }
  const unsubscribe = session.subscribe(inspect)
  const timer = setTimeout(() => finish('unknown'), timeoutMs)
  // A lost transport reply is ambiguous: the host may still have accepted the command.
  void session.command(`/opengui continue ${taskId}`).then(result => {
    if (result.ok && !result.value?.matched) finish('rejected')
    else inspect()
  }, () => { inspect() })
  try { return await settled } finally { clearTimeout(timer); unsubscribe() }
}
