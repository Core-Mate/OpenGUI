#!/usr/bin/env python3
"""Exercise the interactive launcher without installing or changing host settings."""
from pathlib import Path
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
        self.launcher = self.folder / 'OpenGUI-Install.command'
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

    def test_release_zip_preserves_executable_and_verified_payload(self):
        subprocess.run(['python3', str(ROOT / 'scripts/build-installer-handoff.py')], check=True, capture_output=True)
        archive = ROOT / f'dist/opengui-workbuddy-installer-{VERSION}.zip'
        with zipfile.ZipFile(archive) as z:
            self.assertEqual(len(z.namelist()), 3)
            launcher = z.getinfo('OpenGUI-WorkBuddy-Installer/OpenGUI-Install.command')
            self.assertEqual((launcher.external_attr >> 16) & 0o777, 0o755)
            self.assertEqual(hashlib.sha256(z.read('OpenGUI-WorkBuddy-Installer/installer.sh')).hexdigest(), PIN)
        self.assertEqual(archive.with_suffix('.zip.sha256').read_text().split()[0], hashlib.sha256(archive.read_bytes()).hexdigest())

    def test_documented_direct_download_verifies_both_files_before_opening_folder(self):
        guide = (ROOT / 'INSTALL.md').read_text()
        block = re.search(r'```bash\n(.*?)\n```', guide, re.S).group(1)
        fake_bin = self.folder / 'bin'
        fake_bin.mkdir()
        curl = fake_bin / 'curl'
        curl.write_text('''#!/bin/bash
set -eu
while [ "$#" -gt 3 ]; do shift; done
case "$1" in
  */OpenGUI-Install.command) source=installer-handoff.command ;;
  */installer.sh) source=install-macos.command ;;
  *) exit 91 ;;
esac
[ "$1" = "https://github.com/Core-Mate/OpenGUI/releases/download/opengui-workbuddy-v$TEST_PLUGIN_VERSION/$3" ]
[ "$2" = -o ]
cp "$TEST_SCRIPT_ROOT/$source" "$3"
if [ "${TEST_TAMPER:-}" = "$3" ]; then printf '\\n# changed\\n' >> "$3"; fi
''')
        curl.chmod(0o755)
        opener = fake_bin / 'open'
        opener.write_text('''#!/bin/bash
set -eu
[ "$1" = -a ] && [ "$2" = Finder ] && [ -d "$3" ]
[ -x "$3/OpenGUI-Install.command" ] && [ -f "$3/installer.sh" ]
printf '%s' "$3" > "$HOME/opened-folder"
''')
        opener.chmod(0o755)
        env = {**self.env, 'PATH': f'{fake_bin}:{self.env["PATH"]}',
               'TEST_SCRIPT_ROOT': str(ROOT / 'scripts'), 'TEST_PLUGIN_VERSION': VERSION}
        result = subprocess.run(['bash'], input=block, cwd=self.folder, env=env, text=True, capture_output=True)
        self.assertEqual(result.returncode, 0, result.stderr)
        folder = Path((self.folder / 'opened-folder').read_text())
        self.assertEqual(sorted(p.name for p in folder.iterdir()), ['OpenGUI-Install.command', 'installer.sh'])
        self.assertEqual((folder / 'OpenGUI-Install.command').read_text(), SOURCE)
        self.assertFalse(list(folder.glob('installation-result.*')))
        for target in ['OpenGUI-Install.command', 'installer.sh']:
            (self.folder / 'opened-folder').unlink(missing_ok=True)
            result = subprocess.run(['bash'], input=block, cwd=self.folder,
                                    env={**env, 'TEST_TAMPER': target}, text=True, capture_output=True)
            self.assertNotEqual(result.returncode, 0)
            self.assertFalse((self.folder / 'opened-folder').exists())


if __name__ == '__main__':
    unittest.main(verbosity=2)
