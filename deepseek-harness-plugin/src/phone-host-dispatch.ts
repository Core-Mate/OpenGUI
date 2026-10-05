import { createUserMessage, type UserMessage } from '@deepseek-ai/dsh-llm'
import type { Context } from '@deepseek-ai/cordis'

/** Normal replies can finish while a phone task waits for user assistance. */
export function bindHostPhoneLifecycle(
  ctx: Pick<Context, 'on'>,
  interrupt: (owner: string) => Promise<void>,
  onError: () => void,
): void {
  const stop = async (owner: unknown): Promise<void> => {
    if (typeof owner !== 'string' || !owner.trim()) return
    try { await interrupt(owner) } catch { onError() }
  }
  // DSH skips turn-stopping when the turn signal has already aborted.
  // The durable turn/end event is emitted from the loop's finally block.
  ctx.on('session/event', (session, event) => {
    if (event.type === 'turn/end' && event.data.reason.kind === 'aborted') void stop(session.id)
  })
  ctx.on('agent/disposed', ({ agent }) => { void stop(agent.session.id) })
}

/** Submit once, then wake the current host agent through its public inbox API. */
export async function dispatchHostPhoneTask(
  agent: { followup?: (message: UserMessage) => void },
  submit: () => Promise<unknown>,
  cancel: (id: string) => Promise<unknown>,
): Promise<unknown> {
  if (typeof agent.followup !== 'function') throw new Error('当前 DSH 版本无法唤起宿主执行，请升级 DSH 后重试。')
  const result = await submit()
  const id = (result as { id?: unknown } | null)?.id
  if (typeof id !== 'string' || !id) throw new Error('OpenGUI did not return a task identity')
  try {
    agent.followup(createUserMessage({
      source: { kind: 'plugin', plugin: 'dsh-coremate-mobile' },
      content: [{ type: 'text', text: `Continue the user's accepted OpenGUI phone task ${id}. Do not submit a duplicate task. Use opengui_manage_task next/decide with taskId ${id} to plan and execute with your current host model. Inspect each returned image and follow its coordinate and completion contracts. Continue until terminal or waiting for user help. Use status for this task to verify the result. Never substitute shell/ADB or configure another model.` }],
    }))
  } catch (error) {
    // A failed wakeup must not leave an accepted task waiting invisibly.
    await cancel(id)
    throw error
  }
  return result
}
