const ENDPOINT = /(?:停(?:止)?(?:在|到)?|截止(?:到)?|到)[^。！？\n]{0,24}(?:提交|发送|发布|付款|支付)(?:之)?前|\b(?:stop|halt|end|finish)\b[^.!?\n]{0,40}\bbefore\b[^.!?\n]{0,24}\b(?:submit(?:ting)?|submission|send(?:ing)?|publish(?:ing)?|payment|paying)\b|\bbefore\s+(?:final\s+)?(?:submit|submission)\b/iu
// A prohibition only latches when the final action itself is the whole clause:
// "不要提交" / "don't send" do, while "不要发送广告" / "don't send duplicates" constrain content.
const PROHIBITION = /^(?:请)?(?:不要|禁止|不能|不得|不允许|别|勿)(?:真正|真的|实际|最终|直接|去)?(?:点击?|按下?)?(?:最终的?)?(?:提交|发送|发布|付款|支付)(?:按钮|表单|操作|出去|评论|回复|订单)?$|^(?:please\s+)?(?:do not|don't|never)\s+(?:actually\s+|really\s+)?(?:submit|send|publish|pay)(?:\s+(?:it|anything|the\s+(?:form|order|comment|reply)))?$/iu
// In a review workflow, "do not send" describes unapproved sends; the review gate enforces that.
const REVIEW_GATED = /审核|审批|批准|过目|确认后|\b(?:review|approv)/iu

/** Conservative recognition of explicit pre-submit endpoints; no prompt is retained. */
export function requestsPreSubmitStop(value: unknown): boolean {
  if (typeof value !== 'string') return false
  if (ENDPOINT.test(value)) return true
  if (REVIEW_GATED.test(value)) return false
  return value.split(/[。！？!?;；，,、.\n]+/u).some(clause => PROHIBITION.test(clause.trim()))
}

export function violatesPreSubmitStop(input: Record<string, unknown>): boolean {
  return ['submit', 'send', 'publish', 'purchase', 'delete'].includes(String(input.externalSideEffect)) || input.action === 'key' && input.key === 'Enter'
}

/** Omission cannot silently classify a visual gesture as having no side effects. */
export function requiresPreSubmitClassification(input: Record<string, unknown>): boolean {
  return (input.action === 'tap' || input.action === 'swipe') && input.externalSideEffect === undefined
}
