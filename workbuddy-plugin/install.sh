#!/bin/bash
# Public macOS entry point. Safe to read from stdin; installation starts after parsing.
set -euo pipefail

main() (
  umask 077
  local source_base='https://raw.githubusercontent.com/Core-Mate/OpenGUI/main/workbuddy-plugin'
  local installer_sha='941d139136bf8292db50a0879e8fa7cf32030ea2cfab83893994b17fb44d66c6'
  local guide_sha='ab1be4a7437e916a46610f66b526797527c6f858fbdbea51063d496065a652d3'
  local run_dir= status=failed check_only=false
  local state_root="$HOME/.workbuddy/opengui/installations"

  fail() { printf '%s\n' "$*" >&2; exit 1; }
  private_dir() {
    local folder=$1 cursor=$1
    case "$folder" in /*) ;; *) fail 'Installation home must be absolute.' ;; esac
    while [ "$cursor" != / ]; do
      [ ! -L "$cursor" ] || fail "Refusing redirected installation directory: $cursor"
      cursor=$(dirname "$cursor")
    done
    mkdir -p "$folder"
    [ "$(stat -f '%u' "$folder")" = "$(id -u)" ] || fail "Installation directory is not owned by this user: $folder"
    chmod 700 "$folder"
  }
  fetch() {
    curl --proto '=https' --proto-redir '=https' --tlsv1.2 --fail --location \
      --connect-timeout 15 --max-time 1800 --speed-limit 1024 --speed-time 60 --retry 2 "$1" -o "$2"
  }
  verify() {
    [ "$(shasum -a 256 "$1" | awk '{print $1}')" = "$2" ] || fail "Download checksum mismatch: $1"
  }
  receipt() {
    local exit_code=$?
    trap - EXIT
    if [ -n "$run_dir" ]; then
      printf 'status=%s\nexitCode=%s\nhostLoaded=unverified\ninstallerSha256=%s\nlog=%s/install.log\nauthorizationGuide=%s/authorization.html\n' \
        "$status" "$exit_code" "$installer_sha" "$run_dir" "$run_dir" > "$run_dir/result.txt"
      printf 'INSTALLATION_RESULT: %s/result.txt\n' "$run_dir"
    fi
    exit "$exit_code"
  }
  for arg in "$@"; do
    case "$arg" in
      --help|-h)
        printf 'OpenGUI WorkBuddy installer (macOS)\nUsage: bash install.sh [--check] [--app /path/WorkBuddy.app] [--config-root /path] [--archive /path/package.tgz] [--repair-legacy]\n'
        return 0 ;;
      --check) check_only=true ;;
    esac
  done
  [ "$(uname -s)" = Darwin ] || fail 'Only macOS is supported.'
  private_dir "$state_root"
  run_dir=$(mktemp -d "$state_root/install.XXXXXXXX")
  trap receipt EXIT
  trap 'exit 130' INT
  trap 'exit 143' TERM
  printf '正在下载并校验 OpenGUI 安装文件…\n'
  fetch "$source_base/scripts/install-macos.command" "$run_dir/installer.sh"
  verify "$run_dir/installer.sh" "$installer_sha"
  # Download the complete, self-contained guide before changing host configuration.
  if [ "$check_only" = false ]; then
    fetch "$source_base/resources/OpenGUI-%E6%8E%88%E6%9D%83%E6%8C%87%E5%8D%97.html" "$run_dir/authorization.html"
    verify "$run_dir/authorization.html" "$guide_sha"
  fi
  if [ "$check_only" = true ]; then
    printf '正在检查安装环境，不会修改 WorkBuddy 配置。\n'
  else
    printf '正在安装 OpenGUI；安装完成后会打开技能和连接器授权说明。\n'
  fi
  local pipeline_status
  set +e
  bash "$run_dir/installer.sh" "$@" 2>&1 | tee "$run_dir/install.log"
  pipeline_status=("${PIPESTATUS[@]}")
  set -e
  [ "${pipeline_status[0]}" = 0 ] || exit "${pipeline_status[0]}"
  [ "${pipeline_status[1]}" = 0 ] || fail 'Could not save the installation log; inspect the actual configuration before retrying.'
  if [ "$check_only" = true ]; then
    status=preflight_ok
    return 0
  fi
  grep -q '^CONFIG_WRITTEN:' "$run_dir/install.log" || fail 'Installer exited without confirming configuration; authorization guide was not opened.'
  status=configuration_written
  printf '\n安装配置已写入。请在说明页面中完成技能和连接器授权。\n'
  printf 'AUTHORIZATION_GUIDE: %s/authorization.html\n' "$run_dir"
  # Failure to open a browser does not undo a successful installation.
  if ! open "$run_dir/authorization.html"; then
    printf '未能自动打开说明，请打开上方 AUTHORIZATION_GUIDE 路径。无需重新安装。\n' >&2
  fi
  printf '授权完成后，请在 WorkBuddy 新建或打开聊天，让助手检查 OpenGUI 连接并调用设备列表工具。\n'
)

main "$@"
