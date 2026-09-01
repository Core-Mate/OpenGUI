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
profile_manifest="${dsh_home}/profiles/${profile}/package.json"
plugin_directory="${dsh_home}/profiles/${profile}/node_modules/${package_name}"
plugin_registered=false
if [[ -f "$profile_manifest" ]]; then
  command -v node >/dev/null 2>&1 || { printf 'Required command not found: node\n' >&2; exit 1; }
  if ! plugin_state="$(node -e '
    try {
      const profile = JSON.parse(require("node:fs").readFileSync(process.argv[1], "utf8"))
      const name = process.argv[2]
      const registered = typeof profile.dependencies?.[name] === "string" || profile.dsh?.profile?.bundles?.includes(name)
      process.stdout.write(registered ? "registered" : "absent")
    } catch (error) {
      console.error(`Could not inspect ${process.argv[1]}: ${error.message}`)
      process.exit(1)
    }
  ' "$profile_manifest" "$package_name")"; then
    printf 'Could not inspect the DSH web profile. OpenGUI remains installed.\n' >&2
    exit 1
  fi
  if [[ "$plugin_state" == registered ]]; then
    plugin_registered=true
  fi
fi
if [[ "$plugin_registered" != true && -e "$plugin_directory" ]]; then
  printf 'The DSH web profile does not register %s, but its plugin directory is still present. OpenGUI remains installed.\n' "$package_name" >&2
  exit 1
fi

detected_dsh_version=""
managed_dsh="${dsh_home}/runtime/dsh-0.1.0-rc.7/node_modules/.bin/dsh"
managed_dsh_version=""
if [[ "$plugin_registered" == true && -x "$managed_dsh" ]]; then
  managed_dsh_version="$("$managed_dsh" -V 2>/dev/null || true)"
fi
if [[ "$plugin_registered" == true ]] && command -v dsh >/dev/null 2>&1; then
  detected_dsh_version="$(dsh -V 2>/dev/null || true)"
fi

if [[ "$plugin_registered" != true ]]; then
  dsh_command=()
elif [[ "$managed_dsh_version" == '0.1.0-rc.7' ]]; then
  dsh_command=("$managed_dsh")
elif [[ "$detected_dsh_version" == '0.1.0-rc.7' ]]; then
  dsh_command=(dsh)
elif command -v pnpm >/dev/null 2>&1; then
  dsh_command=(pnpm dlx '@deepseek-ai/dsh@0.1.0-rc.7')
elif command -v corepack >/dev/null 2>&1; then
  dsh_command=(corepack pnpm dlx '@deepseek-ai/dsh@0.1.0-rc.7')
elif command -v npx >/dev/null 2>&1; then
  dsh_command=(npx -y '@deepseek-ai/dsh@0.1.0-rc.7')
else
  printf 'A compatible DSH launcher was not found. Install pnpm, corepack, or npm, then rerun this command. OpenGUI remains installed.\n' >&2
  exit 1
fi

if [[ "$plugin_registered" == true ]]; then
  installed_dsh="$("${dsh_command[@]}" -V)"
else
  installed_dsh='0.1.0-rc.7'
fi
if [[ "$installed_dsh" != '0.1.0-rc.7' ]]; then
  printf 'Expected DSH 0.1.0-rc.7 but resolved %s. OpenGUI remains installed.\n' "$installed_dsh" >&2
  exit 1
fi

managed_runtime=false
if command -v launchctl >/dev/null 2>&1 && launchctl print "$service_target" >/dev/null 2>&1; then
  managed_runtime=true
  if ! launchctl bootout "$service_target" >/dev/null 2>&1; then
    printf 'Could not stop LaunchAgent %s. OpenGUI remains installed.\n' "$job_label" >&2
    exit 1
  fi
  if launchctl print "$service_target" >/dev/null 2>&1; then
    printf 'LaunchAgent %s is still running. OpenGUI remains installed.\n' "$job_label" >&2
    exit 1
  fi
fi

if [[ "$plugin_registered" == true ]] && ! DSH_HOME="$dsh_home" "${dsh_command[@]}" plugin --profile "$profile" remove "$package_name"; then
  if [[ "$managed_runtime" == true && -f "$plist_path" ]]; then
    launchctl bootstrap "gui/${UID}" "$plist_path" >/dev/null 2>&1 || true
    launchctl kickstart -k "$service_target" >/dev/null 2>&1 || true
  fi
  printf 'Could not remove %s. The LaunchAgent definition was preserved.\n' "$package_name" >&2
  exit 1
fi
rm -f "$plist_path" "${dsh_home}/logs/opengui-coremate-web.job"
printf 'Removed %s and LaunchAgent %s. Settings and caches were preserved.\n' "$package_name" "$job_label"
