#!/usr/bin/env python3
"""Exercise the installer's real npm call without inheriting caller directory access."""
from pathlib import Path
import hashlib
import io
import json
import os
import shutil
import subprocess
import sys
import tarfile
import tempfile
import unittest

ROOT = Path(__file__).resolve().parents[1]
SOURCE = (ROOT / 'scripts/install-macos.command').read_text()
# Exercise the actual installation call with a tiny offline package; the remaining
# runtime and host configuration flow is covered by test-release-installer.mjs.
NPM_STAGE = SOURCE.split("<<'INSTALL_JS'\n", 1)[1].split('\nlet pkg =', 1)[0]
NODE = os.environ.get('OPENGUI_TEST_NODE') or shutil.which('node')


@unittest.skipUnless(sys.platform == 'darwin', 'macOS directory access regression')
class InstallerCwdTests(unittest.TestCase):
    def setUp(self):
        self.temporary = tempfile.TemporaryDirectory(prefix='opengui cwd ')
        self.base = Path(self.temporary.name).resolve()
        self.home = self.base / 'home'
        self.home.mkdir()
        self.launch = self.base / 'launch'
        self.launch.mkdir()
        self.state = self.home / 'opengui'
        self.state.mkdir()
        self.archive = self.base / 'fixture.tgz'
        metadata = json.dumps({'name': 'opengui-mcp', 'version': '0.4.0'}).encode()
        with tarfile.open(self.archive, 'w:gz') as archive:
            member = tarfile.TarInfo('package/package.json')
            member.size = len(metadata)
            archive.addfile(member, io.BytesIO(metadata))
        self.env = {**os.environ, 'HOME': str(self.home), 'npm_config_cache': str(self.home / 'npm-cache'), 'npm_config_offline': 'true'}

    def tearDown(self):
        self.temporary.cleanup()

    def install(self, denied=False, deleted=False):
        command = [NODE, '-', str(self.state), str(self.archive), '0.4.0', str(self.home / 'config'), hashlib.sha256(self.archive.read_bytes()).hexdigest(), str(ROOT / 'scripts/install-macos.command'), '/unused/WorkBuddy.app', 'false', 'https://registry.npmmirror.com']
        if denied:
            profile = '(version 1) (allow default) (deny file-read-metadata (subpath ' + json.dumps(str(self.launch)) + '))'
            command = ['/usr/bin/sandbox-exec', '-p', profile, *command]
        result = subprocess.run(command, input=NPM_STAGE, text=True, capture_output=True, env=self.env, cwd=self.launch, preexec_fn=(lambda: self.launch.rmdir()) if deleted else None)
        self.assertEqual(result.returncode, 0, result.stderr + result.stdout)
        self.assertNotIn('uv_cwd', result.stderr)
        installed = list((self.state / 'packages').glob('*/node_modules/opengui-mcp/package.json'))
        self.assertEqual(len(installed), 1)
        self.assertEqual(json.loads(installed[0].read_text())['version'], '0.4.0')

    def test_install_from_readable_directory(self):
        self.install()

    def test_install_when_caller_directory_metadata_is_denied(self):
        self.install(denied=True)

    def test_install_when_caller_directory_was_deleted(self):
        self.install(deleted=True)


if __name__ == '__main__':
    unittest.main(verbosity=2)
