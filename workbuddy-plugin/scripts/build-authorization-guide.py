#!/usr/bin/env python3
"""Build the standalone post-install guide and pin its public bootstrap inputs."""
from pathlib import Path
import base64
import hashlib
import re

ROOT = Path(__file__).resolve().parents[1]
original = (ROOT / 'resources/OpenGUI-安装指南.html').read_text()
style = re.search(r'  <style>.*?</style>', original, re.S).group(0)
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
    <p>安装配置已写入，接下来请在 WorkBuddy 中完成授权。</p>
  </header>
  <section aria-labelledby="authorization-title">
    <h2 id="authorization-title">授权技能和连接器</h2>
    <p>打开 WorkBuddy 的“专家·技能·连接器 → 技能”，找到 OpenGUI，按提示完成授权；之后在连接器中，找到OpenGUI，再次授权。</p>
    <figure>
      <img id="authorization-demo" src="data:image/gif;base64,{animation}" width="1508" height="322" alt="动图：在 WorkBuddy 中授权 OpenGUI Skill，并信任和启用 MCP">
      <figcaption>注意：技能 和 连接器，都需要授权哦！</figcaption>
    </figure>
    <p class="help">如果找不到 OpenGUI，或新配置尚未生效，再结束其他任务，用 ⌘Q 退出并重新打开 WorkBuddy，然后继续授权和信任。</p>
  </section>
  <footer class="finish">
    <p>授权完成后，在 WorkBuddy 新建或打开聊天，发送：</p>
    <span class="reply">我已安装并授权 OpenGUI，请检查连接并调用设备列表工具。</span>
  </footer>
</main>
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
