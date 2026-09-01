import type { ClientContext, ISessions } from '@deepseek-ai/dsh-client-runtime/client'
import type {
  ClientSessionContext,
  CommandClaim,
  InputTriggerSource,
  SubmitOutcome,
} from '@deepseek-ai/dsh-client-ui-input-trigger/client'
import { surfaceSessionInList } from './session-bridge.ts'
import { coremateTaskStatusStore } from './task-status-store.ts'

const NAME = 'OpenGUI'
const TOKEN = '@OpenGUI '
const COMMAND = '/opengui'

export interface CoremateLaunchTracker {
  beginLaunch(ownerSessionId?: string): boolean
  finishLaunch(error?: string): void
}

export function taskTitle(task: string): string {
  return `OpenGUI · ${Array.from(task).slice(0, 24).join('')}`
}

export function isUntitledSession(title: string | undefined): boolean {
  const value = title?.trim()
  return value === undefined || value.length === 0 || /^(?:new session|新会话)$/iu.test(value)
}

function launchFailure(reason: unknown): string {
  return reason instanceof Error ? reason.message : String(reason)
}

export const COREMATE_SCENES = [
  {
    name: '自由描述',
    description: '继续输入你希望 OpenGUI 在手机或浏览器上完成的任务',
  },
  {
    name: 'QA 助手',
    description: '走查当前已连接 Android 手机上的 APP，再逐项执行并汇总问题',
    prompt: '作为测试，帮我走查当前已连接 Android 手机上的 APP，先产出测试用例，再按用例逐项执行并汇总问题。',
  },
  {
    name: '运营助手',
    description: '完成基础互动，发布、私信和账号修改等动作前先确认',
    prompt: '作为运营，帮我运营目标平台并完成基础互动；发布、私信、账号修改等外部动作前先征求确认。',
  },
  {
    name: '手游助手',
    description: '领取每日福利，付费、抽卡或资源消耗前先确认',
    prompt: '帮我领取多款游戏的每日福利；遇到付费、抽卡或资源消耗时先征求确认。',
  },
] as const

export function coremateCommandClaim(
  ctx: ClientContext,
  session: ClientSessionContext,
  token = TOKEN,
  launch: CoremateLaunchTracker = coremateTaskStatusStore,
): CommandClaim {
  return {
    token,
    hint: '描述要在手机或浏览器上完成的任务',
    async submit(args): Promise<SubmitOutcome> {
      const sessions = ctx.sessions as unknown as ISessions
      const binding = sessions.binding(session.sessionId)
      if (binding === undefined) return { kind: 'error', text: '当前会话不可用，请刷新后重试。' }
      const task = args.trim()
      const line = task.length === 0 ? COMMAND : `${COMMAND} ${task}`
      if (task.length === 0) {
        const result = await binding.session.command(line)
        if (!result.ok) return { kind: 'error', text: result.error.message }
        return result.value.matched
          ? { kind: 'success' }
          : { kind: 'error', text: 'OpenGUI 命令尚未加载，请重启 DSH 后重试。' }
      }
      if (!launch.beginLaunch(String(session.sessionId))) {
        return { kind: 'error', text: '已有 OpenGUI 任务正在启动或执行，请等待完成后再试。' }
      }
      const row = sessions.list.getSnapshot().byId[session.sessionId]
      if (isUntitledSession(row?.title)) {
        void binding.session.rename(taskTitle(task)).catch(() => {})
      }
      try {
        const pending = binding.session.command(line)
        surfaceSessionInList(sessions, session.sessionId)
        void pending.then(result => {
          if (!result.ok) launch.finishLaunch(result.error.message)
          else if (!result.value.matched) launch.finishLaunch('OpenGUI 命令尚未加载，请重启 DSH 后重试。')
          else launch.finishLaunch()
        }, reason => launch.finishLaunch(launchFailure(reason)))
      } catch (reason) {
        const message = launchFailure(reason)
        launch.finishLaunch(message)
        return { kind: 'error', text: message }
      }
      return { kind: 'success' }
    },
  }
}

function exactToken(line: string): string | undefined {
  const match = /^(@opengui)(?:\s|$)/iu.exec(line)
  return match === null ? undefined : `${match[1]} `
}

/** Native @ trigger that delegates to the canonical /opengui command. */
export function coremateTriggerSource(
  ctx: ClientContext,
  launch: CoremateLaunchTracker = coremateTaskStatusStore,
): InputTriggerSource {
  return {
    trigger: '@',
    name: NAME,
    order: -100,
    async candidates(_session: ClientSessionContext, request) {
      if (request.position !== 'leading') return []
      if (request.query.toLocaleLowerCase() === NAME.toLocaleLowerCase()) {
        return COREMATE_SCENES.map(scene => ({
          name: scene.name,
          description: scene.description,
          icon: scene.name === '自由描述' ? '✎' : '✳',
          hint: scene.name === '自由描述' ? '输入任务' : '填入提示词',
        }))
      }
      return NAME.toLocaleLowerCase().includes(request.query.toLocaleLowerCase())
        ? [{
            name: NAME,
            description: '操作已连接的 Android 手机，按需调用托管浏览器',
            icon: '✳',
            hint: '输入任务',
          }]
        : []
    },
    onPick(pick) {
      if (pick.candidate.name === NAME) {
        const binding = (ctx.sessions as unknown as ISessions).binding(pick.session.sessionId)
        const scoped = binding?.ctx
        if (scoped !== undefined) {
          const applied = scoped.bail(scoped, 'slash/input-insert-text', { text: '@OpenGUI', span: pick.span }) === true
          if (applied) {
            queueMicrotask(() => {
              ctx.inputTriggers.sessionOf(scoped).track('@OpenGUI', '@OpenGUI'.length, { tier: 'plain' }, pick.span.draftRev + 1)
            })
            return 'handled'
          }
        }
        return { text: '@OpenGUI' }
      }
      if (pick.candidate.name === '自由描述') return { claim: coremateCommandClaim(ctx, pick.session, TOKEN, launch) }
      const scene = COREMATE_SCENES.find(item => item.name === pick.candidate.name)
      if (scene !== undefined && 'prompt' in scene) return { text: `@OpenGUI ${scene.prompt}` }
      return { claim: coremateCommandClaim(ctx, pick.session, TOKEN, launch) }
    },
    matchSpace(session, token) {
      return token.toLocaleLowerCase() === '@opengui'
        ? { claim: coremateCommandClaim(ctx, session, `${token} `, launch) }
        : undefined
    },
    async matchEnter(session, line) {
      const token = exactToken(line)
      return token === undefined ? undefined : { claim: coremateCommandClaim(ctx, session, token, launch) }
    },
    lexicon() {
      return [NAME]
    },
  }
}
