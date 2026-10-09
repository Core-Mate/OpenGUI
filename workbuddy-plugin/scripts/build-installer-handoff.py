#!/usr/bin/env python3
"""Build an executable ZIP containing the pinned public installer and handoff UI."""
from pathlib import Path
import base64
import hashlib
import json
import re
import zipfile

ROOT = Path(__file__).resolve().parents[1]
VERSION = json.loads((ROOT / 'package.json').read_text())['version']
PREFIX = 'OpenGUI-WorkBuddy-Installer'
launcher = (ROOT / 'scripts/installer-handoff.command').read_bytes()
installer = (ROOT / 'scripts/install-macos.command').read_bytes()
expected = re.search(rb"expected_sha='([a-f0-9]{64})'", launcher).group(1).decode()
assert hashlib.sha256(installer).hexdigest() == expected, 'Pinned installer changed; review and update the handoff digest explicitly'
readme = f'''OpenGUI · WorkBuddy 安装

请按下载页面中的三个图文步骤完成安装。

开始安装
1. 解压此 ZIP，保持 OpenGUI-安装.command 和 installer.sh 在同一文件夹。
2. 双击 OpenGUI-安装.command，在终端窗口按回车开始，WorkBuddy 可以保持打开；输入 q 后回车取消。
   安装文件位于本次 ZIP 解压后的 OpenGUI-WorkBuddy-Installer 文件夹。
3. 等待“安装配置已写入”。首次安装需要下载文件，可能需要几分钟。

完成验证
安装后需要重启一次 WorkBuddy：先结束其他任务，用 ⌘Q 完全退出，再重新打开；只关闭窗口不算退出。
然后在技能中授权 OpenGUI，再到“连接器 → 自定义连接器”找到 opengui。
点击“信任”并完成首次授权，确认服务开关开启、状态点变绿。
在 WorkBuddy 新建或打开聊天，发送：
已安装完成

重启后若仍找不到 OpenGUI，请检查自定义连接器、安装结果和配置路径。
如有信任或启用提示，按 WorkBuddy 提示完成。安装结果和详细日志保存在
本文件夹的 installation-result.* 子目录中。

安装说明
升级时如提示旧 OpenGUI 服务仍在运行，请结束旧手机任务、关闭展示，在 MCP 管理中停用旧 OpenGUI，等待服务退出后重试。
安装会备份相关设置并保留其他插件，无需 sudo 或系统密码。
如果 macOS 阻止打开，请按正常系统提示处理。
目录链接用于打开 Finder；需要你双击脚本，并在终端中按回车确认。
此 ZIP 安装官方插件 {VERSION}，不是新的插件运行时，也不是已签名或公证的 macOS App。

Source: https://github.com/Core-Mate/OpenGUI
Installer source: opengui-workbuddy-v{VERSION} (workbuddy-plugin/scripts/install-macos.command)
'''
output = ROOT / 'dist' / f'opengui-workbuddy-installer-{VERSION}.zip'
output.parent.mkdir(exist_ok=True)
with zipfile.ZipFile(output, 'w', compression=zipfile.ZIP_DEFLATED) as z:
    for name, data, mode in [('OpenGUI-安装.command', launcher, 0o100755), ('installer.sh', installer, 0o100600), ('README.txt', readme.encode(), 0o100600)]:
        info = zipfile.ZipInfo(f'{PREFIX}/{name}', (2026, 1, 1, 0, 0, 0))
        info.create_system = 3
        info.external_attr = mode << 16
        info.compress_type = zipfile.ZIP_DEFLATED
        z.writestr(info, data)
digest = hashlib.sha256(output.read_bytes()).hexdigest()
output.with_suffix('.zip.sha256').write_text(f'{digest}  {output.name}\n')
# Embed the complete archive so the static guide remains usable when copied alone.
guide_path = ROOT / 'resources/OpenGUI-安装指南.html'
guide = guide_path.read_text(encoding='utf-8')
archive_data = base64.b64encode(output.read_bytes()).decode('ascii')
guide, replacements = re.subn(r'(id="download-installer"[^>]*href=")[^"]*(")', lambda match: match[1] + 'data:application/zip;base64,' + archive_data + match[2], guide)
assert replacements == 1, 'The fixed guide must have exactly one installer download link'
authorization_data = base64.b64encode((ROOT / 'resources/Skill和MCP授权.gif').read_bytes()).decode('ascii')
guide, replacements = re.subn(r'(id="authorization-demo"[^>]*src=")[^"]*(")', lambda match: match[1] + 'data:image/gif;base64,' + authorization_data + match[2], guide)
assert replacements == 1, 'The fixed guide must have exactly one authorization demo'
guide_path.write_text(guide, encoding='utf-8')
(ROOT / 'connector/skills/control/installation.html').write_text(guide, encoding='utf-8')
print(f'{output}\nSHA256 {digest}')
