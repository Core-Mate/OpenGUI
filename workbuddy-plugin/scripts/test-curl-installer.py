#!/usr/bin/env python3
"""Test the curl entry with isolated downloads, installer and browser fixtures."""
from pathlib import Path
import hashlib
import os
import re
import subprocess
import tempfile
import unittest

ROOT = Path(__file__).resolve().parents[1]
SOURCE = (ROOT / 'install.sh').read_text()


class CurlInstallerTests(unittest.TestCase):
    def setUp(self):
        self.temporary = tempfile.TemporaryDirectory(prefix='opengui curl ')
        self.root = Path(self.temporary.name).resolve()
        self.bin = self.root / 'bin'
        self.bin.mkdir()
        self.home = self.root / 'home with spaces'
        self.home.mkdir()
        self.guide = self.root / 'guide.html'
        self.guide.write_text('<html>Skill and MCP authorization</html>')
        self.payload = self.root / 'payload.sh'
        self.payload.write_text('''#!/bin/bash
printf '%s\\n' "$@" > "$TEST_ROOT/installer-args"
if [ "${1:-}" = --check ]; then echo PREFLIGHT_OK; exit 0; fi
printf configured > "$TEST_ROOT/configured"
echo 'CONFIG_WRITTEN: fixture'
''')
        self.command('curl', '''#!/bin/bash
while [ "$#" -gt 0 ]; do
  case "$1" in https://*) url=$1 ;; -o) shift; target=$1 ;; esac
  shift
done
printf '%s\\n' "$url" >> "$TEST_ROOT/downloads"
if [ "${TEST_DOWNLOAD_FAIL:-}" = 1 ]; then printf partial > "$target"; exit 28; fi
case "$url" in */scripts/install-macos.command) cp "$TEST_ROOT/payload.sh" "$target" ;; */resources/OpenGUI-*) cp "$TEST_ROOT/guide.html" "$target" ;; *) exit 22 ;; esac
if [ "${TEST_TAMPER:-}" = 1 ]; then printf tampered >> "$target"; fi
''')
        self.command('open', '''#!/bin/bash
[ -f "$TEST_ROOT/configured" ] || exit 7
printf '%s\\n' "$1" >> "$TEST_ROOT/opened"
exit "${TEST_OPEN_EXIT:-0}"
''')
        self.env = {**os.environ, 'HOME': str(self.home), 'TEST_ROOT': str(self.root), 'PATH': str(self.bin) + ':' + os.environ['PATH']}
        self.source = SOURCE
        self.pin()

    def command(self, name, source):
        p = self.bin / name
        p.write_text(source)
        p.chmod(0o755)

    def pin(self):
        for field, path in [('installer_sha', self.payload), ('guide_sha', self.guide)]:
            digest = hashlib.sha256(path.read_bytes()).hexdigest()
            self.source = re.sub(rf"local {field}='[^']+'", f"local {field}='{digest}'", self.source)

    def run_entry(self, args=(), **env):
        return subprocess.run(['bash', '-s', '--', *args], input=self.source, text=True, capture_output=True, env={**self.env, **env})

    def receipt(self):
        return next(self.home.glob('.workbuddy/opengui/installations/install.*/result.txt')).read_text()

    def tearDown(self):
        self.temporary.cleanup()

    def test_piped_host_execution_opens_guide_only_after_configuration(self):
        result = self.run_entry(('--app', '/Applications/WorkBuddy with spaces.app'), CODEBUDDY_FORCE_HEADLESS_BUNDLE='1')
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertIn('status=configuration_written', self.receipt())
        self.assertIn('hostLoaded=unverified', self.receipt())
        self.assertIn('AUTHORIZATION_GUIDE:', result.stdout)
        self.assertEqual((self.root / 'installer-args').read_text().splitlines(), ['--app', '/Applications/WorkBuddy with spaces.app'])
        shown = Path((self.root / 'opened').read_text().strip())
        self.assertEqual(shown.read_bytes(), self.guide.read_bytes())
        self.assertEqual(shown.parent.stat().st_mode & 0o777, 0o700)

    def test_modified_download_never_executes(self):
        result = self.run_entry(TEST_TAMPER='1')
        self.assertNotEqual(result.returncode, 0)
        self.assertFalse((self.root / 'configured').exists())
        self.assertFalse((self.root / 'opened').exists())

    def test_partial_download_never_executes(self):
        result = self.run_entry(TEST_DOWNLOAD_FAIL='1')
        self.assertNotEqual(result.returncode, 0)
        self.assertIn('status=failed', self.receipt())
        self.assertFalse((self.root / 'configured').exists())

    def test_missing_guide_stops_before_install(self):
        self.guide.unlink()
        result = self.run_entry()
        self.assertNotEqual(result.returncode, 0)
        self.assertFalse((self.root / 'configured').exists())

    def test_installer_failure_is_preserved_without_opening_guide(self):
        self.payload.write_text('#!/bin/bash\necho upgrade_blocked >&2\nexit 9\n')
        self.pin()
        result = self.run_entry()
        self.assertEqual(result.returncode, 9)
        self.assertIn('exitCode=9', self.receipt())
        self.assertFalse((self.root / 'opened').exists())

    def test_zero_exit_without_configuration_is_not_success(self):
        self.payload.write_text('#!/bin/bash\necho downloaded_only\n')
        self.pin()
        result = self.run_entry()
        self.assertNotEqual(result.returncode, 0)
        self.assertIn('status=failed', self.receipt())
        self.assertFalse((self.root / 'opened').exists())

    def test_browser_failure_keeps_success_and_reports_guide_path(self):
        result = self.run_entry(TEST_OPEN_EXIT='1')
        self.assertEqual(result.returncode, 0)
        self.assertIn('status=configuration_written', self.receipt())
        self.assertIn('无需重新安装', result.stderr)
        self.assertIn('AUTHORIZATION_GUIDE:', result.stdout)

    def test_preflight_does_not_open_guide_or_claim_installation(self):
        result = self.run_entry(('--check',))
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertIn('status=preflight_ok', self.receipt())
        self.assertFalse((self.root / 'configured').exists())
        self.assertFalse((self.root / 'opened').exists())
        self.assertEqual(len((self.root / 'downloads').read_text().splitlines()), 1)

    def test_truncated_entry_does_not_start_installation(self):
        self.source = self.source[:self.source.rindex('\nmain "$@"')]
        self.run_entry()
        self.assertFalse((self.root / 'downloads').exists())

    def test_redirected_installation_home_is_refused(self):
        (self.home / '.workbuddy').symlink_to(self.root, target_is_directory=True)
        result = self.run_entry()
        self.assertNotEqual(result.returncode, 0)
        self.assertIn('Refusing redirected', result.stderr)
        self.assertFalse((self.root / 'downloads').exists())

    def test_production_pins_match_reviewed_files(self):
        for field, relative in [('installer_sha', 'scripts/install-macos.command'), ('guide_sha', 'resources/OpenGUI-授权指南.html')]:
            pin = re.search(rf"local {field}='([^']+)'", SOURCE).group(1)
            self.assertEqual(pin, hashlib.sha256((ROOT / relative).read_bytes()).hexdigest())
        guide = (ROOT / 'resources/OpenGUI-授权指南.html').read_text()
        self.assertIn('注意：技能 和 连接器，都需要授权哦！', guide)
        self.assertIn('data:image/gif;base64,', guide)
        self.assertNotIn('download-installer', guide)
        self.assertNotIn('步骤 3', guide)


if __name__ == '__main__':
    unittest.main(verbosity=2)
