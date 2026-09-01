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

dsh_command=()
if [[ "$plugin_registered" == true ]]; then
  script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd -P)"
  compatibility_manifest="$(cd "${script_dir}/.." && pwd -P)/dsh-compatibility.json"
  if [[ ! -f "$compatibility_manifest" ]]; then
    printf 'DSH compatibility manifest not found: %s. OpenGUI remains installed.\n' "$compatibility_manifest" >&2
    exit 1
  fi
  if ! compatibility_values="$(node --input-type=module - "$compatibility_manifest" <<'NODE'
import { readFileSync } from 'node:fs'

const path = process.argv[2]
const value = JSON.parse(readFileSync(path, 'utf8'))
const exactRc = /^\d+\.\d+\.\d+-rc\.\d+$/u
if (value?.schemaVersion !== 1) throw new Error('unsupported schema version')
if (typeof value.preferredVersion !== 'string' || !exactRc.test(value.preferredVersion)) {
  throw new Error('preferredVersion must be an exact release candidate')
}
if (!Array.isArray(value.supportedVersions) || value.supportedVersions.length === 0
  || value.supportedVersions.some(version => typeof version !== 'string' || !exactRc.test(version))) {
  throw new Error('supportedVersions must contain exact release candidates')
}
if (new Set(value.supportedVersions).size !== value.supportedVersions.length) throw new Error('supportedVersions contains duplicates')
if (!value.supportedVersions.includes(value.preferredVersion)) throw new Error('preferredVersion is not supported')
const parts = version => version.match(/\d+/gu).map(Number)
const descending = [...value.supportedVersions].sort((left, right) => {
  const leftParts = parts(left)
  const rightParts = parts(right)
  for (let index = 0; index < leftParts.length; index += 1) {
    if (leftParts[index] !== rightParts[index]) return rightParts[index] - leftParts[index]
  }
  return 0
})
process.stdout.write([
  value.preferredVersion,
  value.supportedVersions.join(' '),
  descending.join(' '),
].join('\t'))
NODE
  )"; then
    printf 'DSH compatibility manifest is invalid. Reinstall OpenGUI from a verified release. OpenGUI remains installed.\n' >&2
    exit 1
  fi
  IFS=$'\t' read -r preferred_dsh_version supported_dsh_versions managed_dsh_versions <<<"$compatibility_values"

  is_supported_dsh_version() {
    case " ${supported_dsh_versions} " in
      *" $1 "*) return 0 ;;
      *) return 1 ;;
    esac
  }

  checked_dsh_versions=" "
  for candidate in "$preferred_dsh_version" $managed_dsh_versions; do
    case "$checked_dsh_versions" in *" $candidate "*) continue ;; esac
    checked_dsh_versions+="$candidate "
    managed_dsh="${dsh_home}/runtime/dsh-${candidate}/node_modules/.bin/dsh"
    [[ -x "$managed_dsh" ]] || continue
    managed_dsh_version="$("$managed_dsh" -V 2>/dev/null || true)"
    if [[ "$managed_dsh_version" == "$candidate" ]]; then
      dsh_command=("$managed_dsh")
      break
    fi
  done

  if ((${#dsh_command[@]} == 0)) && command -v dsh >/dev/null 2>&1; then
    detected_dsh_version="$(dsh -V 2>/dev/null || true)"
    if is_supported_dsh_version "$detected_dsh_version"; then
      dsh_command=(dsh)
    fi
  fi

  if ((${#dsh_command[@]} == 0)); then
    if command -v pnpm >/dev/null 2>&1; then
      dsh_command=(pnpm dlx "@deepseek-ai/dsh@${preferred_dsh_version}")
    elif command -v corepack >/dev/null 2>&1; then
      dsh_command=(corepack pnpm dlx "@deepseek-ai/dsh@${preferred_dsh_version}")
    elif command -v npx >/dev/null 2>&1; then
      dsh_command=(npx -y "@deepseek-ai/dsh@${preferred_dsh_version}")
    else
      printf 'A compatible DSH launcher was not found. Install pnpm, corepack, or npm, then rerun this command. OpenGUI remains installed.\n' >&2
      exit 1
    fi
  fi

  installed_dsh="$("${dsh_command[@]}" -V)"
  if ! is_supported_dsh_version "$installed_dsh"; then
    printf 'Resolved unsupported DSH %s. Supported versions: %s. OpenGUI remains installed.\n' "$installed_dsh" "${supported_dsh_versions// /, }" >&2
    exit 1
  fi
fi

managed_runtime=false
if command -v launchctl >/dev/null 2>&1 && launchctl print "$service_target" >/dev/null 2>&1; then
  managed_runtime=true
  if ! launchctl bootout "$service_target" >/dev/null 2>&1; then
    printf 'Could not stop LaunchAgent %s. OpenGUI remains installed.\n' "$job_label" >&2
    exit 1
  fi
  launch_agent_removed=false
  for _ in {1..150}; do
    if ! launchctl print "$service_target" >/dev/null 2>&1; then
      launch_agent_removed=true
      break
    fi
    sleep 0.1
  done
  if [[ "$launch_agent_removed" != true ]]; then
    printf 'LaunchAgent %s did not finish stopping. OpenGUI remains installed.\n' "$job_label" >&2
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
