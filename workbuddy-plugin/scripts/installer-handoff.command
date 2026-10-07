#!/bin/bash
# Interactive handoff to the verified public WorkBuddy installer.
set -euo pipefail
umask 077
expected_sha='b3581c8d928068e7bf7a8a886f75c1c436efdb71ae2c5bf97b220b36bf9f0239'

if [ ! -t 0 ] || [ ! -t 1 ] || [ -n "${CODEBUDDY_FORCE_HEADLESS_BUNDLE:-}" ] || [[ "${NODE_OPTIONS:-}" == *node-language-shim* ]]; then
  echo '请在 Finder 中双击 OpenGUI-Install.command，由 macOS 终端打开。'
  echo 'Open this file yourself in macOS Terminal. No installation was started.'
  exit 73
fi
if [ "$#" -ne 0 ]; then
  echo 'This interactive installer does not accept command-line options.' >&2
  exit 64
fi
folder=$(cd -- "$(dirname -- "$0")" && pwd -P)
installer="$folder/installer.sh"
if [ ! -f "$installer" ] || [ -L "$installer" ]; then
  echo '安装文件缺失或被重定向，请重新下载完整 ZIP。Missing or redirected installer.' >&2
  exit 1
fi
actual_sha=$(shasum -a 256 "$installer" | awk '{print $1}')
if [ "$actual_sha" != "$expected_sha" ]; then
  echo '校验失败：安装文件已改变。Checksum mismatch; nothing was installed.' >&2
  exit 1
fi
printf '\nOpenGUI → WorkBuddy\n\n'
printf '将下载官方 0.3.1 插件及独立运行环境，配置 MCP、Skill 和 7 个生命周期 Hooks。\n'
printf '保留其他插件，写入前备份配置。不需要 sudo 或系统密码。\n'
printf '请先结束 OpenGUI 手机任务；如已安装，请退出 WorkBuddy，等待后台服务正常结束。\n'
printf '安装本身不会操作手机。后续手机任务的截图会发送给你选择的执行模型。\n\n'
printf 'Press Return to install / 按回车开始安装；输入 q 后回车取消：'
IFS= read -r answer || exit 1
if [ -n "$answer" ]; then
  echo '已取消，未开始安装。Cancelled; nothing was installed.'
  exit 0
fi
# Keep each run separate so an earlier success cannot be mistaken for this run.
run_dir=$(mktemp -d "$folder/installation-result.XXXXXXXX")
log="$run_dir/install.log"
result="$run_dir/result.txt"
printf '状态 / Status: %s\n' "$result"
printf 'status=running\nhostLoaded=unverified\n' > "$result"
set +e
bash "$installer" 2>&1 | tee "$log"
status=${PIPESTATUS[0]}
set -e
if [ "$status" -eq 0 ] && grep -Eq 'CONFIG_WRITTEN|ALREADY_CONFIGURED' "$log"; then
  printf 'status=configuration_written\nexitCode=0\nhostLoaded=unverified\n' > "$result"
  printf '\n安装配置已写入 / Configuration written.\n'
  printf '返回 WorkBuddy，发送：调用 opengui_list_devices 验证安装，不要操作手机。\n'
  printf '若工具未出现，结束其他任务后退出并重新打开 WorkBuddy，再验证。\n'
  printf '只有 Skill 或 MCP 开关实际关闭时才需要开启。不要因为下载成功就认为验收完成。\n'
else
  [ "$status" -ne 0 ] || status=1
  printf 'status=failed\nexitCode=%s\nhostLoaded=unverified\n' "$status" > "$result"
  printf '\n安装未完成 / Installation failed (exit %s).\n' "$status"
  printf '请把上方错误告诉 WorkBuddy。不要反复重试或删除运行中的锁。\n'
fi
printf '\n结果文件 / Result: %s\n日志 / Log: %s\n' "$result" "$log"
printf '按回车关闭此步骤 / Press Return to finish: '
IFS= read -r _ || true
exit "$status"
