#!/bin/bash
# Install a prebuilt release without a source checkout or system Node.
set -euo pipefail
umask 077
HOST=workbuddy
VERSION=0.3.0
ARCHIVE_NAME=opengui-mcp-$VERSION.tgz
usage() {
  echo "OpenGUI for $HOST $VERSION (macOS arm64/x64)"
  echo "Usage: bash $0 [--check] [--repair-legacy] [--app /path/WorkBuddy.app] [--config-root /verified/path] [--archive /absolute/path/$ARCHIVE_NAME]"
  echo 'Downloads a verified prebuilt package and private Node. No sudo or source build.'
  echo 'Finish existing OpenGUI tasks before upgrading. Keep old packages for rollback.'
}
archive=
app=
config_root=${WORKBUDDY_CONFIG_DIR:-${CODEBUDDY_CONFIG_DIR:-}}
check_only=false
repair_legacy=false
while [ "$#" -gt 0 ]; do
  case "$1" in
    --help|-h) usage; exit 0 ;;
    --archive|--app|--config-root)
      [ "$#" -ge 2 ] || { usage; exit 1; }
      case "$1" in --archive) archive=$2 ;; --app) app=$2 ;; --config-root) config_root=$2 ;; esac
      shift 2 ;;
    --check) check_only=true; shift ;;
    --repair-legacy) repair_legacy=true; shift ;;
    *) usage; exit 1 ;;
  esac
done
fail() { echo "[$1] $2" >&2; exit 1; }
started=$SECONDS
stage() { echo "[$((SECONDS-started))s] $*"; }
[ "$(uname -s)" = Darwin ] || { echo 'Only macOS is supported.' >&2; exit 1; }
case "$(uname -m)" in
  arm64) arch=arm64; node_sha=61130f394c1630d211dd50aecc4353d379480f36d3ac913cd85dbba1aed585c6 ;;
  x86_64) arch=x64; node_sha=58e99022c2ff89395576cc7fd4d98cea24bb68081475d5f88b801ee8729fb026 ;;
  *) echo 'Unsupported architecture.' >&2; exit 1 ;;
esac
# Discover the actual bundle identity, including renamed and mounted applications.
candidates=()
for candidate in /Applications/*.app "$HOME"/Applications/*.app /Volumes/*/*.app; do
  [ -f "$candidate/Contents/Info.plist" ] || continue
  bundle_id=$(/usr/libexec/PlistBuddy -c 'Print :CFBundleIdentifier' "$candidate/Contents/Info.plist" 2>/dev/null || true)
  case "$bundle_id" in com.tencent.workbuddy.*) candidates+=("$candidate") ;; esac
done
if [ -z "$app" ]; then
  [ "${#candidates[@]}" -gt 0 ] || fail HOST_NOT_FOUND 'Install WorkBuddy first, or select its bundle with --app /path/WorkBuddy.app.'
  [ "${#candidates[@]}" = 1 ] || fail HOST_AMBIGUOUS 'Multiple WorkBuddy bundles found. Select the intended one with --app /path/WorkBuddy.app.'
  app=${candidates[0]}
fi
case "$app" in /*.app) ;; *) fail HOST_PATH 'The --app path must be an absolute .app bundle path.' ;; esac
[ -d "$app" ] || fail HOST_NOT_FOUND 'Selected application does not exist.'
app=$(cd "$app" && pwd -P)
bundle_id=$(/usr/libexec/PlistBuddy -c 'Print :CFBundleIdentifier' "$app/Contents/Info.plist" 2>/dev/null || true)
case "$bundle_id" in com.tencent.workbuddy.*) ;; *) fail HOST_IDENTITY 'Selected bundle is not a recognized WorkBuddy application.' ;; esac
host_version=$(/usr/libexec/PlistBuddy -c 'Print :CFBundleShortVersionString' "$app/Contents/Info.plist")
[[ "$host_version" =~ ^[0-9]+\.[0-9]+\.[0-9]+$ ]] || fail HOST_VERSION 'Cannot determine a supported WorkBuddy version.'
IFS=. read -r major minor patch <<< "$host_version"
if (( 10#$major < 5 || (10#$major == 5 && 10#$minor < 5) || (10#$major == 5 && 10#$minor == 5 && 10#$patch < 3) )); then
  fail HOST_TOO_OLD "WorkBuddy $host_version is below the 5.5.3 minimum. Upgrade WorkBuddy, then rerun this installer."
fi
product="$app/Contents/Resources/app.asar.unpacked/cli/product.json"
if [ -z "$config_root" ]; then
  if ! folder=$(plutil -extract config.customUserDataDir raw -o - "$product" 2>/dev/null) || [ -z "$folder" ]; then
    folder=$(plutil -extract dataFolderName raw -o - "$product" 2>/dev/null || true)
  fi
  case "$folder" in .workbuddy|.workbuddy-ai) ;; *) fail HOST_CONFIG_UNKNOWN 'Cannot resolve the product configuration directory. Use --config-root only with the verified host configuration path.' ;; esac
  suffix=${WORKBUDDY_INSTANCE_NUMBER:-}
  if [ -n "$suffix" ]; then [[ "$suffix" =~ ^[0-9]+$ ]] || fail HOST_INSTANCE 'Invalid WorkBuddy instance number.'; folder="$folder-$suffix"; fi
  config_root="$HOME/$folder"
fi
case "$config_root" in /*) ;; *) fail HOST_CONFIG_PATH 'Configuration root must be absolute.' ;; esac
cli="$app/Contents/Resources/app.asar.unpacked/cli/dist/codebuddy.js"
for event in UserPromptSubmit PreToolUse Stop SubagentStop FinalStop SessionEnd StopFailure; do
  grep -Fq "$event" "$cli" 2>/dev/null || fail HOST_HOOKS "The bundled CLI does not expose $event. Upgrade to a compatible WorkBuddy build."
done
ensure_stopped() {
  local processes executable candidate
  processes=$(ps -axo comm=) || fail HOST_PROCESS_CHECK 'Cannot inspect running applications.'
  while IFS= read -r executable; do
    for candidate in "$app" "${candidates[@]:-}"; do
      [ -n "$candidate" ] || continue
      case "$executable" in "$candidate"/Contents/*) fail HOST_RUNNING 'Quit WorkBuddy with Command-Q after finishing phone tasks, then rerun this installer. No configuration was changed.' ;; esac
    done
  done <<< "$processes"
}
stage "Preflight: WorkBuddy $host_version; configuration: $config_root"
ensure_stopped
if [ "$check_only" = true ]; then
  stage 'PREFLIGHT_OK: no files changed. Hook declarations found; runtime delivery still requires host verification.'
  exit 0
fi
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
root="$HOME/.workbuddy/opengui"
case "$root" in /*) ;; *) echo 'Installation home must be absolute.' >&2; exit 1 ;; esac
private_dir "$config_root"
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
  stage "Downloading verified OpenGUI package"
  archive="$temporary/$ARCHIVE_NAME"
  if ! fetch "$base/$ARCHIVE_NAME.sha256" "$archive.sha256"; then
    echo "No downloadable $HOST $VERSION package, or network unavailable. Check the release page; installation stopped without changing host configuration." >&2
    exit 1
  fi
  digest=$(awk 'NR == 1 { print $1 }' "$archive.sha256")
  [[ "$digest" =~ ^[0-9a-f]{64}$ ]] || fail ARCHIVE_DIGEST 'Invalid release checksum.'
  private_dir "$root/downloads"
  cached="$root/downloads/$digest.tgz"
  if [ -f "$cached" ] && [ ! -L "$cached" ] && [ "$(shasum -a 256 "$cached" | awk '{print $1}')" = "$digest" ]; then
    stage 'Reusing verified package download'
    cp "$cached" "$archive"
  else
    fetch "$base/$ARCHIVE_NAME" "$archive"
    [ "$(shasum -a 256 "$archive" | awk '{print $1}')" = "$digest" ] || fail ARCHIVE_CHECKSUM 'Archive checksum mismatch.'
    cached_new=$(mktemp "$root/downloads/.verified.XXXXXXXX")
    cp "$archive" "$cached_new"
    mv -f "$cached_new" "$cached"
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
ensure_stopped
stage "Installing configuration and checking runtime dependencies"
"$node" - "$root" "$temporary/verified.tar.gz" "$VERSION" "$config_root" "$expected" "$0" "$app" "$repair_legacy" <<'INSTALL_JS'
const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const [root, archive, version, configRoot, archiveSha256, installer, app, repairLegacy] = process.argv.slice(2);
const packages = path.join(root, 'packages');
fs.mkdirSync(packages, { recursive: true });
if (fs.lstatSync(packages).isSymbolicLink()) throw Error('Redirected packages directory');
const cache = path.join(packages, `${version}-${archiveSha256}`);
let install = cache;
const reusable = fs.existsSync(path.join(cache, '.complete')) && fs.readFileSync(path.join(cache, '.complete'), 'utf8') === archiveSha256;
if (!reusable) install = fs.mkdtempSync(path.join(packages, version + '-'));
if (fs.existsSync(cache) && (!reusable || fs.lstatSync(cache).isSymbolicLink())) throw Error('CACHE_INVALID: retain existing files and inspect the package cache before retrying');
const npm = path.resolve(process.execPath, '../../lib/node_modules/npm/bin/npm-cli.js');
if (!reusable) execFileSync(process.execPath, [npm, 'install', '--prefix', install, '--ignore-scripts', '--no-audit', '--no-fund', archive], { stdio: 'inherit' });
let pkg = path.join(install, 'node_modules/opengui-mcp');
const meta = JSON.parse(fs.readFileSync(path.join(pkg, 'package.json')));
if (meta.name !== 'opengui-mcp' || meta.version !== version) throw Error('Archive package/version mismatch');
// Verify native dependencies before switching the host configuration.
execFileSync(process.execPath, ['--input-type=module', '-e', 'await import("sharp"); await import("@modelcontextprotocol/sdk/client/index.js")'], { cwd: pkg, stdio: 'inherit' });
if (!reusable) {
  fs.writeFileSync(path.join(install, '.complete'), archiveSha256, {mode: 0o600});
  fs.renameSync(install, cache);
  pkg = path.join(cache, 'node_modules/opengui-mcp');
}
try {
  execFileSync(process.execPath, [path.join(pkg, 'lib/prepare-video.js')], { stdio: 'inherit', env: { ...process.env, OPENGUI_WORKBUDDY_HOME: root } });
} catch (error) {
  console.error('VIDEO_PREPARE_FAILED: old configuration retained. Restore network access and rerun this installer with the same --archive.');
  throw error;
}
execFileSync('bash', [installer, '--check', '--app', app, '--config-root', configRoot], {stdio: 'inherit'});
execFileSync(process.execPath, [path.join(pkg, 'lib/check-upgrade.js')], { stdio: 'inherit', env: { ...process.env, OPENGUI_WORKBUDDY_HOME: root } });
execFileSync(process.execPath, [path.join(pkg, 'scripts/install-local.mjs'), '--package-dir', pkg, '--node', process.execPath, '--config-root', configRoot, '--state-root', root, ...(repairLegacy === 'true' ? ['--repair-legacy'] : [])], { stdio: 'inherit' });
console.log('CONFIG_WRITTEN: MCP, Skill and lifecycle Hooks configured. Host loading and Hook delivery are NOT yet verified. Reopen WorkBuddy, trust OpenGUI MCP, choose /opengui and ask to list phones without operating them.');
console.log('Rollback receipt: see installState in the result above. Old packages and per-configuration receipts are retained.');

INSTALL_JS

stage "Finished. Reopen WorkBuddy and verify read-only device discovery."
