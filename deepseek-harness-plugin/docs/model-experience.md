# OpenGUI Model Interaction

This document describes what `dsh-coremate-mobile` exposes to the parent model, direct commands, and the phone child model, including token, screenshot-history, and KV-cache behavior. Start with the [English README](../README.md) for installation and configuration.

## Host-visible tools

### What the model sees

The parent model sees fixed `phone_agent({ task })`, `browser_agent({ task })`, `phone_control(...)`, and `browser_control(...)` schemas. The two `*_agent` tools are parent entry points; each `*_control` works only in a plugin-created child bound to its target.

### Token effect

The four fixed schemas add Host request tokens while the plugin is mounted. Delegation results add a child run id and final content only after invocation.

### KV-cache effect

The schemas form a stable part of the Host request prefix until the plugin is mounted, unmounted, or upgraded. Phone-model endpoint settings do not change these schemas.

## Direct `/opengui` command

An empty command returns usage before model routing. A non-empty command starts a restricted routing child outside the parent model. By default, an internal `coremate-inherited` adapter forwards that child to the receiving conversation's provider, model, and output-token limit without copying credentials. The routing child can call only `phone_agent` and `browser_agent`, and both control layers receive the same resolved route.

A model that declares image input is inherited without a prompt. If a writable custom model omits `input`, OpenGUI asks whether it supports image input and tool calling, patches only the current provider/model with `input: [text, image]`, and resumes the same task. An unknown non-writable route is trusted only by its exact provider/model identity. Explicit text-only metadata selects the dedicated fallback.

The dedicated setup has no introductory gate. It asks for endpoint, protocol, model ID, and credential only after the user chooses it, then writes the complete draft after a final capability confirmation. Skipping any step cancels normally with no partial configuration, model call, or device action.

Only after capability admission does the command spend a routing model request; actual control remains isolated. Control screenshots stay out of the parent model context and final command text. If a provider reports an image or tool-capability error, the task is not automatically retried because it may already have caused side effects. Exact-route trust is cleared, and a still-unchanged image declaration added by OpenGUI is withdrawn.

The control child's `phone_control` / `browser_control` calls stream live as nested activity beneath the outer delegation call, including arguments and visible tool results. Hidden reasoning, system prompts, and model configuration are not projected into the parent conversation.

## Independent browser-child requests

A browser child sees only `browser_control`. On first use, a missing pinned Chromium installation waits for Web UI approval; approval downloads, verifies, and resumes the same task. The tool allows observation, HTTP(S) navigation, clicking, Unicode insertion, selected keys, scrolling, back, reload, and bounded waits. Except for initial navigation, mutations cite the latest `observationId`; results contain URL, title, and a JPEG observation, reusing the attachment for identical frames.

The browser binary, isolated profile, process lifecycle, and control implementation are plugin-owned and do not depend on CoreMateDesktop2 or a system browser. The composer Stop button cancels consent waiting, download, child work, and the browser process.

## Independent phone-child requests

### What the model sees

Each selected phone gets an independent child model request containing the delegated task, that phone's display label, a fixed-target phone-control persona, and only the `phone_control` tool. Tool results contain observation metadata and, for a changed frame, a JPEG attachment. Both the inherited adapter and the dedicated adapter replace older phone images with a short omission marker and retain only the newest screenshot while forwarding cancellation, tool schemas, and streaming chunks.

The phone-control persona is:

```markdown
You control exactly one fixed Android phone, labeled {device label}. Never try to discover, switch, or act on another phone. Observe before the first change. For every mutation, echo the exact current observationId. Tap with a tight targetBBox and swipe with coordinates in current screenshot pixels. Perform exactly one action per phone_control call and inspect the returned observation. Use wait only when the UI is visibly loading; ordinary actions already auto-observe. Never reuse coordinates from an old observation. Stop and report any authorization, device, model, repeated-no-progress, operation-limit, or unsupported-action error.
```

### Token effect

Each child action appends text metadata to the durable session. Changed frames add one image attachment; unchanged frames reuse the preceding attachment and add metadata only. The provider-facing request carries at most the newest phone screenshot, while text and tool history continue to grow until the child finishes or reaches its operation limit.

### KV-cache effect

The phone child is an independent model request with a stable persona and tool-schema prefix. Appending ordinary history preserves that prefix, but replacing an older screenshot with the omission marker changes request content at that screenshot position and may prevent reuse after it. Provider cache availability and eviction remain outside this plugin's guarantees.

## `phone_control` behavior

`phone_control` accepts observation, tap target bounds and swipe endpoints in current-screenshot pixels, bounded Unicode text, selected navigation keys, validated package launch, and an explicit bounded wait. Tap uses the center of a tight `targetBBox`.

Every mutation must cite the latest `observationId` and auto-observes as soon as ADB returns; only an explicit `wait` delays observation. Successful actions return a verified observation and JPEG screenshot. Identical frames reuse the previous attachment. Repeated no-progress actions and tasks exceeding the operation budget fail before further device access.

The `text` action accepts up to 500 Unicode characters. Safe ASCII uses `adb input text`; Chinese, emoji, and other Unicode content uses scrcpy's standard UTF-8 clipboard control message and waits for the matching device ACK before reporting success. The protocol path is independent of the phone vendor and active input method. Text is sent as raw process or socket data and is never interpolated through a shell. The stop button cancels the whole OpenGUI task.

The Web UI discovers authorized devices before task admission. It ignores offline and unauthorized rows and exposes only process-local opaque ids and display labels to the browser. One phone is selected automatically; with several phones, the user selects a subset below the input. Task admission freezes that subset and binds one Host-private serial to each child before its first tool call. Every subsequent device command explicitly carries that child's locked serial.
