import { readFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { parse } from 'yaml'

const root = new URL('../', import.meta.url)

describe('standalone DeepSeek Harness bundle', () => {
  it('publishes a patch that inserts only this external plugin', async () => {
    const packageJson = JSON.parse(await readFile(new URL('package.json', root), 'utf8')) as {
      name: string
      repository: { type: string; url: string; directory: string }
      exports: Record<string, unknown>
      files: string[]
      dsh: { bundle: { patch: string }; client: { inject: string[]; platform: string } }
    }
    const patchPath = new URL(packageJson.dsh.bundle.patch, root)
    const patch = parse(await readFile(patchPath, 'utf8')) as unknown

    expect(fileURLToPath(patchPath)).toBe(fileURLToPath(new URL('cordis.patch.yml', root)))
    expect(packageJson.name).toBe('dsh-coremate-mobile')
    expect(packageJson.repository).toEqual({
      type: 'git',
      url: 'git+https://github.com/Core-Mate/OpenGUI.git',
      directory: 'deepseek-harness-plugin',
    })
    expect(packageJson.exports['./client']).toBeDefined()
    expect(packageJson.files).toContain('lib/client.js')
    expect(packageJson.dsh.client).toEqual({
      inject: [
        '@deepseek-ai/dsh-client-runtime',
        '@deepseek-ai/dsh-client-connection',
        '@deepseek-ai/dsh-client-ui-conversation',
        '@deepseek-ai/dsh-client-ui-input-trigger',
        '@deepseek-ai/dsh-client-ui-layout',
      ],
      platform: 'web',
    })
    expect(patch).toEqual([{
      insert: [{ id: 'coremate-mobile', name: 'dsh-coremate-mobile' }],
    }])
  })

  it('keeps OpenGUI controls in its view while retaining task stop inside the composer', async () => {
    const [clientSource, viewSource, noticeSource, promotionSource, hostSource] = await Promise.all([
      readFile(new URL('src/client/index.tsx', root), 'utf8'),
      readFile(new URL('src/client/CoremateView.tsx', root), 'utf8'),
      readFile(new URL('src/client/CoremateTaskNotice.tsx', root), 'utf8'),
      readFile(new URL('src/client/CorematePromotionCard.tsx', root), 'utf8'),
      readFile(new URL('src/index.ts', root), 'utf8'),
    ])

    expect(clientSource).not.toContain("'conversation.composer.dock'")
    expect(clientSource).toContain("'conversation.input.right'")
    expect(clientSource).toContain("'conversation.view'")
    expect(clientSource).toContain("label: 'OpenGUI'")
    expect(clientSource).not.toContain("'coremate-mobile-browser-install'")
    expect(clientSource).not.toContain('MirrorButton')
    expect(viewSource).toContain('<BrowserInstallPrompt />')
    expect(viewSource).toContain('<PluginUpdatePrompt />')
    expect(viewSource).toContain('data-coremate-device-wall')
    expect(viewSource).toContain('data-coremate-connect-more')
    expect(viewSource).toContain('https://opengui.ai/')
    expect(noticeSource).toContain('请前往 OpenGUI Tab')
    expect(promotionSource).toContain('https://github.com/Core-Mate/OpenGUI/blob/main/deepseek-harness-plugin/docs/use-cases.zh.md')
    expect(promotionSource).not.toContain('Coremate-Mobile-Plugin')
    expect(viewSource).toContain('设备检测异常')
    expect(viewSource).toContain('正在自动重试')
    expect(hostSource).toContain('连接完成后点击“重新检测”')
    expect(clientSource).not.toContain("'shell.overlay'")
  })

  it('prepares the model before waiting for an explicit phone selection', async () => {
    const [hostSource, configurationSource] = await Promise.all([
      readFile(new URL('src/index.ts', root), 'utf8'),
      readFile(new URL('src/configuration.ts', root), 'utf8'),
    ])
    const prepareIndex = hostSource.indexOf('const route = await prepareTask(interaction)')
    const deviceIndex = hostSource.indexOf('const targets = await waitForSelectedPhone(interaction)')

    expect(prepareIndex).toBeGreaterThan(-1)
    expect(deviceIndex).toBeGreaterThan(-1)
    expect(prepareIndex).toBeLessThan(deviceIndex)
    expect(hostSource).toContain('当前模型没有注明是否支持图片输入和工具调用。它是否具备这些能力？')
    expect(hostSource).toContain("status: 'cancelled' as const")
    expect(hostSource).toContain("status: 'completed' as const")
    expect(hostSource).toContain('本次 OpenGUI 任务未执行')
    expect(configurationSource).not.toContain('开始配置')
    expect(configurationSource.indexOf('await askCapabilityConfirmation'))
      .toBeLessThan(configurationSource.indexOf('await services.storeCredential'))
  })

  it('keeps the stop glyph visible independently of the host foreground color', async () => {
    const stopButtonSource = await readFile(new URL('src/client/TaskStopButton.tsx', root), 'utf8')

    expect(stopButtonSource).toContain("background: '#dc2626'")
    expect(stopButtonSource).not.toContain("background: 'currentColor'")
  })

  it('renders a full embedded canvas, moves scenarios into @, and names the optional mirror an independent window', async () => {
    const [view, stream, mirror, trigger] = await Promise.all([
      readFile(new URL('src/client/CoremateView.tsx', root), 'utf8'),
      readFile(new URL('src/client/PhoneStream.tsx', root), 'utf8'),
      readFile(new URL('src/client/MirrorButton.tsx', root), 'utf8'),
      readFile(new URL('src/client/coremate-trigger.ts', root), 'utf8'),
    ])

    expect(view).toContain('<PhoneStream device={device} expanded={open} streamStatus={streamStatus} streamStatusError={streamStatusError} />')
    expect(stream).not.toContain('首次启用实时画面需要下载并校验 scrcpy')
    expect(stream).toContain('正在准备实时画面')
    expect(stream).toContain("() => fallback('实时画面解码失败，已切换为截图预览。')")
    expect(stream).not.toContain('error.message}`')
    expect(stream).toContain("value.type === 'waiting') fallback(value.message ?? '实时画面正在等待空位', true)")
    expect(stream).toContain("websocket.onerror = () => fallback('实时画面连接失败，已切换为截图预览。', true)")
    expect(view).not.toContain('height: 360')
    expect(view).not.toContain('从常用场景开始')
    expect(view).toContain("'收起' : '展开'")
    expect(view).toContain("'关闭窗口' : '独立窗口'")
    expect(view).not.toContain('等待新设备')
    expect(stream).toContain('<canvas')
    expect(stream).toContain("maxWidth: '100%'")
    expect(stream).toContain('截图预览')
    expect(mirror).toContain('在独立窗口查看')
    expect(mirror).not.toContain('EyeIcon')
    expect(trigger).toContain("name: 'QA 助手'")
  })
})
