#!/bin/bash
# Install a prebuilt release without a source checkout or system Node.
set -euo pipefail
umask 077
HOST=workbuddy
VERSION=0.4.1
ARCHIVE_NAME=opengui-mcp-$VERSION.tgz
usage() {
  echo "OpenGUI for $HOST $VERSION (macOS arm64/x64)"
  echo "Usage: bash $0 [--check] [--repair-legacy] [--download-source cn|official] [--video-mirror https://host/path] [--app /path/WorkBuddy.app] [--config-root /verified/path] [--archive /absolute/path/$ARCHIVE_NAME]"
  echo 'Downloads a verified prebuilt package and private Node. No sudo or source build.'
  echo 'Node and npm default to npmmirror (cn), with official fallback. Video uses GitHub unless --video-mirror is supplied.'
  echo 'Automatic discovery prefers WorkBuddy over WorkBuddy AI. Use --app to select a specific bundle.'
  echo 'Finish existing OpenGUI tasks before upgrading. WorkBuddy may stay open during installation; fully quit and reopen once afterward.'
}
archive=
app=
config_root=${WORKBUDDY_CONFIG_DIR:-${CODEBUDDY_CONFIG_DIR:-}}
check_only=false
repair_legacy=false
download_source=${OPENGUI_DOWNLOAD_SOURCE:-cn}
video_mirror=${OPENGUI_VIDEO_MIRROR:-}
while [ "$#" -gt 0 ]; do
  case "$1" in
    --help|-h) usage; exit 0 ;;
    --archive|--app|--config-root|--download-source|--video-mirror)
      [ "$#" -ge 2 ] || { usage; exit 1; }
      case "$1" in --archive) archive=$2 ;; --app) app=$2 ;; --config-root) config_root=$2 ;; --download-source) download_source=$2 ;; --video-mirror) video_mirror=$2 ;; esac
      shift 2 ;;
    --check) check_only=true; shift ;;
    --repair-legacy) repair_legacy=true; shift ;;
    *) usage; exit 1 ;;
  esac
done
fail() { echo "[$1] $2" >&2; exit 1; }
started=$SECONDS
stage() { echo "[$((SECONDS-started))s] $*"; }
case "$download_source" in
  cn) node_base=https://npmmirror.com/mirrors/node; npm_registry=https://registry.npmmirror.com ;;
  official) node_base=https://nodejs.org/dist; npm_registry=https://registry.npmjs.org ;;
  *) fail DOWNLOAD_SOURCE 'Use --download-source cn or official.' ;;
esac
export OPENGUI_DOWNLOAD_SOURCE="$download_source"
if [ -n "$video_mirror" ]; then
  case "$video_mirror" in https://?*) ;; *) fail VIDEO_MIRROR 'The video mirror must be an HTTPS archive directory.' ;; esac
  case "$video_mirror" in *[[:space:]]*|*\?*|*\#*|*@*) fail VIDEO_MIRROR 'The video mirror must not contain credentials, whitespace, query or fragment.' ;; esac
fi
export OPENGUI_VIDEO_MIRROR="$video_mirror"
[ "$(uname -s)" = Darwin ] || { echo 'Only macOS is supported.' >&2; exit 1; }
case "$(uname -m)" in
  arm64) arch=arm64; node_sha=61130f394c1630d211dd50aecc4353d379480f36d3ac913cd85dbba1aed585c6 ;;
  x86_64) arch=x64; node_sha=58e99022c2ff89395576cc7fd4d98cea24bb68081475d5f88b801ee8729fb026 ;;
  *) echo 'Unsupported architecture.' >&2; exit 1 ;;
esac
is_workbuddy_bundle() {
  case "$1" in
    com.workbuddy.workbuddy|com.workbuddy.workbuddy-ai|com.tencent.workbuddy.*) return 0 ;;
    *) return 1 ;;
  esac
}
if [ -z "$app" ]; then
  # Prefer standard WorkBuddy, including its legacy identity, over WorkBuddy AI.
  # Bundle identities also recognize renamed and mounted applications.
  candidates=()
  standard_candidates=()
  for candidate in /Applications/*.app "$HOME"/Applications/*.app /Volumes/*/*.app; do
    [ -f "$candidate/Contents/Info.plist" ] || continue
    bundle_id=$(/usr/libexec/PlistBuddy -c 'Print :CFBundleIdentifier' "$candidate/Contents/Info.plist" 2>/dev/null || true)
    is_workbuddy_bundle "$bundle_id" || continue
    case "$bundle_id" in
      com.workbuddy.workbuddy-ai) candidates+=("$candidate") ;;
      *) standard_candidates+=("$candidate") ;;
    esac
  done
  if [ "${#standard_candidates[@]}" -gt 0 ]; then candidates=("${standard_candidates[@]}"); fi
  [ "${#candidates[@]}" -gt 0 ] || fail HOST_NOT_FOUND 'Install WorkBuddy first, or select its bundle with --app /path/WorkBuddy.app.'
  [ "${#candidates[@]}" = 1 ] || fail HOST_AMBIGUOUS 'Multiple WorkBuddy bundles at the preferred priority found. Select the intended one with --app /path/WorkBuddy.app.'
  app=${candidates[0]}
fi
case "$app" in /*.app) ;; *) fail HOST_PATH 'The --app path must be an absolute .app bundle path.' ;; esac
[ -d "$app" ] || fail HOST_NOT_FOUND 'Selected application does not exist.'
app=$(cd "$app" && pwd -P)
bundle_id=$(/usr/libexec/PlistBuddy -c 'Print :CFBundleIdentifier' "$app/Contents/Info.plist" 2>/dev/null || true)
is_workbuddy_bundle "$bundle_id" || fail HOST_IDENTITY 'Selected bundle is not a recognized WorkBuddy application.'
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
cli_compatible=false
for cli_name in codebuddy.js codebuddy-headless.js codebuddy-lite-wb.mjs; do
  cli="$app/Contents/Resources/app.asar.unpacked/cli/dist/$cli_name"
  [ -f "$cli" ] || continue
  all_hooks=true
  for event in UserPromptSubmit PreToolUse Stop SubagentStop FinalStop SessionEnd StopFailure; do
    if ! grep -Fq "$event" "$cli"; then all_hooks=false; break; fi
  done
  if [ "$all_hooks" = true ]; then cli_compatible=true; break; fi
done
[ "$cli_compatible" = true ] || fail HOST_HOOKS 'No recognized bundled CLI exposes all required lifecycle Hooks. Upgrade to a compatible WorkBuddy build.'
stage "Preflight: WorkBuddy $host_version; application: $app; configuration: $config_root"
stage "Download source: $download_source; npm: $npm_registry; video: ${video_mirror:-official GitHub}"
if [ "$check_only" = true ]; then
  stage 'PREFLIGHT_OK: no files changed. Restart WorkBuddy once after installation; MCP loading and /hooks review still require host verification.'
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
# Only tighten OpenGUI state after its ownership and symlink checks.
private_dir "$root"
chmod 700 "$root"
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
    --connect-timeout 15 --max-time "${3:-1800}" --speed-limit 1024 --speed-time 60 --retry 2 "$1" -o "$2"
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
  if ! fetch "$node_base/v22.23.2/$node_name.tar.gz" "$temporary/node.tar.gz" 90; then
    [ "$download_source" = cn ] || fail NODE_DOWNLOAD 'Node download failed. Retry with --download-source cn.'
    stage 'Node mirror unavailable; falling back to nodejs.org.'
    fetch "https://nodejs.org/dist/v22.23.2/$node_name.tar.gz" "$temporary/node.tar.gz"
  fi
  [ "$(shasum -a 256 "$temporary/node.tar.gz" | awk '{print $1}')" = "$node_sha" ] || { echo 'Node checksum mismatch.' >&2; exit 1; }
  tar -xzf "$temporary/node.tar.gz" -C "$temporary"
  printf '%s\n%s\n' "$node_sha" "$(shasum -a 256 "$temporary/$node_name/bin/node" | awk '{print $1}')" > "$temporary/$node_name/.verified"
  mv "$temporary/$node_name" "$node_dir"
fi
stage "Installing configuration and checking runtime dependencies"
"$node" - "$root" "$temporary/verified.tar.gz" "$VERSION" "$config_root" "$expected" "$0" "$app" "$repair_legacy" "$npm_registry" <<'INSTALL_JS'
const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const [root, archive, version, configRoot, archiveSha256, installer, app, repairLegacy, npmRegistry] = process.argv.slice(2);
const packages = path.join(root, 'packages');
fs.mkdirSync(packages, { recursive: true });
if (fs.lstatSync(packages).isSymbolicLink()) throw Error('Redirected packages directory');
const cache = path.join(packages, `${version}-${archiveSha256}`);
let install = cache;
const reusable = fs.existsSync(path.join(cache, '.complete')) && fs.readFileSync(path.join(cache, '.complete'), 'utf8') === archiveSha256;
if (!reusable) install = fs.mkdtempSync(path.join(packages, version + '-'));
if (fs.existsSync(cache) && (!reusable || fs.lstatSync(cache).isSymbolicLink())) throw Error('CACHE_INVALID: retain existing files and inspect the package cache before retrying');
const npm = path.resolve(process.execPath, '../../lib/node_modules/npm/bin/npm-cli.js');
// npm reads process.cwd() before applying --prefix; use our verified private directory.
if (!reusable) {
  const installFrom = registry => execFileSync(process.execPath, [npm, 'install', '--prefix', install, '--registry', registry, '--ignore-scripts', '--no-audit', '--no-fund', archive], { cwd: install, stdio: 'inherit' });
  try { installFrom(npmRegistry); } catch (error) {
    if (npmRegistry !== 'https://registry.npmmirror.com') throw error;
    console.error('npm mirror installation failed; retrying with registry.npmjs.org.');
    // A partial lockfile can retain mirror tarball URLs during the official retry.
    fs.rmSync(path.join(install, 'node_modules'), { recursive: true, force: true });
    fs.rmSync(path.join(install, 'package-lock.json'), { force: true });
    installFrom('https://registry.npmjs.org');
  }
}
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
  if (process.env.OPENGUI_VIDEO_MIRROR && !fs.readFileSync(path.join(pkg, 'lib/prepare-video.js'), 'utf8').includes('OPENGUI_VIDEO_MIRROR')) {
    throw Error('VIDEO_MIRROR_UNSUPPORTED: this package predates video mirror support. Upgrade the package or omit --video-mirror; the mirror was not silently ignored.');
  }
  execFileSync(process.execPath, [path.join(pkg, 'lib/prepare-video.js')], { stdio: 'inherit', env: { ...process.env, OPENGUI_WORKBUDDY_HOME: root } });
} catch (error) {
  console.error('VIDEO_PREPARE_FAILED: old configuration retained. Inspect the reported error and rerun this installer with the same --archive.');
  throw error;
}
execFileSync('bash', [installer, '--check', '--app', app, '--config-root', configRoot], {stdio: 'inherit'});
execFileSync(process.execPath, [path.join(pkg, 'lib/check-upgrade.js')], { stdio: 'inherit', env: { ...process.env, OPENGUI_WORKBUDDY_HOME: root } });
execFileSync(process.execPath, [path.join(pkg, 'scripts/install-local.mjs'), '--package-dir', pkg, '--node', process.execPath, '--config-root', configRoot, '--state-root', root, ...(repairLegacy === 'true' ? ['--repair-legacy'] : [])], { stdio: 'inherit' });
console.log('CONFIG_WRITTEN: MCP, Skill and lifecycle Hooks configuration written. Finish other tasks, fully quit WorkBuddy with Command-Q, then reopen it once. Authorize the OpenGUI Skill and trust/enable its MCP, review /hooks, and verify read-only device discovery. Host loading remains unverified.');
console.log('Rollback receipt: see installState in the result above. Old packages and per-configuration receipts are retained.');
console.log('下一步 / Next steps:');
console.log('1. 安装后需要重启一次 WorkBuddy：先结束其他任务，用 ⌘Q 完全退出，再重新打开；只关闭窗口不算退出。');
console.log('2. 授权 OpenGUI 技能和连接器，在 MCP 管理中完成信任并确认已启用；按提示检查 /hooks 和 /skills。');
console.log('3. 发送 @opengui，右侧会打开任务首页。先登录，再连接 Android 手机或启动模拟器；执行跟随当前 WorkBuddy 模型。');
console.log('4. Try it / 先试一下：打开手机设置，再返回桌面，确认回到桌面后结束。');
console.log('5. 在首页填写任务并点击「开始执行」。审核、接管和执行结果在右侧显示；结束后可查看报告或新建任务。');
console.log('App 测试请准备：应用/页面、测试数据、预期结果、停止位置。评论任务另需账号/目标链接、范围和数量或时限。密码与验证码请自行在设备或登录面板输入。');


INSTALL_JS

stage "Finished. Fully quit and reopen WorkBuddy once, authorize OpenGUI, then verify read-only device discovery."
