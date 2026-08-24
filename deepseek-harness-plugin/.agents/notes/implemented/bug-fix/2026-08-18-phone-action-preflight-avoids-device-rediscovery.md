# Agent Note: Phone action preflight avoids device rediscovery

Status: implemented

English | [中文](2026-08-18-phone-action-preflight-avoids-device-rediscovery.zh.md)

## Problem

Every `phone_control` call ran `adb devices -l`, including calls after the child had locked a serial. The fourth identical no-progress action checked its repetition fuse only after that discovery command, so an action documented to fail before ADB still accessed the device service. Explicit observe or wait results that changed the screenshot also left the old repetition count stored. Unit tests covered the state helpers but did not boot the plugin through the Loader or prove registry disposal.

## Decision

The first observation discovers and locks one authorized serial. Every later action uses that serial directly with `-s`; a disconnected or unauthorized target fails its addressed ADB command and the task never selects another phone. Mutation validation builds the allowlisted command and checks the repetition fuse before resolving the cached serial or invoking ADB. Publishing any observation whose screenshot fingerprint differs from the preceding observation clears the repetition state.

Observation identifiers use the package-owned `ObservationId` brand after tool-input validation and generation. A keyless subprocess fixture loads the real bundle patch through the Harness app boot and Loader, snapshots the model-visible provider and tool protocol, disposes the plugin fiber, and verifies that its routes and tools disappear. The fixture copies writable Loader configuration into its isolated temporary directory before testing disposal.

## Alternatives considered

**Re-enumerate devices before every action.** This preserved a custom disconnect diagnostic, but paid an extra ADB process for every action and let the preflight fuse touch ADB. Addressed commands already report disconnect and authorization failures without allowing device switching.

**Keep no-progress clearing only in mutation completion.** This missed changed frames produced by explicit observe and wait calls, allowing a stale count to become active if a later frame matched the older fingerprint.

**Retain helper-only tests.** Pure tests are fast but cannot prove Loader patch composition, model-visible schemas, or Cordis fiber disposal.

## Consequences

Every action after initial discovery removes one `adb devices -l` process from the critical path, and the fourth identical unchanged mutation fails before any ADB process. Disconnect errors now come from the fixed-serial ADB operation instead of a preceding custom enumeration diagnostic. Changed observations reset the repetition fuse regardless of how the observation was requested.

The Loader smoke adds test-only app-boot, local settings and attachment providers, and their subprocess harness. It does not contact a phone or model endpoint; real-device latency and endpoint compatibility remain deployment smoke responsibilities.
