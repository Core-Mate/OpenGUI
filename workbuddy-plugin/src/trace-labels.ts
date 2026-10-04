/**
 * Human-readable run-log names derived from data the runtime already has (action, package,
 * gesture direction). No model output is requested, so naming costs no extra tokens.
 * Typed text is never included; only its length is shown.
 */
const APPS: Record<string, string> = {
  'com.xingin.xhs': '小红书', 'com.ss.android.ugc.aweme': '抖音', 'com.tencent.mm': '微信', 'com.tencent.mobileqq': 'QQ',
  'com.taobao.taobao': '淘宝', 'com.eg.android.AlipayGphone': '支付宝', 'com.sina.weibo': '微博', 'com.jingdong.app.mall': '京东',
  'com.sankuai.meituan': '美团', 'com.zhihu.android': '知乎', 'tv.danmaku.bili': '哔哩哔哩', 'com.android.chrome': 'Chrome',
  'com.google.android.gm': 'Gmail', 'com.android.email': '邮件', 'com.android.settings': '设置', 'com.opengui.qa': 'OpenGUI QA',
  'com.google.android.googlequicksearchbox': 'Google App', 'com.google.android.youtube': 'YouTube', 'com.google.android.apps.maps': 'Google 地图',
  'com.google.android.apps.photos': 'Google 相册', 'com.android.vending': 'Google Play', 'com.google.android.calendar': '日历',
  'com.google.android.dialer': '电话', 'com.google.android.apps.messaging': '信息', 'com.google.android.contacts': '通讯录',
  'com.google.android.deskclock': '时钟', 'com.android.camera2': '相机', 'com.google.android.GoogleCamera': '相机',
}

export function appName(packageName: unknown): string | undefined {
  if (typeof packageName !== 'string' || !packageName) return undefined
  if (/launcher/iu.test(packageName)) return '桌面'
  return APPS[packageName] ?? packageName
}

const KEYS: Record<string, string> = { Back: '返回上一页', Home: '回到桌面', Enter: '回车确认', AppSwitch: '查看最近任务' }
const SIDE_EFFECTS: Record<string, string> = { submit: '点击提交', send: '点击发送', publish: '点击发布', purchase: '点击支付', delete: '点击删除' }

export function actionLabel(input: Record<string, unknown>): string {
  switch (input.action) {
    case 'launch': return `启动 ${appName(input.packageName) ?? '应用'}`
    case 'tap': return SIDE_EFFECTS[String(input.externalSideEffect)] ?? '点击'
    case 'swipe': {
      const dx = Number(input.x2) - Number(input.x1), dy = Number(input.y2) - Number(input.y1)
      if (![dx, dy].every(Number.isFinite)) return '滑动'
      if (Math.abs(dx) < 8 && Math.abs(dy) < 8) return '长按'
      return Math.abs(dy) >= Math.abs(dx) ? (dy < 0 ? '向上滑动' : '向下滑动') : (dx < 0 ? '向左滑动' : '向右滑动')
    }
    case 'text': return typeof input.reviewId === 'string' ? '填入评论' : `输入文本（${[...String(input.text ?? '')].length} 字）`
    case 'replace_text': return '替换输入框文字'
    case 'key': return KEYS[String(input.key)] ?? '按键'
    case 'wait': return '等待页面加载'
    default: return '设备操作'
  }
}

export function observationLabel(foregroundPackage: unknown): string {
  const app = appName(foregroundPackage)
  return app === '桌面' ? '查看桌面' : app ? `查看 ${app} 画面` : '查看当前画面'
}
