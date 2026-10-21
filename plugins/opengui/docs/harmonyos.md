# HarmonyOS screenshot driver

The standalone Codex plugin can use a local HDC + UiTest driver instead of ADB.
This scope is limited to `plugins/opengui`; it does not port WorkBuddy, DSH,
the Android client, or the backend to HarmonyOS.

## Requirements and source build

- macOS arm64/x64 and Node.js 22.19 or newer.
- A locally installed DevEco Studio/HDC SDK and an authorized USB-debugging phone.
- Native HarmonyOS API 17 or newer with UiTest. Historical physical-device
  coverage is API 24; API 17 has mocked coverage and is not a physical-device claim.

From the plugin directory:

```sh
pnpm install --frozen-lockfile --ignore-scripts
pnpm check
export OPENGUI_PLATFORM=harmonyos
# For a non-standard SDK location:
# export OPENGUI_HDC_PATH=/absolute/path/to/sdk/toolchains/hdc
node lib/cli.js --doctor
node lib/cli.js opengui_list_devices '{}'
node lib/cli.js opengui_open_session '{}'
```

Keep `OPENGUI_PLATFORM=harmonyos` on every invocation and retain the host-provided
`CODEX_THREAD_ID`. Select the returned opaque device ID explicitly when more than
one phone is attached. The default platform remains Android. Unsupported platform
values fail rather than selecting another driver. Platform-specific daemon and
startup-lock paths prevent Android and HarmonyOS from connecting to the same daemon.

HDC is resolved from PATH, a standard DevEco Studio path, or the absolute
`OPENGUI_HDC_PATH`. The plugin does not distribute HDC, install a phone agent,
prepare scrcpy, or restart the system HDC service. Source functionality does not
imply that an existing published installer includes this driver.

## Screenshot workflow and supported operations

HarmonyOS opens screenshot sessions directly. It does not provide an Android
scrcpy video viewer or accept a video `viewerId`. `opengui_open_viewer` and
`--prepare-video` reject HarmonyOS explicitly. Android retains its verified
first-video-frame requirement. The HarmonyOS session's read-only device wall is
an optional screenshot preview, not a real-time-video acceptance claim.

Observe and view the returned JPEG before acting. Coordinates, target boxes and
advisory layout bounds use the returned JPEG's pixel space. Every action consumes
the latest `observationId`; failures require a fresh observation.

| Action | Mapping and limits |
| --- | --- |
| `tap` / `long_press` | UiTest click / longClick at the visible target box center |
| `swipe` | Screenshot coordinates are mapped to device pixels; duration becomes a clamped UiTest velocity |
| `text` | Requires one focused editable node; API 18+ uses focused text input and API 17 uses coordinate input |
| `key` | Back, Home and Enter; AppSwitch is explicitly unsupported |
| `launch` | Requires both `packageName` (bundle) and `abilityName` (UIAbility) |
| `wait` | Cancellable bounded wait followed by a fresh observation |

Use `--interfaces` for the exact action schema. Classify consequential actions
accurately and retain normal native one-action approval. This driver does not
add pre-authorized history deletion or a test cleanup grant.

## Advisory layouts and text results

Screenshot capture is bracketed by layout fingerprints with bounded retries.
Unstable layouts or a changed layout before coordinate/text dispatch are rejected.
The layout is advisory: hidden Flutter nodes can be reported as visible, and
fingerprints cannot detect every Canvas, animation, video, or purely visual change.
Always confirm the actual target and result in the screenshot.

`actionAssessment` distinguishes `performed`, `text_present`,
`permission_required`, and `text_unconfirmed`. `performed` is an acknowledged
command, not business success. `text_present` requires checking the complete
field value. Unicode input may overwrite the clipboard or cause a permission
prompt; never automatically grant permanent permission or blindly repeat input.

## Cleanup and validation

Close or cancel the session on completion. Runtime screenshots are removed with
the session; copy authorized evidence beforehand. Temporary device artifacts use
unique names and bounded cleanup. A disconnect or forced process termination can
leave an artifact: clean only the specific run-owned file, never other tools' files.

See [verification and limits](harmonyos-testing.md) and the
[Chinese guide](harmonyos.zh-CN.md). The implementation relies on the official
[UiTest](https://github.com/openharmony/docs/blob/master/zh-cn/application-dev/application-test/uitest-guidelines.md)
and [HDC](https://github.com/openharmony/docs/blob/master/zh-cn/application-dev/dfx/hdc.md) interfaces.

## Compact observations

Pass `--compact` before the interface name to retain focused input nodes, layout
stability, permission state and screenshot coordinates without printing the full
layout. `observationPath` points to an owner-readable JSON containing the complete
observation. Read only the fields needed and still inspect the screenshot.
Default output remains complete; results without layouts are not shortened.
See [output and evidence lifecycle](compact-observations.md).
