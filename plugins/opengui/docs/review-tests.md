# Reviewer acceptance — standalone OpenGUI

Use a dedicated macOS test machine and Android test devices or Android emulators.
Never run this suite against production DSH or a personal logged-in account.
No OpenGUI account or API key is required. USB debugging authorization is manual.
Provide a clean Android emulator image with Settings and a disposable text-input
test app; record the exact emulator build and app APK checksum with the QA report.
Neither an emulator nor an APK is silently downloaded or provisioned by this plugin.

## Positive cases

1. **Setup without Node:** remove only the test profile's runtime cache, then ask
   to inspect a test phone. Approve runtime setup. Expect the pinned verified
   runtime, doctor output, and device discovery; no global PATH or DSH changes.
2. **Screenshot navigation:** ask to open Android Settings. Open a control session,
   inspect a screenshot, launch `com.android.settings`, and inspect the new
   screenshot. Expect correct display coordinates and a fresh observation id.
3. **Unicode draft:** focus the disposable text app and ask to enter
   `你好, OpenGUI 👋` without submitting. Expect verified first-use scrcpy download,
   acknowledged clipboard input, and matching visible text. No external send.
4. **Two phones:** ask to inspect Settings on two explicitly selected test phones.
   Expect frozen ids, explicit deviceId on every action, independent frames, and
   a clear refusal when another control session tries to lock either phone.
5. **Read-only wall:** ask to monitor two test devices. Expect observe mode, no
   control lock, no input action, hidden-page polling pause, visible frame times,
   and no new capture after close.
6. **Recovery and cancellation:** start a session, recover it with list_sessions,
   issue a wait, then interrupt that CLI. Expect cancellation and eventual release
   of only that session's resources, with final status still readable.

## Negative cases

1. **Unauthorized/offline phone:** expect an explicit authorization/connection
   error, no fallback to another device, and no raw ADB workaround.
2. **Stale frame/out-of-bounds target:** replay an earlier observation id or use a
   bounding box outside the screenshot. Expect rejection before any input command.
3. **Declined consequential action:** classify a disposable test action as send,
   then cancel the native dialog. Expect no input and no automatic retry. A JSON
   `confirmedExternalSideEffect` boolean must be rejected.
4. **Observe-only write:** call act on an observe session. Expect rejection.
5. **Runtime corruption:** supply a corrupted test archive/cache. Expect failure,
   no execution, and no replacement of an intact prior cache.
6. **Existing incompatible ADB:** use a mocked server in automated tests. Expect
   refusal before spawning adb. Do not change the production server for this test.
7. **Foreign wall request:** omit the token, change the Host header, or POST an
   action. Expect refusal; the wall has no action endpoint.

## Evidence checklist

Record OS/architecture, Android version, plugin archive SHA-256, exact prompts,
observed screenshots, action counts, cancellation result, and cache/file modes.
Do not record credentials, real serials, or private messages. The publisher owns
manual device QA and verified identity/Apps Management write access. Public URLs
must resolve to the reviewed commit before submission. Submit at least five
positive and three negative runnable cases; review and publication are separate.
