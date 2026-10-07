#!/usr/bin/env python3
"""Build an executable ZIP containing the pinned public installer and handoff UI."""
from pathlib import Path
import hashlib
import re
import zipfile

ROOT = Path(__file__).resolve().parents[1]
VERSION = '1.0.0'
PREFIX = 'OpenGUI-WorkBuddy-Installer'
launcher = (ROOT / 'scripts/installer-handoff.command').read_bytes()
installer = (ROOT / 'scripts/install-macos.command').read_bytes()
expected = re.search(rb"expected_sha='([a-f0-9]{64})'", launcher).group(1).decode()
assert hashlib.sha256(installer).hexdigest() == expected, 'Pinned installer changed; review and update the handoff digest explicitly'
readme = '''OpenGUI for WorkBuddy — macOS 安装入口

1. 解压 ZIP，保持两个脚本在同一个文件夹。
2. 在 Finder 中双击 OpenGUI-Install.command，终端会显示安装范围。
3. 按回车开始安装；输入 q 后回车可取消。不要输入 sudo 或系统密码。
4. 等待出现“安装配置已写入”。结果和日志位于本文件夹的 installation-result.* 子目录。
5. 返回 WorkBuddy，调用 opengui_list_devices 验证；必要时先退出并重新打开 WorkBuddy。

已安装用户请先结束手机任务并退出 WorkBuddy，等待旧后台服务正常结束。
如果 macOS 阻止打开，请由用户处理系统提示；不要关闭 Gatekeeper 或删除隔离属性。
WorkBuddy 内直接 bash 执行本入口不会开始安装；它需要独立的交互式终端。
此 ZIP 只提供安装入口，仍下载并校验官方 opengui-workbuddy-v0.3.1 发布包。
它不是新的插件运行时版本，也不是已签名或公证的 macOS App。

Source: https://github.com/Core-Mate/OpenGUI
Installer source: d6a5f5ce240cdd6ca393ea516206b8a329411ac0
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
