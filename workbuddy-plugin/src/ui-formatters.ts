import type { TaskProgress } from './todos.ts'
import type { UiLocale } from './ui-i18n.ts'

type Translator = (message: string, values?: Record<string, string | number>) => string

/** Localize runtime-owned progress chrome while retaining the person's step text verbatim. */
export function formatUiProgress(progress: TaskProgress | undefined, locale: UiLocale, t: Translator): string {
  if (!progress) return ''
  if (locale === 'zh-CN') return progress.message
  if (!Number.isInteger(progress.completed) || !Number.isInteger(progress.total)) return t(progress.message)
  const detail = progress.completed === progress.total ? t('任务步骤已全部完成')
    : progress.awaitingUser ? t('等待用户处理：{step}', { step: progress.currentNode ?? '' })
    : progress.currentNode ? t('正在执行：{step}', { step: progress.currentNode })
    : progress.pending ? t('等待开始下一步')
    : t('检查已结束，失败 {failed}，跳过 {skipped}', { failed: progress.failed ?? 0, skipped: progress.skipped ?? 0 })
  return t('已完成 {completed} / {total}，{detail}', { completed: progress.completed, total: progress.total, detail })
}

/** Match only labels produced by trace-labels.ts; targets and app names keep their original text. */
export function formatUiTrace(label: string | undefined, kind: string, locale: UiLocale, t: Translator): string {
  if (!label) return ''
  if (locale === 'zh-CN') return label
  const exact = t(label)
  if (exact !== label) return exact
  const patterns: Array<[RegExp, string, string[]]> = kind === 'launch' ? [[/^启动 (.+)$/u, '启动 {app}', ['app']]]
    : kind === 'observe' ? [[/^查看 (.+) 画面$/u, '查看 {app} 画面', ['app']]]
    : kind === 'text' ? [[/^填入评论(「.*」)?$/u, '填入评论{target}', ['target']], [/^(?:在(「.*」))?输入文本（(\d+) 字）$/u, '输入文本{target}（{count} 字）', ['target', 'count']]]
    : kind === 'replace_text' ? [[/^替换(「.*」)中的文字$/u, '替换{target}中的文字', ['target']]]
    : kind === 'tap' || kind === 'swipe' ? [[/^(点击提交|点击发送|点击发布|点击支付|点击删除|点击|向上滑动|向下滑动|向左滑动|向右滑动|长按|滑动)(「.*」)?$/u, '{action}{target}', ['action', 'target']]] : []
  for (const [pattern, message, names] of patterns) {
    const match = pattern.exec(label)
    if (match) return t(message, Object.fromEntries(names.map((name, index) => [name, name === 'action' ? t(match[index + 1] ?? '') : match[index + 1] ?? ''])))
  }
  return label
}

/** Environment metadata is runtime-owned; values such as versions and permissions stay intact. */
export function formatUiEnvironment(message: string, t: Translator): string {
  const translated = t(message)
  if (translated !== message) return translated
  const patterns: Array<[RegExp, string, string[]]> = [
    [/^权限 (.+)$/u, '权限 {permission}', ['permission']],
    [/^SDK (\d+)；要求 SDK ≥ (\d+)$/u, 'SDK {actual}；要求 SDK ≥ {required}', ['actual', 'required']],
    [/^实际 (.+)；要求 (.+)$/u, '实际 {actual}；要求 {required}', ['actual', 'required']],
    [/^实际 (.+)；未指定要求版本$/u, '实际 {actual}；未指定要求版本', ['actual']],
  ]
  for (const [pattern, key, names] of patterns) {
    const match = pattern.exec(message)
    if (match) return t(key, Object.fromEntries(names.map((name, index) => [name, match[index + 1]!])) )
  }
  return message
}
