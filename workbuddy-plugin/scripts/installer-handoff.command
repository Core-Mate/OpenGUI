#!/bin/bash
# Interactive handoff to the verified public WorkBuddy installer.
set -euo pipefail
umask 077
expected_sha='70420c3526ad32cb06f9bb9f31e4a4a3e43496fc2627345ecf986847f0cdf738'

if [ ! -t 0 ] || [ ! -t 1 ] || [ -n "${CODEBUDDY_FORCE_HEADLESS_BUNDLE:-}" ] || [[ "${NODE_OPTIONS:-}" == *node-language-shim* ]]; then
  echo '尚未开始安装。请在 Finder 中双击 OpenGUI-安装.command，打开终端安装窗口。'
  exit 73
fi
if [ "$#" -ne 0 ]; then
  echo '此安装入口不接受命令参数，请直接双击打开。' >&2
  exit 64
fi
folder=$(cd -- "$(dirname -- "$0")" && pwd -P)
installer="$folder/installer.sh"
if [ ! -f "$installer" ] || [ -L "$installer" ]; then
  echo '安装文件不完整或路径异常，尚未开始安装。请重新下载完整安装文件，保持两个脚本在同一目录。' >&2
  exit 1
fi
actual_sha=$(shasum -a 256 "$installer" | awk '{print $1}')
if [ "$actual_sha" != "$expected_sha" ]; then
  echo '安装文件校验失败，尚未开始安装。请重新下载完整安装文件，保持两个脚本在同一目录。' >&2
  exit 1
fi
printf '\nOpenGUI · WorkBuddy 安装\n\n'
printf '将安装 OpenGUI 插件 0.4.0，配置连接器、技能和任务运行所需的 Hooks。\n'
printf '会自动备份相关设置，保留其他插件，无需系统密码。\n'
printf '安装时可以保持 WorkBuddy 打开。若正在升级，请先结束旧 OpenGUI 手机任务。\n'
printf '本次安装不会操作手机；后续执行任务时，截图会发送给所选模型。\n\n'
printf '按回车开始安装，输入 q 后回车取消：'
IFS= read -r answer || exit 1
if [ -n "$answer" ]; then
  echo '已取消，未开始安装。可以关闭此窗口。'
  exit 0
fi
# Keep each run separate so an earlier success cannot be mistaken for this run.
run_dir=$(mktemp -d "$folder/installation-result.XXXXXXXX")
log="$run_dir/install.log"
result="$run_dir/result.txt"
printf '\n正在安装，请保持窗口打开。首次安装需要下载文件，可能需要几分钟。\n'
printf '详细日志：%s\n\n' "$log"
printf 'status=running\nhostLoaded=unverified\n' > "$result"
set +e
# Read each record without buffering curl carriage-return progress until EOF.
show_progress() {
  local line='' char progress=false
  local total_pct total received_pct received upload_pct uploaded speed upload_speed duration elapsed remaining current extra
  while IFS= read -r -n 1 char || [ -n "$line" ]; do
    if [ -n "$char" ] && [ "$char" != $'\r' ]; then line+="$char"; continue; fi
    read -r total_pct total received_pct received upload_pct uploaded speed upload_speed duration elapsed remaining current extra <<< "$line"
    if [[ "$total_pct" =~ ^[0-9]+$ ]] && [[ "$received_pct" =~ ^[0-9]+$ ]] && [ -n "$current" ] && [ -z "$extra" ]; then
      printf '\r       下载 %s%% · %s / %s · %s B/s · 剩余 %s     ' "$received_pct" "$received" "$total" "$current" "$remaining"
      progress=true
    elif [ -n "$line" ]; then
      if [ "$progress" = true ]; then printf '\n'; progress=false; fi
      case "$line" in
        *'] Preflight:'*) echo '  1/3  已找到 WorkBuddy，正在检查安装环境。' ;;
        *'] Downloading verified OpenGUI package'*) echo '  2/3  正在下载并校验插件文件。' ;;
        *'] Reusing verified package download'*) echo '  2/3  已找到校验通过的插件文件。' ;;
        'Preparing private Node.js'*) echo '       正在下载运行环境（约 50 MB），下方显示实时进度。' ;;
        *'] Installing configuration'*) echo '  3/3  正在准备组件并写入配置。' ;;
        curl:*|Warning:*) printf '%s\n' "$line" ;;
      esac
    fi
    line=''
  done
  if [ "$progress" = true ]; then printf '\n'; fi
  return 0
}
bash "$installer" 2>&1 | tee "$log" | show_progress
pipeline_status=("${PIPESTATUS[@]}")
status=${pipeline_status[0]}
# A failed log or progress stream must not produce a successful receipt.
if [ "$status" -eq 0 ]; then
  for stream_status in "${pipeline_status[@]}"; do
    if [ "$stream_status" -ne 0 ]; then status=$stream_status; break; fi
  done
fi
set -e
if [ "$status" -eq 0 ] && grep -Eq 'CONFIG_WRITTEN|ALREADY_CONFIGURED' "$log"; then
  printf 'status=configuration_written\nexitCode=0\nhostLoaded=unverified\nnextAction=return_to_workbuddy_and_trust_mcp\n' > "$result"
  printf '\n安装配置已写入\n\n'
  printf '1. 返回 WorkBuddy，在「专家·技能·连接器 → 技能」中授权 OpenGUI。\n'
  printf '2. 进入「连接器 → 自定义连接器」，找到 opengui，点击「信任」并完成首次授权。\n'
  printf '   确认最右侧开关已开启、名称旁状态点变绿；已为绿色时保持不变。\n'
  printf '   若找不到 OpenGUI 或新配置未生效，再结束其他任务，用 ⌘Q 退出并重新打开 WorkBuddy。\n'
  printf '   图示见已打开的 OpenGUI-安装指南.html 第 2 步。\n'
  printf '3. 在 WorkBuddy 新建或打开聊天，发送下面这句话，由助手验证工具是否加载：\n\n'
  printf '  已安装完成\n\n'

else
  [ "$status" -ne 0 ] || status=1
  printf 'status=failed\nexitCode=%s\nhostLoaded=unverified\n' "$status" > "$result"
  printf '\n安装未完成（错误码 %s）\n\n' "$status"
  printf '请把下面的错误摘要和详细日志交给 WorkBuddy 排查：\n\n'
  if grep -q 'upgrade_blocked' "$log"; then
    printf '旧 OpenGUI 服务仍在运行。请结束旧手机任务、关闭其展示，在 MCP 管理中停用旧 OpenGUI，等待服务退出后重试；WorkBuddy 可以保持打开。\n\n'
  fi
  tail -n 20 "$log"
  printf '\n先确认失败原因，再按提示重试。\n'
fi
printf '\n安装结果与日志已保存在：\n%s\n' "$run_dir"
printf '\n按回车结束安装程序，随后可关闭此窗口：'
IFS= read -r _ || true
exit "$status"
