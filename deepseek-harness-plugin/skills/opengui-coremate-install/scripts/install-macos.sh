#!/usr/bin/env bash
set -euo pipefail

profile="web"
port="${COREMATE_INSTALL_PORT_OVERRIDE:-3080}"
package_name="dsh-coremate-mobile"
github_repository="Core-Mate/OpenGUI"
release_version="${COREMATE_INSTALL_VERSION_OVERRIDE:-}"
github_release_base="https://github.com/${github_repository}/releases/download"
github_releases_api="${COREMATE_INSTALL_RELEASES_API_OVERRIDE:-https://api.github.com/repos/${github_repository}/releases?per_page=100}"
release_base="${COREMATE_INSTALL_RELEASE_BASE:-${github_release_base}}"
dsh_home="${DSH_HOME:-${HOME}/.dsh}"
launch_agents_dir="${COREMATE_INSTALL_LAUNCH_AGENTS_DIR_OVERRIDE:-${HOME}/Library/LaunchAgents}"
start_runtime=true
open_browser=true
requested_dsh_version=""
dsh_version_explicit=false

usage() {
  printf '%s\n' 'Usage: install-macos.sh [--version VERSION] [--dsh-version VERSION] [--dsh-home PATH] [--release-base URL] [--no-start] [--no-open]'
}

while (($# > 0)); do
  case "$1" in
    --version)
      [[ $# -ge 2 ]] || { usage >&2; exit 2; }
      release_version="$2"
      shift 2
      ;;
    --dsh-version)
      [[ $# -ge 2 ]] || { usage >&2; exit 2; }
      requested_dsh_version="$2"
      dsh_version_explicit=true
      shift 2
      ;;
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
  printf 'The OpenGUI installer supports macOS only; detected %s.\n' "$platform" >&2
  exit 1
fi

for command in node curl shasum lsof; do
  command -v "$command" >/dev/null 2>&1 || { printf 'Required command not found: %s\n' "$command" >&2; exit 1; }
done

script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd -P)"
compatibility_manifest="$(cd "${script_dir}/.." && pwd -P)/dsh-compatibility.json"
if [[ ! -f "$compatibility_manifest" ]]; then
  printf 'DSH compatibility manifest not found: %s\n' "$compatibility_manifest" >&2
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
  printf 'DSH compatibility manifest is invalid. Reinstall OpenGUI from a verified release.\n' >&2
  exit 1
fi
IFS=$'\t' read -r preferred_dsh_version supported_dsh_versions fallback_dsh_versions <<<"$compatibility_values"
dsh_version="${requested_dsh_version:-$preferred_dsh_version}"

is_supported_dsh_version() {
  case " ${supported_dsh_versions} " in
    *" $1 "*) return 0 ;;
    *) return 1 ;;
  esac
}

supported_dsh_label="${supported_dsh_versions// /, }"
if ! is_supported_dsh_version "$dsh_version"; then
  printf 'Unsupported DSH version %s. Supported versions: %s.\n' "$dsh_version" "$supported_dsh_label" >&2
  exit 1
fi

credentials_file="${dsh_home}/.credentials.yaml"
if [[ ( "$dsh_version" == "0.1.0-rc.7" || "$dsh_version" == "0.1.0-rc.8" ) && -f "$credentials_file" ]]; then
  if node --input-type=module - "$credentials_file" <<'NODE'
import { readFileSync } from 'node:fs'

const text = readFileSync(process.argv[2], 'utf8')
process.exit(/^version\s*:\s*1(?:\s*(?:#.*)?)?$/mu.test(text) ? 0 : 1)
NODE
  then
    printf 'DSH %s cannot read the versioned credential store written by DSH 0.1.1 release candidates. No files were changed. Choose DSH 0.1.1-rc.1 or 0.1.1-rc.2, or use a separate --dsh-home for the older DSH version.\n' "$dsh_version" >&2
    exit 1
  fi
fi

detected_dsh_version=""
if command -v dsh >/dev/null 2>&1; then
  detected_dsh_version="$(dsh -V 2>/dev/null || true)"
fi
managed_dsh_dir="${dsh_home}/runtime/dsh-${dsh_version}"
managed_dsh="${managed_dsh_dir}/node_modules/.bin/dsh"
managed_dsh_version=""
if [[ -x "$managed_dsh" ]]; then
  managed_dsh_version="$("$managed_dsh" -V 2>/dev/null || true)"
fi
dsh_command=()
dsh_installer=()

if [[ "$detected_dsh_version" == "$dsh_version" ]]; then
  dsh_command=(dsh)
elif [[ "$managed_dsh_version" == "$dsh_version" ]]; then
  dsh_command=("$managed_dsh")
elif command -v pnpm >/dev/null 2>&1; then
  dsh_installer=(pnpm --dir "$managed_dsh_dir" add --save-exact "@deepseek-ai/dsh@${dsh_version}")
elif command -v corepack >/dev/null 2>&1; then
  dsh_installer=(corepack pnpm --dir "$managed_dsh_dir" add --save-exact "@deepseek-ai/dsh@${dsh_version}")
elif command -v npm >/dev/null 2>&1; then
  dsh_installer=(npm install --prefix "$managed_dsh_dir" --no-audit --no-fund --save-exact "@deepseek-ai/dsh@${dsh_version}")
fi

if [[ -n "$detected_dsh_version" && "$detected_dsh_version" != "$dsh_version" ]]; then
  if is_supported_dsh_version "$detected_dsh_version"; then
    printf 'Detected supported DSH %s on PATH. OpenGUI defaults to DSH %s, so this installer will use the preferred managed version. Use --dsh-version %s to select the existing version explicitly. Existing workspaces, settings, credentials, and phone authorizations are preserved.\n' "$detected_dsh_version" "$dsh_version" "$detected_dsh_version"
  else
    printf 'Detected unsupported DSH %s on PATH. OpenGUI will use verified DSH %s for the web profile. Existing workspaces, settings, credentials, and phone authorizations are preserved.\n' "$detected_dsh_version" "$dsh_version"
  fi
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

select_managed_fallback() {
  local candidate candidate_dir candidate_dsh candidate_version
  for candidate in $fallback_dsh_versions; do
    [[ "$candidate" == "$dsh_version" ]] && continue
    candidate_dir="${dsh_home}/runtime/dsh-${candidate}"
    candidate_dsh="${candidate_dir}/node_modules/.bin/dsh"
    [[ -x "$candidate_dsh" ]] || continue
    candidate_version="$("$candidate_dsh" -V 2>/dev/null || true)"
    [[ "$candidate_version" == "$candidate" ]] || continue
    dsh_version="$candidate"
    managed_dsh_dir="$candidate_dir"
    managed_dsh="$candidate_dsh"
    managed_dsh_version="$candidate_version"
    dsh_command=("$managed_dsh")
    printf 'Preferred DSH could not be installed; using existing verified managed DSH %s.\n' "$dsh_version"
    return 0
  done
  return 1
}

prepare_managed_runtime() {
  local package_manifest="${managed_dsh_dir}/package.json"
  local workspace_manifest="${managed_dsh_dir}/pnpm-workspace.yaml"
  mkdir -p "$managed_dsh_dir"
  node --input-type=module - "$package_manifest" "$workspace_manifest" <<'NODE'
import { existsSync, readFileSync, writeFileSync } from 'node:fs'

const packagePath = process.argv[2]
const workspacePath = process.argv[3]
const value = existsSync(packagePath) ? JSON.parse(readFileSync(packagePath, 'utf8')) : {}
writeFileSync(packagePath, `${JSON.stringify(value, null, 2)}\n`)
writeFileSync(workspacePath, `packages: []
allowBuilds:
  node-pty: true
  koffi: true
  '@deepseek-ai/dsh-subprocess-local': true
  '@google/genai': false
  protobufjs: false
  node-addon-require-builtin: false
`)
NODE
}

if ((${#dsh_command[@]} == 0)) && ((${#dsh_installer[@]} > 0)); then
  printf 'Installing managed DSH %s in %s.\n' "$dsh_version" "$managed_dsh_dir"
  prepare_managed_runtime
  if "${dsh_installer[@]}" && [[ -x "$managed_dsh" ]] && [[ "$("$managed_dsh" -V 2>/dev/null || true)" == "$dsh_version" ]]; then
    dsh_command=("$managed_dsh")
  elif [[ "$dsh_version_explicit" == false ]] && select_managed_fallback; then
    :
  else
    printf 'Managed DSH %s could not be installed at %s.\n' "$dsh_version" "$managed_dsh" >&2
    exit 1
  fi
fi

if ((${#dsh_command[@]} == 0)); then
  if [[ "$dsh_version_explicit" == false ]] && select_managed_fallback; then
    :
  elif [[ -n "$detected_dsh_version" ]]; then
    printf 'The DSH on PATH is %s, but OpenGUI selected DSH %s. Install pnpm, corepack, or npm so the installer can add the selected managed runtime without replacing your existing DSH.\n' "$detected_dsh_version" "$dsh_version" >&2
    exit 1
  else
    printf 'No selected DSH launcher found. Install dsh, pnpm, corepack, or npm first.\n' >&2
    exit 1
  fi
fi

installed_dsh="$("${dsh_command[@]}" -V)"
if [[ "$installed_dsh" != "$dsh_version" ]]; then
  printf 'Expected DSH %s but resolved %s.\n' "$dsh_version" "$installed_dsh" >&2
  exit 1
fi

temporary="$(mktemp -d "${TMPDIR:-/tmp}/opengui-coremate-install.XXXXXX")"
stale_plugin_modules=""
stale_plugin_modules_backup=""
installation_completed=false
cleanup() {
  local preserve_temporary=false
  if [[ "$installation_completed" != true && -n "$stale_plugin_modules_backup" && -d "$stale_plugin_modules_backup" ]]; then
    if [[ ! -e "$stale_plugin_modules" ]] && mv "$stale_plugin_modules_backup" "$stale_plugin_modules"; then
      printf 'Restored the previous plugin dependency directory after installation failed.\n' >&2
    else
      preserve_temporary=true
      printf 'Could not restore the previous plugin dependency directory; recovery data remains at %s.\n' "$temporary" >&2
    fi
  fi
  if [[ "$preserve_temporary" != true ]]; then rm -rf "$temporary"; fi
}
trap cleanup EXIT

quarantine_stale_plugin_modules() {
  local candidate="${profile_dir}/node_modules/${package_name}/node_modules"
  [[ -f "${candidate}/.modules.yaml" && -d "${candidate}/.pnpm" ]] || return 0
  stale_plugin_modules="$candidate"
  stale_plugin_modules_backup="${temporary}/stale-plugin-node-modules"
  mv "$stale_plugin_modules" "$stale_plugin_modules_backup"
  printf 'Quarantined a stale plugin dependency directory from an older installation.\n'
}

if [[ -z "$release_version" ]]; then
  printf 'Resolving the latest stable OpenGUI plugin release...\n'
  api_args=(-fsSL --retry 3 --connect-timeout 15 --max-time 60
    -H 'Accept: application/vnd.github+json'
    -H 'X-GitHub-Api-Version: 2022-11-28')
  if [[ "$github_releases_api" == https://* ]]; then api_args+=(--proto '=https' --tlsv1.2); fi
  releases_directory="${temporary}/releases"
  mkdir -p "$releases_directory"
  releases_url="$github_releases_api"
  releases_page=1
  while [[ -n "$releases_url" ]]; do
    page_body="${releases_directory}/${releases_page}.json"
    page_headers="${releases_directory}/${releases_page}.headers"
    if ! curl "${api_args[@]}" --dump-header "$page_headers" --output "$page_body" "$releases_url"; then
      printf 'Could not read OpenGUI plugin releases from GitHub. Check GitHub access or retry with --version VERSION.\n' >&2
      exit 1
    fi
    if ! node -e '
      const releases = JSON.parse(require("node:fs").readFileSync(process.argv[1], "utf8"))
      if (!Array.isArray(releases)) throw new Error("GitHub Releases response is not an array")
    ' "$page_body"; then
      printf 'GitHub returned an invalid Releases response. Retry with --version VERSION.\n' >&2
      exit 1
    fi
    releases_url="$(node -e '
      const headers = require("node:fs").readFileSync(process.argv[1], "utf8")
      const link = headers.split(/\r?\n/u).find(line => /^link:/iu.test(line)) ?? ""
      const next = link.replace(/^link:\s*/iu, "").split(",").map(value => value.trim())
        .map(value => value.match(/^<([^>]+)>;\s*rel="([^"]+)"$/u))
        .find(match => match?.[2]?.split(/\s+/u).includes("next"))
      if (next) process.stdout.write(next[1])
    ' "$page_headers")"
    releases_page=$((releases_page + 1))
  done

  if ! release_version="$(
    node --input-type=module -e '
        import { readFileSync, readdirSync } from "node:fs"
        const packageName = process.argv[1]
        const directory = process.argv[2]
        const releases = readdirSync(directory)
          .filter(name => name.endsWith(".json"))
          .flatMap(name => JSON.parse(readFileSync(`${directory}/${name}`, "utf8")))
        const pattern = new RegExp(`^${packageName}-v(\\d+)\\.(\\d+)\\.(\\d+)$`)
        const versions = releases.flatMap(release => {
          if (release?.draft || release?.prerelease || typeof release?.tag_name !== "string") return []
          const match = release.tag_name.match(pattern)
          return match ? [{ version: match.slice(1).join("."), parts: match.slice(1).map(Number) }] : []
        })
        versions.sort((left, right) => {
          for (let index = 0; index < 3; index += 1) {
            if (left.parts[index] !== right.parts[index]) return right.parts[index] - left.parts[index]
          }
          return 0
        })
        if (versions.length === 0) throw new Error(`No stable ${packageName} release was found`)
        process.stdout.write(versions[0].version)
      ' "$package_name" "$releases_directory"
  )"; then
    printf 'Could not resolve the latest stable OpenGUI plugin release. Check GitHub access or retry with --version VERSION.\n' >&2
    exit 1
  fi
fi

if [[ ! "$release_version" =~ ^[0-9]+\.[0-9]+\.[0-9]+$ ]]; then
  printf 'Invalid OpenGUI plugin version: %s. Expected a stable version such as 0.1.13.\n' "$release_version" >&2
  exit 1
fi
printf 'Using OpenGUI plugin v%s.\n' "$release_version"

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

if ! DSH_HOME="$dsh_home" "${dsh_command[@]}" plugin --profile "$profile" --help >/dev/null; then
  printf 'Could not initialize the DSH profile package manager. Existing profile data was preserved.\n' >&2
  exit 1
fi
profile_workspace="${profile_dir}/pnpm-workspace.yaml"
node --input-type=module - "$profile_workspace" <<'NODE'
import { readFileSync, writeFileSync } from 'node:fs'

const path = process.argv[2]
let lines = readFileSync(path, 'utf8').split('\n')

function ensureListValue(key, value) {
  const keyIndex = lines.findIndex(line => line.startsWith(`${key}:`))
  if (keyIndex === -1) {
    if (lines.at(-1) !== '') lines.push('')
    lines.push(`${key}:`, `  - '${value}'`)
    return
  }
  if (lines[keyIndex].trim() !== `${key}:`) {
    if (lines[keyIndex].trim() === `${key}: []`) {
      lines.splice(keyIndex, 1, `${key}:`, `  - '${value}'`)
      return
    }
    throw new Error(`${key} must use block-list syntax`)
  }
  let end = keyIndex + 1
  while (end < lines.length && (lines[end].trim() === '' || /^\s/u.test(lines[end]))) end += 1
  const existing = lines.slice(keyIndex + 1, end)
    .map(line => line.match(/^\s*-\s*['"]?([^'"]+)['"]?\s*$/u)?.[1])
    .filter(Boolean)
  if (!existing.includes(value)) lines.splice(end, 0, `  - '${value}'`)
}

function ensureMapValue(key, name, value) {
  const keyIndex = lines.findIndex(line => line.startsWith(`${key}:`))
  if (keyIndex === -1) {
    if (lines.at(-1) !== '') lines.push('')
    lines.push(`${key}:`, `  '${name}': ${value}`)
    return
  }
  if (lines[keyIndex].trim() !== `${key}:`) {
    if (lines[keyIndex].trim() === `${key}: {}`) {
      lines.splice(keyIndex, 1, `${key}:`, `  '${name}': ${value}`)
      return
    }
    throw new Error(`${key} must use block-map syntax`)
  }
  let end = keyIndex + 1
  while (end < lines.length && (lines[end].trim() === '' || /^\s/u.test(lines[end]))) end += 1
  for (let index = keyIndex + 1; index < end; index += 1) {
    const match = lines[index].match(/^\s+['"]?([^'"]+)['"]?:\s*(.+)$/u)
    if (match?.[1] !== name) continue
    if (match[2] !== String(value)) lines[index] = `  '${name}': ${value}`
    return
  }
  lines.splice(end, 0, `  '${name}': ${value}`)
}

ensureListValue('onlyBuiltDependencies', 'dsh-coremate-mobile')
// DSH classifies these dependency scripts as no-ops. Older bundled pnpm
// releases only support allowlisting them rather than marking them ignored.
ensureListValue('onlyBuiltDependencies', '@google/genai')
ensureListValue('onlyBuiltDependencies', 'protobufjs')
ensureMapValue('allowBuilds', '@google/genai', false)
ensureMapValue('allowBuilds', 'protobufjs', false)
writeFileSync(path, `${lines.join('\n').replace(/\n+$/u, '')}\n`)
NODE

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

canonical_dsh_home="$(cd "$dsh_home" && pwd -P)"
default_dsh_home="$(cd "$HOME" && pwd -P)/.dsh"
job_label="com.coremate.opengui.web"
if [[ "$canonical_dsh_home" != "$default_dsh_home" || "$port" != "3080" ]]; then
  label_hash="$(printf '%s\n%s\n' "$canonical_dsh_home" "$port" | shasum -a 256 | awk '{print substr($1,1,12)}')"
  job_label="${job_label}.${label_hash}"
fi
plist_path="${launch_agents_dir}/${job_label}.plist"
service_target="gui/${UID}/${job_label}"

if [[ "$start_runtime" == true ]]; then
  command -v launchctl >/dev/null 2>&1 || { printf 'Required command not found: launchctl\n' >&2; exit 1; }
  command -v plutil >/dev/null 2>&1 || { printf 'Required command not found: plutil\n' >&2; exit 1; }
  mkdir -p "${dsh_home}/logs"
  mkdir -p "$launch_agents_dir"
  log_path="${dsh_home}/logs/opengui-coremate-web.log"
  if [[ "${dsh_command[0]}" == "$managed_dsh" ]]; then
    dsh_command[0]="${canonical_dsh_home}/runtime/dsh-${dsh_version}/node_modules/.bin/dsh"
  else
    dsh_command[0]="$(command -v "${dsh_command[0]}")"
  fi
  plist_temporary="${temporary}/${job_label}.plist"
  node --input-type=module - "$plist_temporary" "$job_label" "$log_path" "$canonical_dsh_home" "$PATH" \
    "${dsh_command[@]}" --profile "$profile" --host 127.0.0.1 --port "$port" --no-open <<'NODE'
import { chmod, writeFile } from 'node:fs/promises'

const [output, label, logPath, workingDirectory, path, ...args] = process.argv.slice(2)
const escape = value => value.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;').replaceAll("'", '&apos;')
const strings = args.map(value => `    <string>${escape(value)}</string>`).join('\n')
const plist = `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key>
  <string>${escape(label)}</string>
  <key>ProgramArguments</key>
  <array>
${strings}
  </array>
  <key>WorkingDirectory</key>
  <string>${escape(workingDirectory)}</string>
  <key>EnvironmentVariables</key>
  <dict>
    <key>DSH_HOME</key>
    <string>${escape(workingDirectory)}</string>
    <key>PATH</key>
    <string>${escape(path)}</string>
  </dict>
  <key>RunAtLoad</key>
  <true/>
  <key>KeepAlive</key>
  <true/>
  <key>ThrottleInterval</key>
  <integer>10</integer>
  <key>ProcessType</key>
  <string>Interactive</string>
  <key>StandardOutPath</key>
  <string>${escape(logPath)}</string>
  <key>StandardErrorPath</key>
  <string>${escape(logPath)}</string>
</dict>
</plist>
`
await writeFile(output, plist, { encoding: 'utf8', mode: 0o600 })
await chmod(output, 0o600)
NODE
  plutil -lint "$plist_temporary" >/dev/null

  managed_runtime=false
  if launchctl print "$service_target" >/dev/null 2>&1; then managed_runtime=true; fi
  if [[ "$managed_runtime" == true ]]; then
    if ! launchctl bootout "$service_target" >/dev/null 2>&1; then
      printf 'Could not stop LaunchAgent %s; the existing definition was preserved.\n' "$job_label" >&2
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
      printf 'LaunchAgent %s did not finish stopping; the existing definition was preserved.\n' "$job_label" >&2
      exit 1
    fi
    runtime_running=false
  fi
  if [[ "$runtime_running" != true ]]; then quarantine_stale_plugin_modules; fi
  install -m 0600 "$plist_temporary" "$plist_path"
  printf '%s\n' "$job_label" > "${dsh_home}/logs/opengui-coremate-web.job"

  if [[ "$runtime_running" == true ]]; then
    printf 'DSH is already running at http://127.0.0.1:%s and is not managed by OpenGUI; leaving it untouched. Quit that DSH process and rerun this installer to activate the compatible version now. The LaunchAgent can also take over after the next login.\n' "$port"
  else
    launchctl bootstrap "gui/${UID}" "$plist_path"
    launchctl kickstart -k "$service_target"
    ready=false
    for _ in {1..60}; do
      if curl -fsS --max-time 2 "http://127.0.0.1:${port}" | grep -q '__DSH_BOOT__'; then
        ready=true
        break
      fi
      sleep 1
    done
    if [[ "$ready" != true ]]; then
      launchctl bootout "$service_target" >/dev/null 2>&1 || true
      printf 'DSH did not become ready; inspect %s.\n' "$log_path" >&2
      exit 1
    fi
    sleep 1
    runtime_pid="$(lsof -nP -t -iTCP:"$port" -sTCP:LISTEN | head -n 1)"
    if [[ -z "$runtime_pid" ]] || ! curl -fsS --max-time 2 "http://127.0.0.1:${port}" | grep -q '__DSH_BOOT__'; then
      launchctl bootout "$service_target" >/dev/null 2>&1 || true
      printf 'DSH exited after startup; inspect %s.\n' "$log_path" >&2
      exit 1
    fi
    printf 'DSH is ready at http://127.0.0.1:%s (PID %s, LaunchAgent %s).\n' "$port" "$runtime_pid" "$job_label"
  fi
else
  if [[ "$runtime_running" != true ]]; then
    if ! command -v launchctl >/dev/null 2>&1 || ! launchctl print "$service_target" >/dev/null 2>&1; then
      quarantine_stale_plugin_modules
    fi
  fi
  if [[ "$runtime_running" == true ]]; then
    printf 'DSH is already running at http://127.0.0.1:%s. It was not restarted. Quit that DSH process, then rerun this installer without --no-start to load OpenGUI v%s with the compatible DSH version.\n' "$port" "$release_version"
  else
    printf 'DSH was not running and --no-start was selected.\n'
  fi
fi

installation_completed=true

if [[ "$open_browser" == true && ( "$runtime_running" == true || "$start_runtime" == true ) ]]; then
  open "http://127.0.0.1:${port}"
fi
