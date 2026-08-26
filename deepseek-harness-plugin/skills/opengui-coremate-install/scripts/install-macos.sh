#!/usr/bin/env bash
set -euo pipefail

release_version="0.1.5"
dsh_version="0.1.0-rc.7"
profile="web"
port="${COREMATE_INSTALL_PORT_OVERRIDE:-3080}"
package_name="dsh-coremate-mobile"
github_repository="Core-Mate/OpenGUI"
github_release_base="https://github.com/${github_repository}/releases/download"
release_base="${COREMATE_INSTALL_RELEASE_BASE:-${github_release_base}}"
dsh_home="${DSH_HOME:-${HOME}/.dsh}"
start_runtime=true
open_browser=true

usage() {
  printf '%s\n' 'Usage: install-macos.sh [--dsh-home PATH] [--release-base URL] [--no-start] [--no-open]'
}

while (($# > 0)); do
  case "$1" in
    --dsh-home)
      [[ $# -ge 2 ]] || { usage >&2; exit 2; }
      dsh_home="$2"
      shift 2
      ;;
    --release-base)
      [[ $# -ge 2 ]] || { usage >&2; exit 2; }
      release_base="$2"
      shift 2
      ;;
    --no-start)
      start_runtime=false
      shift
      ;;
    --no-open)
      open_browser=false
      shift
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

platform="${COREMATE_INSTALL_PLATFORM_OVERRIDE:-$(uname -s)}"
if [[ "$platform" != "Darwin" ]]; then
  printf 'OpenGUI v%s installer supports macOS only; detected %s.\n' "$release_version" "$platform" >&2
  exit 1
fi

for command in node curl shasum lsof; do
  command -v "$command" >/dev/null 2>&1 || { printf 'Required command not found: %s\n' "$command" >&2; exit 1; }
done

if command -v dsh >/dev/null 2>&1; then
  dsh_command=(dsh)
elif command -v pnpm >/dev/null 2>&1; then
  dsh_command=(pnpm dlx "@deepseek-ai/dsh@${dsh_version}")
elif command -v corepack >/dev/null 2>&1; then
  dsh_command=(corepack pnpm dlx "@deepseek-ai/dsh@${dsh_version}")
elif command -v npx >/dev/null 2>&1; then
  dsh_command=(npx -y "@deepseek-ai/dsh@${dsh_version}")
else
  printf 'No DSH launcher found. Install dsh, pnpm, corepack, or npx first.\n' >&2
  exit 1
fi

node_version="${COREMATE_INSTALL_NODE_VERSION_OVERRIDE:-$(node -p 'process.versions.node')}"
IFS=. read -r node_major node_minor _ <<<"$node_version"
if ! [[ "$node_major" =~ ^[0-9]+$ && "$node_minor" =~ ^[0-9]+$ ]]; then
  printf 'Could not parse Node.js version: %s\n' "$node_version" >&2
  exit 1
fi
if ((node_major < 22 || node_major == 22 && node_minor < 19 || node_major == 23)); then
  printf 'OpenGUI requires Node.js 22.19+ or 24+; detected %s.\n' "$node_version" >&2
  exit 1
fi

installed_dsh="$("${dsh_command[@]}" -V)"
if [[ "$installed_dsh" != "$dsh_version" ]]; then
  printf 'Expected DSH %s but resolved %s.\n' "$dsh_version" "$installed_dsh" >&2
  exit 1
fi

runtime_running=false
if lsof -nP -iTCP:"$port" -sTCP:LISTEN >/dev/null 2>&1; then
  page="$(curl -fsS --max-time 3 "http://127.0.0.1:${port}" || true)"
  if [[ "$page" != *"__DSH_BOOT__"* ]]; then
    printf 'Port %s is already in use by a process that is not DSH; leaving it untouched.\n' "$port" >&2
    exit 1
  fi
  runtime_running=true
fi

archive_name="${package_name}-${release_version}.tgz"
checksum_name="${archive_name}.sha256"
release_tag="${package_name}-v${release_version}"
release_url="${release_base%/}/${release_tag}"
temporary="$(mktemp -d "${TMPDIR:-/tmp}/opengui-coremate-install.XXXXXX")"
trap 'rm -rf "$temporary"' EXIT

download() {
  local url="$1"
  local output="$2"
  local args=(-fL --retry 3 --connect-timeout 15 --max-time 300 --output "$output")
  if [[ "$url" == https://* ]]; then args+=(--proto '=https' --tlsv1.2); fi
  curl "${args[@]}" "$url"
}

printf 'Downloading OpenGUI v%s...\n' "$release_version"
if ! download "${release_url}/${archive_name}" "${temporary}/${archive_name}" \
  || ! download "${release_url}/${checksum_name}" "${temporary}/${checksum_name}"; then
  printf 'Release download failed. Check network access and confirm that v%s is published.\n' "$release_version" >&2
  exit 1
fi

checksum_line="$(tr -d '\r' < "${temporary}/${checksum_name}")"
if [[ ! "$checksum_line" =~ ^([0-9a-fA-F]{64})[[:space:]]+\*?${archive_name}$ ]]; then
  printf 'Release checksum file has an unexpected format.\n' >&2
  exit 1
fi
expected_checksum="$(printf '%s' "${BASH_REMATCH[1]}" | tr '[:upper:]' '[:lower:]')"
actual_checksum="$(shasum -a 256 "${temporary}/${archive_name}" | awk '{print $1}')"
if [[ "$actual_checksum" != "$expected_checksum" ]]; then
  printf 'Release checksum mismatch: expected %s, received %s.\n' "$expected_checksum" "$actual_checksum" >&2
  exit 1
fi

cache_dir="${dsh_home}/cache/coremate-mobile/releases/v${release_version}"
mkdir -p "$cache_dir"
cached_archive="${cache_dir}/${archive_name}"
install -m 0644 "${temporary}/${archive_name}" "$cached_archive"

profile_dir="${dsh_home}/profiles/${profile}"
if [[ -f "${profile_dir}/package.json" ]]; then
  printf 'Preserving existing DSH profile: %s\n' "$profile_dir"
else
  printf 'Initializing DSH profile: %s\n' "$profile_dir"
fi

DSH_HOME="$dsh_home" "${dsh_command[@]}" plugin --profile "$profile" add --save-exact "$cached_archive"

DSH_HOME="$dsh_home" node --input-type=module - "$profile_dir" "$package_name" "$release_version" <<'NODE'
import { readFile, stat } from 'node:fs/promises'
import { join } from 'node:path'

const [profileDir, packageName, version] = process.argv.slice(2)
const profile = JSON.parse(await readFile(join(profileDir, 'package.json'), 'utf8'))
if (typeof profile.dependencies?.[packageName] !== 'string') throw new Error('installed dependency is missing')
if (!profile.dsh?.profile?.bundles?.includes(packageName)) throw new Error('DSH bundle entry is missing')
const installed = JSON.parse(await readFile(join(profileDir, 'node_modules', packageName, 'package.json'), 'utf8'))
if (installed.version !== version) throw new Error(`installed version mismatch: ${installed.version}`)
for (const path of ['lib/index.js', 'lib/client.js', 'lib/types/client/index.d.ts']) {
  if (!(await stat(join(profileDir, 'node_modules', packageName, path))).isFile()) throw new Error(`missing ${path}`)
}
const host = await readFile(join(profileDir, 'node_modules', packageName, 'lib/index.js'), 'utf8')
if (!host.includes('opengui')) throw new Error('/opengui command implementation is missing')
NODE

printf 'Installed and verified %s v%s in %s.\n' "$package_name" "$release_version" "$profile_dir"

if [[ "$runtime_running" == true ]]; then
  printf 'DSH is already running at http://127.0.0.1:%s. It was not restarted; restart it manually to load v%s.\n' "$port" "$release_version"
elif [[ "$start_runtime" == true ]]; then
  command -v launchctl >/dev/null 2>&1 || { printf 'Required command not found: launchctl\n' >&2; exit 1; }
  mkdir -p "${dsh_home}/logs"
  log_path="${dsh_home}/logs/opengui-coremate-web.log"
  dsh_command[0]="$(command -v "${dsh_command[0]}")"
  job_label="com.coremate.opengui.web.${UID}.$$"
  launchctl submit -l "$job_label" -o "$log_path" -e "$log_path" -- \
    /usr/bin/env "PATH=${PATH}" "DSH_HOME=${dsh_home}" \
    "${dsh_command[@]}" --profile "$profile" --host 127.0.0.1 --port "$port" --no-open
  printf '%s\n' "$job_label" > "${dsh_home}/logs/opengui-coremate-web.job"
  ready=false
  for _ in {1..60}; do
    if curl -fsS --max-time 2 "http://127.0.0.1:${port}" | grep -q '__DSH_BOOT__'; then
      ready=true
      break
    fi
    sleep 1
  done
  if [[ "$ready" != true ]]; then
    launchctl remove "$job_label" >/dev/null 2>&1 || true
    printf 'DSH did not become ready; inspect %s.\n' "$log_path" >&2
    exit 1
  fi
  sleep 1
  runtime_pid="$(lsof -nP -t -iTCP:"$port" -sTCP:LISTEN | head -n 1)"
  if [[ -z "$runtime_pid" ]] || ! curl -fsS --max-time 2 "http://127.0.0.1:${port}" | grep -q '__DSH_BOOT__'; then
    launchctl remove "$job_label" >/dev/null 2>&1 || true
    printf 'DSH exited after startup; inspect %s.\n' "$log_path" >&2
    exit 1
  fi
  printf 'DSH is ready at http://127.0.0.1:%s (PID %s).\n' "$port" "$runtime_pid"
else
  printf 'DSH was not running and --no-start was selected.\n'
fi

if [[ "$open_browser" == true && ( "$runtime_running" == true || "$start_runtime" == true ) ]]; then
  open "http://127.0.0.1:${port}"
fi
