#!/bin/bash
# Install a prebuilt release without a source checkout or system Node.
set -euo pipefail
umask 077
HOST=codex
VERSION=0.2.0
ARCHIVE_NAME=opengui-codex-$VERSION.tar.gz
usage() {
  echo "OpenGUI for $HOST $VERSION (macOS arm64/x64)"
  echo "Usage: bash $0 [--archive /absolute/path/$ARCHIVE_NAME]"
  echo 'Downloads a verified prebuilt package and private Node. No sudo or source build.'
  echo 'Finish existing OpenGUI tasks before upgrading. Keep old packages for rollback.'
}
archive=
case "${1:-}" in
  --help|-h) usage; exit 0 ;;
  --archive) [ "$#" = 2 ] || { usage; exit 1; }; archive=$2 ;;
  '') [ "$#" = 0 ] || { usage; exit 1; } ;;
  *) usage; exit 1 ;;
esac
[ "$(uname -s)" = Darwin ] || { echo 'Only macOS is supported.' >&2; exit 1; }
case "$(uname -m)" in
  arm64) arch=arm64; node_sha=61130f394c1630d211dd50aecc4353d379480f36d3ac913cd85dbba1aed585c6 ;;
  x86_64) arch=x64; node_sha=58e99022c2ff89395576cc7fd4d98cea24bb68081475d5f88b801ee8729fb026 ;;
  *) echo 'Unsupported architecture.' >&2; exit 1 ;;
esac
command -v codex >/dev/null || { echo 'Install the Codex CLI with plugin support first.' >&2; exit 1; }
codex plugin marketplace add --help >/dev/null
# Refuse redirected parent directories before creating installation state.
private_dir() {
  local path=$1 cursor=$1
  while [ "$cursor" != / ]; do
    [ ! -L "$cursor" ] || { echo "Refusing symlink: $cursor" >&2; exit 1; }
    cursor=$(dirname "$cursor")
  done
  mkdir -p "$path"
  [ "$(stat -f '%u' "$path")" = "$(id -u)" ] || { echo "Not owned by current user: $path" >&2; exit 1; }
}
root="${CODEX_HOME:-$HOME/.codex}/opengui-codex"
case "$root" in /*) ;; *) echo 'Installation home must be absolute.' >&2; exit 1 ;; esac
private_dir "$root"
lock="$root/installer.lock"
mkdir "$lock" 2>/dev/null || { echo "Installation busy or interrupted: inspect $lock before retrying." >&2; exit 1; }
temporary=
runtime_lock_owned=false
cleanup() {
  [ -z "$temporary" ] || rm -rf "$temporary"
  if [ "$runtime_lock_owned" = true ]; then rmdir "$root/runtime/install.lock"; fi
  rmdir "$lock"
}
trap cleanup EXIT
trap 'exit 130' INT
trap 'exit 143' TERM
temporary=$(mktemp -d "$root/.install.XXXXXXXX")
fetch() {
  curl --proto '=https' --proto-redir '=https' --tlsv1.2 --fail --location \
    --connect-timeout 15 --max-time 240 --retry 2 "$1" -o "$2"
}
if [ -z "$archive" ]; then
  base="https://github.com/Core-Mate/OpenGUI/releases/download/opengui-$HOST-v$VERSION"
  archive="$temporary/$ARCHIVE_NAME"
  if ! fetch "$base/$ARCHIVE_NAME" "$archive" || ! fetch "$base/$ARCHIVE_NAME.sha256" "$archive.sha256"; then
    echo "No downloadable $HOST $VERSION package, or network unavailable. Check the release page; installation stopped without changing host configuration." >&2
    exit 1
  fi
fi
[ -f "$archive" ] && [ -f "$archive.sha256" ] || { echo 'Archive and adjacent .sha256 file are required.' >&2; exit 1; }
# Parse the digest only. Never trust a sidecar filename as a local path.
expected=$(awk 'NR == 1 { print $1 }' "$archive.sha256")
[[ "$expected" =~ ^[0-9a-f]{64}$ ]] || { echo 'Invalid SHA-256 sidecar.' >&2; exit 1; }
[ "$(shasum -a 256 "$archive" | awk '{print $1}')" = "$expected" ] || { echo 'Archive checksum mismatch; nothing installed.' >&2; exit 1; }
cp "$archive" "$temporary/verified.tar.gz"
# Recheck our private copy to avoid using a source archive changed during copy.
[ "$(shasum -a 256 "$temporary/verified.tar.gz" | awk '{print $1}')" = "$expected" ] || exit 1
private_dir "$root/runtime"
node_name="node-v22.23.2-darwin-$arch"
node_dir="$root/runtime/$node_name"
node="$node_dir/bin/node"
valid_node() {
  [ ! -L "$node_dir" ] && [ ! -L "$node_dir/bin" ] && [ ! -L "$node" ] && [ -x "$node" ] && [ -f "$node_dir/.verified" ] || return 1
  [ "$(sed -n '1p' "$node_dir/.verified")" = "$node_sha" ] &&
    [ "$(sed -n '2p' "$node_dir/.verified")" = "$(shasum -a 256 "$node" | awk '{print $1}')" ]
}
if ! valid_node; then
  mkdir "$root/runtime/install.lock" 2>/dev/null || { echo "Runtime setup is busy; retry when the current setup finishes." >&2; exit 1; }
  runtime_lock_owned=true
  [ ! -e "$node_dir" ] && [ ! -L "$node_dir" ] || { echo "Invalid existing Node runtime: $node_dir. No running runtime was overwritten." >&2; exit 1; }
  echo 'Preparing private Node.js 22.23.2 (~50 MB); no system installation.'
  fetch "https://nodejs.org/dist/v22.23.2/$node_name.tar.gz" "$temporary/node.tar.gz"
  [ "$(shasum -a 256 "$temporary/node.tar.gz" | awk '{print $1}')" = "$node_sha" ] || { echo 'Node checksum mismatch.' >&2; exit 1; }
  tar -xzf "$temporary/node.tar.gz" -C "$temporary"
  printf '%s\n%s\n' "$node_sha" "$(shasum -a 256 "$temporary/$node_name/bin/node" | awk '{print $1}')" > "$temporary/$node_name/.verified"
  mv "$temporary/$node_name" "$node_dir"
fi
"$node" - "$root" "$temporary/verified.tar.gz" "$VERSION" <<'INSTALL_JS'
const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const [root, archive, version] = process.argv.slice(2);
const run = (args) => execFileSync('codex', ['plugin', ...args], { encoding: 'utf8' });
const listing = JSON.parse(run(['list', '--json']));
if (!Array.isArray(listing.installed)) throw Error('Unsupported Codex plugin inventory; no configuration changed');
const conflicts = listing.installed.filter(p => p.name === 'opengui' && p.marketplaceName !== 'opengui-standalone');
if (conflicts.length) throw Error('OpenGUI already installed from another source: ' + conflicts.map(p => p.pluginId).join(', ') + '. Finish its tasks and remove that installation explicitly before retrying.');
const entries = execFileSync('tar', ['-tzf', archive], { encoding: 'utf8' }).trim().split('\n');
if (entries.some(p => !p.startsWith('opengui/') || p.split('/').includes('..'))) throw Error('Unsafe archive paths');
const types = execFileSync('tar', ['-tvzf', archive], { encoding: 'utf8' }).trim().split('\n');
if (types.some(p => !['-', 'd'].includes(p[0]))) throw Error('Archive links or special files rejected');
const packages = path.join(root, 'packages');
fs.mkdirSync(packages, { recursive: true });
if (fs.lstatSync(packages).isSymbolicLink()) throw Error('Redirected packages directory');
const archiveHash = require('node:crypto').createHash('sha256').update(fs.readFileSync(archive)).digest('hex');
const cache = path.join(packages, version + '-' + archiveHash.slice(0, 16));
let install;
if (fs.existsSync(cache)) {
  if (fs.lstatSync(cache).isSymbolicLink() || fs.readFileSync(path.join(cache, '.archive-sha256'), 'utf8') !== archiveHash) throw Error('CACHE_INVALID: preserve the existing package and inspect its receipt');
  install = cache;
} else {
  install = fs.mkdtempSync(path.join(packages, version + '-staging-'));
  execFileSync('tar', ['-xzf', archive, '-C', install]);
  fs.writeFileSync(path.join(install, '.archive-sha256'), archiveHash, {mode: 0o600});
  fs.renameSync(install, cache); install = cache;
}
const manifest = JSON.parse(fs.readFileSync(path.join(install, 'opengui/.codex-plugin/plugin.json')));
if (manifest.name !== 'opengui' || manifest.version !== version) throw Error('Archive plugin/version mismatch');
execFileSync(process.execPath, [path.join(install, 'opengui/lib/cli.js'), '--help'], { stdio: 'pipe' });
try {
  execFileSync(process.execPath, [path.join(install, 'opengui/lib/cli.js'), '--prepare-video'], { stdio: 'inherit', env: { ...process.env, OPENGUI_CODEX_DATA_DIR: root } });
} catch (error) {
  console.error('VIDEO_PREPARE_FAILED: previous configuration retained. Retry this installer with the same --archive after restoring network access.');
  throw error;
}
execFileSync(process.execPath, [path.join(install, 'opengui/lib/cli.js'), '--check-upgrade'], { stdio: 'inherit', env: { ...process.env, OPENGUI_CODEX_DATA_DIR: root } });
const marketDir = path.join(install, '.agents/plugins');
fs.mkdirSync(marketDir, { recursive: true });
fs.writeFileSync(path.join(marketDir, 'marketplace.json'), JSON.stringify({
  name: 'opengui-standalone', interface: { displayName: 'OpenGUI for Codex' },
  plugins: [{ name: 'opengui', source: { source: 'local', path: './opengui' },
    policy: { installation: 'AVAILABLE', authentication: 'ON_INSTALL' }, category: 'Developer Tools' }]
}, null, 2));
const codexHome = process.env.CODEX_HOME || path.join(require('node:os').homedir(), '.codex');
const config = path.join(codexHome, 'config.toml');
if (fs.existsSync(config) && fs.lstatSync(config).isSymbolicLink()) throw Error('Redirected Codex configuration');
const recoveryDir = fs.mkdtempSync(path.join(install, 'install-receipt-'));
if (fs.existsSync(config)) fs.copyFileSync(config, path.join(recoveryDir, 'config.toml.before-install'));
fs.writeFileSync(path.join(recoveryDir, 'previous-plugins.json'), JSON.stringify(listing, null, 2));
console.log('Recovery files: ' + recoveryDir + '; immutable package: ' + install);
const markets = JSON.parse(run(['marketplace', 'list', '--json'])).marketplaces;
if (!Array.isArray(markets)) throw Error('Unsupported Codex marketplace inventory');
const previous = markets.find(m => m.name === 'opengui-standalone');
if (previous && (previous.marketplaceSource?.sourceType !== 'local' || !previous.root.startsWith(packages + path.sep))) throw Error('Existing marketplace is not owned by this installer; configuration retained');
fs.writeFileSync(path.join(recoveryDir, 'previous-marketplaces.json'), JSON.stringify(markets, null, 2));
if (previous?.root === install && listing.installed.some(p => p.name === 'opengui' && p.marketplaceName === 'opengui-standalone' && p.enabled && p.version === version)) {
  console.log('ALREADY_CONFIGURED: resources cached; hostLoaded=unverified; viewerAvailable=unverified.');
  process.exit(0);
}
let removed = false, added = false;
try {
  if (previous) { run(['marketplace', 'remove', 'opengui-standalone']); removed = true; }
  console.log(run(['marketplace', 'add', install])); added = true;
  console.log(run(['add', 'opengui@opengui-standalone']));
  const installed = JSON.parse(run(['list', '--json'])).installed;
  if (!installed.some(p => p.name === 'opengui' && p.marketplaceName === 'opengui-standalone' && p.enabled && p.version === version)) throw Error('Codex did not report the expected enabled version');
} catch (error) {
  try {
    if (added) run(['marketplace', 'remove', 'opengui-standalone']);
    if (removed) {
      run(['marketplace', 'add', previous.root]);
      if (listing.installed.some(p => p.marketplaceName === 'opengui-standalone' && p.enabled)) run(['add', 'opengui@opengui-standalone']);
    }
  } catch (recovery) { console.error('Automatic source recovery failed: ' + recovery.message); }
  console.error('Installation failed. Inspect the saved inventories and configuration backup in ' + recoveryDir);
  throw error;
}
console.log('CONFIG_WRITTEN; hostLoaded=unverified; viewerAvailable=unverified. Start a NEW Codex chat, choose OpenGUI, and ask: list connected phones without operating them.');
console.log('Rollback: finish OpenGUI tasks, then reinstall the previous version using its installer; previous packages and configuration backup are retained.');

INSTALL_JS
