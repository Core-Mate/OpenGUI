#!/usr/bin/env python3
"""Build the standalone post-install guide and pin its public bootstrap inputs."""
from pathlib import Path
import base64
import hashlib
from html import escape
import re

ROOT = Path(__file__).resolve().parents[1]
original = (ROOT / 'resources/OpenGUI-安装指南.html').read_text()
style = re.search(r'  <style>.*?</style>', original, re.S).group(0)
style = style.replace('</style>', """
    ::selection { background: #d5e9dc; color: #173e28; }
    .finish { padding-bottom: 32px; }
    .quick-start { padding-bottom: 8px; border-bottom: 0; }
    .quick-start h2 { font-size: 24px; }
    .setup { max-width: 70ch; margin-top: 14px; }
    .example-note { color: #58645c; font-size: 14px; margin-top: 10px; }
    .example { margin-top: 28px; }
    .example-heading { display: flex; align-items: center; justify-content: space-between; gap: 16px; margin-bottom: 12px; }
    .example h3 { margin: 0; font-size: 18px; line-height: 1.5; font-weight: 650; }
    .example h3 span { color: #58645c; font-weight: 400; }
    .prompt { margin: 0; padding: 22px 24px; border-radius: 12px; background: #f0f5f1; color: #234431; white-space: pre-wrap; overflow-wrap: anywhere; font: inherit; line-height: 1.85; }
    .prompt code { padding: 0; background: none; border-radius: 0; font: inherit; }
    .copy { display: inline-flex; align-items: center; justify-content: center; gap: 7px; min-height: 44px; padding: 8px 12px; flex: 0 0 auto; border: 1px solid #d1ddd4; border-radius: 8px; background: #fff; color: #1d5b3b; font: inherit; font-size: 14px; font-weight: 600; cursor: pointer; }
    .copy:hover { background: #edf5ef; border-color: #83a78f; }
    .copy:active { background: #dcebdd; }
    .copy:focus-visible, .prompt:focus-visible { outline: 3px solid #24754b; outline-offset: 4px; }
    .copy svg { width: 17px; height: 17px; flex: 0 0 auto; }
    .copy-status { min-height: 1.8em; margin-top: 6px; color: #476150; font-size: 13px; }
    @media (max-width: 600px) { .quick-start h2 { font-size: 22px; } .example-heading { align-items: flex-start; gap: 8px; } .example h3 { font-size: 17px; padding-top: 8px; } .prompt { padding: 18px; } .copy { padding-inline: 10px; } }
  </style>""")
style = re.sub(r'[ \t]+\n', '\n', style)
prompt = '/opengui 帮我测试【应用／页面】的【功能或操作流程】，重点检查【关注的问题】。如果发现异常，记录操作步骤和截图，当做到【结束条件】就停。'
examples = ''.join(f'''    <article class="example" aria-labelledby="example-{key}">
      <div class="example-heading">
        <h3 id="example-{key}"><span>试一试：</span>{title}</h3>
        <button class="copy" type="button" data-copy="prompt-{key}" aria-label="复制{title}指令">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" aria-hidden="true"><rect x="8" y="8" width="12" height="13" rx="2"/><path d="M16 8V5a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v10a2 2 0 0 0 2 2h3"/></svg>
          <span>复制指令</span>
        </button>
      </div>
      <pre class="prompt" tabindex="0" aria-label="{title}示例指令"><code id="prompt-{key}">{escape(prompt)}</code></pre>
      <p class="copy-status" id="status-{key}" role="status" aria-live="polite"></p>
    </article>
''' for key, title in [('xiaohongshu', '用小红书发帖'), ('testing', 'Vibe Testing')])
copy_script = """<script>
  async function copyPrompt(button) {
    const code = document.getElementById(button.dataset.copy);
    const status = button.closest('.example').querySelector('.copy-status');
    const label = button.querySelector('span');
    let copied = false;
    try {
      await navigator.clipboard.writeText(code.textContent);
      copied = true;
    } catch {
      const field = document.createElement('textarea');
      field.value = code.textContent;
      field.setAttribute('readonly', '');
      field.style.cssText = 'position:fixed;top:0;left:-9999px;';
      document.body.append(field);
      try {
        field.select();
        copied = document.execCommand('copy');
      } catch {} finally {
        field.remove();
        button.focus({preventScroll: true});
      }
    }
    if (copied) {
      label.textContent = '已复制';
      status.textContent = '已复制，请粘贴到 WorkBuddy，并填写【占位内容】。';
    } else {
      const range = document.createRange();
      range.selectNodeContents(code);
      const selection = window.getSelection();
      selection.removeAllRanges();
      selection.addRange(range);
      label.textContent = '复制指令';
      status.textContent = '复制未成功，请手动复制已选中的指令。';
    }
  }
  document.querySelectorAll('[data-copy]').forEach(button => {
    button.addEventListener('click', () => copyPrompt(button));
  });
</script>"""
animation = base64.b64encode((ROOT / 'resources/Skill和MCP授权.gif').read_bytes()).decode('ascii')
guide = f'''<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta name="color-scheme" content="light">
  <title>OpenGUI 授权指南</title>
{style}
</head>
<body>
<main>
  <header>
    <h1>授权 OpenGUI</h1>
    <p>安装配置已写入，请先重启一次 WorkBuddy，再完成授权。</p>
  </header>
  <aside class="restart-notice" aria-label="安装后重启提醒">
    <strong>重要：安装后需要重启一次 WorkBuddy</strong>
    <p>先结束其他任务，用 <b>⌘Q 完全退出</b> WorkBuddy，再重新打开，然后授权 OpenGUI。只关闭窗口不算退出。</p>
  </aside>
  <section aria-labelledby="authorization-title">
    <h2 id="authorization-title">授权技能和连接器</h2>
    <p>打开 WorkBuddy 的“专家·技能·连接器 → 技能”，找到 OpenGUI，按提示完成授权；之后在连接器中，找到OpenGUI，再次授权。</p>
    <figure>
      <img id="authorization-demo" src="data:image/gif;base64,{animation}" width="1508" height="322" alt="动图：在 WorkBuddy 中授权 OpenGUI Skill，并信任和启用 MCP">
      <figcaption>注意：技能 和 连接器，都需要授权哦！</figcaption>
    </figure>
    <p class="help">重启后若仍找不到 OpenGUI，可打开“自定义连接器”检查 MCP 服务，并核对安装结果中的配置路径。</p>
  </section>
  <section class="finish" aria-label="验证连接">
    <p>授权完成后，在 WorkBuddy 新建或打开聊天，发送：</p>
    <span class="reply">我已安装并授权 OpenGUI，请检查连接并调用设备列表工具。</span>
  </section>
  <section class="quick-start" aria-labelledby="start-title">
    <h2 id="start-title">开始使用 OpenGUI</h2>
    <p class="setup">把Android手机打开USB调试，连上电脑，输入<code>/opengui</code>，输入需要给手机的执行指令，即可控制手机执行。</p>
    <p class="example-note">将示例中的【占位内容】替换为实际任务信息，再发送到 WorkBuddy。</p>
{examples}  </section>
</main>
{copy_script}
</body>
</html>
'''
(ROOT / 'resources/OpenGUI-授权指南.html').write_text(guide)
(ROOT / 'connector/skills/control/authorization.html').write_text(guide)
bootstrap = ROOT / 'install.sh'
source = bootstrap.read_text()
for field, data in [('installer_sha', (ROOT / 'scripts/install-macos.command').read_bytes()), ('guide_sha', guide.encode())]:
    source, count = re.subn(rf"(local {field}=')[^']+(')", lambda match: match[1] + hashlib.sha256(data).hexdigest() + match[2], source)
    assert count == 1, field
bootstrap.write_text(source)
print('Authorization guide built; bootstrap pins match the installer and guide.')
