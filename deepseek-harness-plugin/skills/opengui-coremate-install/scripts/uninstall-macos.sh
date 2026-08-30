#!/usr/bin/env bash
set -euo pipefail

profile="web"
port="${COREMATE_INSTALL_PORT_OVERRIDE:-3080}"
package_name="dsh-coremate-mobile"
dsh_home="${DSH_HOME:-${HOME}/.dsh}"
launch_agents_dir="${COREMATE_INSTALL_LAUNCH_AGENTS_DIR_OVERRIDE:-${HOME}/Library/LaunchAgents}"

usage() {
  printf '%s\n' 'Usage: uninstall-macos.sh [--dsh-home PATH] [--port PORT]'
}

while (($# > 0)); do
  case "$1" in
    --dsh-home)
      [[ $# -ge 2 ]] || { usage >&2; exit 2; }
      dsh_home="$2"
      shift 2
      ;;
    --port)
      [[ $# -ge 2 ]] || { usage >&2; exit 2; }
      port="$2"
      shift 2
      ;;
    -h|--help)
      usage
      exit 0
      ;;
    *)
      printf 'Unknown option: %s\n' "$1" >&2
      usage >&2
      exit 2
      ;;
  esac
done

mkdir -p "$dsh_home"
canonical_dsh_home="$(cd "$dsh_home" && pwd -P)"
default_dsh_home="$(cd "$HOME" && pwd -P)/.dsh"
job_label="com.coremate.opengui.web"
if [[ "$canonical_dsh_home" != "$default_dsh_home" || "$port" != "3080" ]]; then
  label_hash="$(printf '%s\n%s\n' "$canonical_dsh_home" "$port" | shasum -a 256 | awk '{print substr($1,1,12)}')"
  job_label="${job_label}.${label_hash}"
fi
plist_path="${launch_agents_dir}/${job_label}.plist"
service_target="gui/${UID}/${job_label}"

if command -v launchctl >/dev/null 2>&1; then
  launchctl bootout "$service_target" >/dev/null 2>&1 || true
fi
rm -f "$plist_path" "${dsh_home}/logs/opengui-coremate-web.job"

if command -v dsh >/dev/null 2>&1; then
  dsh_command=(dsh)
elif command -v pnpm >/dev/null 2>&1; then
  dsh_command=(pnpm dlx '@deepseek-ai/dsh@0.1.0-rc.7')
elif command -v corepack >/dev/null 2>&1; then
  dsh_command=(corepack pnpm dlx '@deepseek-ai/dsh@0.1.0-rc.7')
elif command -v npx >/dev/null 2>&1; then
  dsh_command=(npx -y '@deepseek-ai/dsh@0.1.0-rc.7')
else
  printf 'OpenGUI Host registration was removed, but no DSH launcher was found to remove the plugin.\n' >&2
  exit 1
fi

DSH_HOME="$dsh_home" "${dsh_command[@]}" plugin --profile "$profile" remove "$package_name"
printf 'Removed %s and LaunchAgent %s. Settings and caches were preserved.\n' "$package_name" "$job_label"
