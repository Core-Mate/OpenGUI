#!/usr/bin/env python3
"""Exercise the interactive launcher without installing or changing host settings."""
from pathlib import Path
import base64
import io
import hashlib
import json
import re
import os
import pty
import select
import subprocess
import tempfile
import time
import unittest
import zipfile
from urllib.parse import quote

ROOT = Path(__file__).resolve().parents[1]
SOURCE = (ROOT / 'scripts/installer-handoff.command').read_text()
PIN = re.search(r"expected_sha='([a-f0-9]{64})'", SOURCE).group(1)
VERSION = json.loads((ROOT / 'package.json').read_text())['version']


class HandoffTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory(prefix='opengui handoff ')
        self.folder = Path(self.temp.name)
        self.env = {**os.environ, 'HOME': str(self.folder)}
        self.env.pop('CODEBUDDY_FORCE_HEADLESS_BUNDLE', None)
        self.env.pop('NODE_OPTIONS', None)
        self.payload = '#!/bin/bash\nprintf CONFIG_WRITTEN\\\\n\n'
        self.prepare(self.payload)

    def tearDown(self):
        self.temp.cleanup()

    def prepare(self, payload):
        (self.folder / 'installer.sh').write_text(payload)
        digest = hashlib.sha256(payload.encode()).hexdigest()
        self.launcher = self.folder / 'OpenGUI-安装.command'
        self.launcher.write_text(SOURCE.replace(PIN, digest))

    def run_tty(self, answer='\n', extra_env=None, on_output=None):
        master, slave = pty.openpty()
        child = subprocess.Popen(['bash', str(self.launcher)], stdin=slave, stdout=slave, stderr=slave,
                                 env={**self.env, **(extra_env or {})})
        os.close(slave)
        data = b''
        sent = False
        finished = False
        deadline = time.monotonic() + 8
        try:
            while time.monotonic() < deadline:
                if select.select([master], [], [], .1)[0]:
                    try:
                        part = os.read(master, 65536)
                    except OSError:
                        break
                    if not part:
                        break
                    data += part
                    if on_output:
                        on_output(data.decode(errors='replace'))
                    if '按回车开始安装'.encode() in data and not sent:
                        os.write(master, answer.encode()); sent = True
                    if '按回车结束安装程序'.encode() in data and not finished:
                        os.write(master, b'\n'); finished = True
                if child.poll() is not None:
                    break
            return child.wait(timeout=1), data.decode(errors='replace')
        finally:
            if child.poll() is None:
                child.kill(); child.wait()
            os.close(master)

    def test_noninteractive_launch_does_not_install(self):
        r = subprocess.run(['bash', str(self.launcher)], input='\n', capture_output=True, text=True, env=self.env)
        self.assertEqual(r.returncode, 73)
        self.assertFalse(list(self.folder.glob('installation-result.*')))

    def test_host_injected_launch_does_not_install(self):
        for env in [{'CODEBUDDY_FORCE_HEADLESS_BUNDLE': '1'}, {'NODE_OPTIONS': '--require /host/node-language-shim.cjs'}]:
            code, _ = self.run_tty(extra_env=env)
            self.assertEqual(code, 73)
        self.assertFalse(list(self.folder.glob('installation-result.*')))

    def test_cancel_does_not_write_a_result(self):
        code, _ = self.run_tty('q\n')
        self.assertEqual(code, 0)
        self.assertFalse(list(self.folder.glob('installation-result.*')))

    def test_success_requires_actual_configuration_marker(self):
        self.prepare("#!/bin/bash\necho '[0s] Preflight: test host'\necho '[1s] Reusing verified package download'\necho '[2s] Installing configuration and checking runtime dependencies'\necho internal_diagnostic_details\necho CONFIG_WRITTEN\n")
        code, output = self.run_tty()
        self.assertEqual(code, 0, output)
        self.assertIn('1/3', output)
        self.assertIn('3/3', output)
        self.assertNotIn('internal_diagnostic_details', output)
        self.assertIn('internal_diagnostic_details', next(self.folder.glob('installation-result.*/install.log')).read_text())
        result = next(self.folder.glob('installation-result.*/result.txt')).read_text()
        self.assertIn('status=configuration_written', result)
        self.assertIn('hostLoaded=unverified', result)
        self.assertIn('nextAction=return_to_workbuddy_and_trust_mcp', result)
        self.assertIn('安装时可以保持 WorkBuddy 打开', output)
        self.assertIn('若找不到 OpenGUI 或新配置未生效', output)
        self.assertNotIn('请保持 WorkBuddy 关闭', output)
        self.assertLess(output.index('安装配置已写入'), output.index('用 ⌘Q 退出'))
        self.assertLess(output.index('点击「信任」'), output.index('已安装完成'))
        self.assertIn('在 WorkBuddy 新建或打开聊天', output)

    def test_active_upgrade_has_specific_recovery_instructions(self):
        self.prepare("#!/bin/bash\necho 'upgrade_blocked: existing service' >&2\nexit 1\n")
        code, output = self.run_tty()
        self.assertNotEqual(code, 0)
        self.assertIn('在 MCP 管理中停用旧 OpenGUI', output)
        self.assertIn('WorkBuddy 可以保持打开', output)
        self.assertIn('status=failed', next(self.folder.glob('installation-result.*/result.txt')).read_text())

    def test_download_progress_is_visible_before_download_finishes(self):
        self.prepare("""#!/bin/bash
printf 'Preparing private Node.js\\n'
printf '\\r 52 47.7M 52 25.2M 0 0 124k 0 0:06:34 0:03:28 0:03:06 103k\\r'
for attempt in 1 2 3 4 5 6 7 8 9 10; do
  [ ! -f "$HOME/progress-observed" ] || break
  sleep 0.1
done
[ -f "$HOME/progress-observed" ] || exit 41
echo 'curl: (28) transfer timed out'
echo 'Warning: Retrying in 1 seconds. 2 retries left.'
echo CONFIG_WRITTEN
""")
        def observe(output):
            if '下载 52%' in output:
                (self.folder / 'progress-observed').touch()
        code, output = self.run_tty(on_output=observe)
        self.assertEqual(code, 0, output)
        self.assertIn('25.2M / 47.7M', output)
        self.assertIn('curl: (28)', output)
        self.assertIn('Retrying', output)

    def test_fetch_allows_slow_downloads_but_bounds_stalls_and_failures(self):
        source = (ROOT / 'scripts/install-macos.command').read_text()
        fetch = source.split('fetch() {', 1)[1].split('\n}', 1)[0]
        fake_bin = self.folder / 'bin'
        fake_bin.mkdir()
        curl = fake_bin / 'curl'
        curl.write_text('#!/bin/bash\nprintf "%s\\n" "$@" > "$HOME/curl-args"\nexit 28\n')
        curl.chmod(0o755)
        result = subprocess.run(['bash', '-c', 'fetch() {' + fetch + '\n}\nfetch https://example.test/runtime runtime.tar.gz'], env={**self.env, 'PATH': f'{fake_bin}:{self.env["PATH"]}'})
        self.assertEqual(result.returncode, 28)
        args = (self.folder / 'curl-args').read_text().splitlines()
        for flag, value in [('--max-time', '1800'), ('--speed-limit', '1024'), ('--speed-time', '60'), ('--connect-timeout', '15'), ('--retry', '2')]:
            self.assertEqual(args[args.index(flag) + 1], value)

    def test_failure_keeps_exit_code_and_log(self):
        self.prepare('#!/bin/bash\necho blocked >&2\nexit 42\n')
        code, output = self.run_tty()
        self.assertEqual(code, 42, output)
        result = next(self.folder.glob('installation-result.*/result.txt'))
        self.assertIn('status=failed\nexitCode=42', result.read_text())
        self.assertIn('blocked', result.with_name('install.log').read_text())
        self.assertIn('blocked', output)

    def test_log_stream_failure_is_not_reported_as_success(self):
        fake_bin = self.folder / 'bin'
        fake_bin.mkdir()
        tee = fake_bin / 'tee'
        tee.write_text('#!/bin/bash\n/usr/bin/tee "$@"\nexit 9\n')
        tee.chmod(0o755)
        code, _ = self.run_tty(extra_env={'PATH': f'{fake_bin}:{self.env["PATH"]}'})
        self.assertEqual(code, 9)
        self.assertIn('status=failed\nexitCode=9', next(self.folder.glob('installation-result.*/result.txt')).read_text())

    def test_zero_exit_without_configuration_is_not_success(self):
        self.prepare('#!/bin/bash\necho download_only\n')
        code, _ = self.run_tty()
        self.assertEqual(code, 1)
        self.assertIn('status=failed', next(self.folder.glob('installation-result.*/result.txt')).read_text())

    def test_changed_or_redirected_payload_is_refused(self):
        (self.folder / 'installer.sh').write_text('echo tampered\n')
        code, output = self.run_tty()
        self.assertEqual(code, 1)
        self.assertIn('安装文件校验失败', output)
        self.assertFalse(list(self.folder.glob('installation-result.*')))
        (self.folder / 'installer.sh').unlink()
        real = self.folder / 'real.sh'; real.write_text(self.payload)
        (self.folder / 'installer.sh').symlink_to(real)
        code, _ = self.run_tty()
        self.assertEqual(code, 1)

    def test_manual_guide_retains_matching_download(self):
        guide = (ROOT / 'INSTALL.md').read_text()
        self.assertIn('## Manual alternative', guide)
        self.assertIn('## Download and run the installer', guide)
        html = (ROOT / 'resources/OpenGUI-安装指南.html').read_text()
        payload = base64.b64decode(re.search(r'id="download-installer"[^>]*href="data:application/zip;base64,([^"]+)"', html).group(1))
        with zipfile.ZipFile(io.BytesIO(payload)) as archive:
            prefix = 'OpenGUI-WorkBuddy-Installer/'
            self.assertEqual(archive.read(prefix + 'OpenGUI-安装.command').decode(), SOURCE)
            self.assertEqual(hashlib.sha256(archive.read(prefix + 'installer.sh')).hexdigest(), PIN)
            self.assertEqual((archive.getinfo(prefix + 'OpenGUI-安装.command').external_attr >> 16) & 0o777, 0o755)

        self.assertEqual(html.count('<section '), 3)
        self.assertNotIn('<script', html)
        self.assertNotRegex(html, r'href=[\"\'][^\"\']*\.(?:sh|command)[\"\']')
        self.assertIn(quote('运行安装脚本.gif'), html)
        animation = base64.b64decode(re.search(r'id="authorization-demo"[^>]*src="data:image/gif;base64,([^"]+)"', html).group(1))
        self.assertEqual(animation, (ROOT / 'resources/Skill和MCP授权.gif').read_bytes())
        self.assertIn('id="step-3"', html)
        self.assertIn('安装后需要重启一次 WorkBuddy', html)
        self.assertLess(html.index('步骤 2</span><span>重启一次 WorkBuddy'), html.index('步骤 3</span><span>授权 Skill 和 MCP'))
        self.assertLess(html.index('授权 Skill 和 MCP'), html.index('已安装完成'))

    def test_release_zip_preserves_executable_and_verified_payload(self):
        subprocess.run(['python3', str(ROOT / 'scripts/build-installer-handoff.py')], check=True, capture_output=True)
        archive = ROOT / f'dist/opengui-workbuddy-installer-{VERSION}.zip'
        with zipfile.ZipFile(archive) as z:
            self.assertEqual(len(z.namelist()), 3)
            launcher = z.getinfo('OpenGUI-WorkBuddy-Installer/OpenGUI-安装.command')
            self.assertEqual((launcher.external_attr >> 16) & 0o777, 0o755)
            self.assertEqual(hashlib.sha256(z.read('OpenGUI-WorkBuddy-Installer/installer.sh')).hexdigest(), PIN)
        self.assertEqual(archive.with_suffix('.zip.sha256').read_text().split()[0], hashlib.sha256(archive.read_bytes()).hexdigest())

    def test_explicit_maintainer_preparation_keeps_reviewed_pins(self):
        local_guide = (ROOT / 'docs/installer-development.md').read_text()
        block = re.search(r'```bash\n(.*?)\n```', local_guide, re.S).group(1)
        result = subprocess.run(['bash'], input=block, cwd=self.folder,
                                env={**self.env, 'OPENGUI_INSTALLER_SOURCE': str(ROOT)},
                                text=True, capture_output=True)
        self.assertEqual(result.returncode, 0, result.stderr)
        folder = Path(re.search(r'INSTALLER_FILES_READY: (.+)', result.stdout).group(1))
        self.assertEqual((folder / 'OpenGUI-安装.command').read_text(), SOURCE)
        self.assertEqual(hashlib.sha256((folder / 'installer.sh').read_bytes()).hexdigest(), PIN)
        self.assertEqual((folder / 'OpenGUI-安装指南.html').read_bytes(), (ROOT / 'resources/OpenGUI-安装指南.html').read_bytes())
        self.assertFalse(list(folder.glob('installation-result.*')))


if __name__ == '__main__':
    unittest.main(verbosity=2)
