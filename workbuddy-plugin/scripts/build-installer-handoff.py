#!/usr/bin/env python3
"""Build an executable ZIP containing the pinned public installer and handoff UI."""
from pathlib import Path
import hashlib
import re
import zipfile

ROOT = Path(__file__).resolve().parents[1]
VERSION = '1.0.2'
PREFIX = 'OpenGUI-WorkBuddy-Installer'
launcher = (ROOT / 'scripts/installer-handoff.command').read_bytes()
installer = (ROOT / 'scripts/install-macos.command').read_bytes()
expected = re.search(rb"expected_sha='([a-f0-9]{64})'", launcher).group(1).decode()
assert hashlib.sha256(installer).hexdigest() == expected, 'Pinned installer changed; review and update the handoff digest explicitly'
readme = '''OpenGUI · WorkBuddy 安装

开始安装
1. 解压 ZIP，保持 OpenGUI-Install.command 和 installer.sh 在同一文件夹。
2. 双击 OpenGUI-Install.command，在终端窗口按回车开始；输入 q 后回车取消。
   从 WorkBuddy 安装时，先点击“打开安装脚本目录”，再在 Finder 中双击该文件。
3. 等待“安装配置已写入”。首次安装需要下载文件，可能需要几分钟。

完成验证
打开 WorkBuddy，发送：
请验证 OpenGUI 安装：直接调用 opengui_list_devices，不要操作手机。

如果找不到工具，结束其他任务后退出并重新打开 WorkBuddy，再验证一次。
如有信任或启用提示，按 WorkBuddy 提示完成。安装结果和详细日志保存在
本文件夹的 installation-result.* 子目录中。

安装说明
已安装用户请先结束手机任务并退出 WorkBuddy，等待旧后台服务正常结束。
安装会备份相关设置并保留其他插件，无需 sudo 或系统密码。
如果 macOS 阻止打开，请按正常系统提示处理。
目录链接用于打开 Finder；需要你双击脚本，并在终端中按回车确认。
此 ZIP 安装官方插件 0.3.1，不是新的插件运行时，也不是已签名或公证的 macOS App。

Source: https://github.com/Core-Mate/OpenGUI
Installer source: opengui-workbuddy-installer-v1.0.2 (workbuddy-plugin/scripts/install-macos.command)
'''
output = ROOT / 'dist' / f'opengui-workbuddy-installer-{VERSION}.zip'
output.parent.mkdir(exist_ok=True)
with zipfile.ZipFile(output, 'w', compression=zipfile.ZIP_DEFLATED) as z:
    for name, data, mode in [('OpenGUI-Install.command', launcher, 0o100755), ('installer.sh', installer, 0o100600), ('README.txt', readme.encode(), 0o100600)]:
        info = zipfile.ZipInfo(f'{PREFIX}/{name}', (2026, 1, 1, 0, 0, 0))
        info.create_system = 3
        info.external_attr = mode << 16
        info.compress_type = zipfile.ZIP_DEFLATED
        z.writestr(info, data)
digest = hashlib.sha256(output.read_bytes()).hexdigest()
output.with_suffix('.zip.sha256').write_text(f'{digest}  {output.name}\n')
print(f'{output}\nSHA256 {digest}')
