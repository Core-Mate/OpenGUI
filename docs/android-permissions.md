<p align="center">
  <strong>Language:</strong> <a href="./android-permissions.md">English</a> | <a href="./android-permissions.zh-CN.md">简体中文</a> | <a href="./android-permissions.ja-JP.md">日本語</a>
</p>

# Android Permission Setup

OpenGUI does not require root access or an unlocked bootloader. It does require
several Android system permissions so it can capture the screen, perform
accessibility gestures, and display task controls over other apps.

This guide assumes Android 11 (API 30) or newer, which is the minimum version
supported by the current screenshot-based execution path.

Android vendors rename and reorganize these settings. Treat the paths below as
search hints rather than fixed menu locations.

## Permission Checklist

Before running the first task, complete all four items:

- [ ] Approve USB debugging for the computer running OpenGUI.
- [ ] Enable **OpenGUI AI Automation Service (required)** in Accessibility.
- [ ] Allow OpenGUI to display over other apps.
- [ ] Allow OpenGUI to ignore battery optimization.

USB debugging is used for APK installation and `adb reverse`. The other three
items are checked by the Android client before task execution.

Only grant Accessibility and overlay access to an OpenGUI build that you trust.
These permissions allow the app to read the visible screen, interact with apps,
and display controls above other apps.

## Common Names by Android Vendor

The exact wording depends on the device model, Android version, system language,
and vendor skin.

| System | Accessibility | Overlay | Battery setting |
| --- | --- | --- | --- |
| Android / Pixel | Accessibility; the service may be under Downloaded apps | Display over other apps | Unrestricted or Don't optimize |
| OPPO / ColorOS | [Issue #41](https://github.com/Core-Mate/OpenGUI/issues/41) reports 辅助功能; some versions use 无障碍 | Issue #41 reports 允许显示在其他应用的上层; some versions use 悬浮窗 | Use the battery page opened by OpenGUI; wording varies by ColorOS version |
| Samsung / One UI | Accessibility > Installed apps | Appear on top | Use the battery page opened by OpenGUI; wording varies by One UI version |
| Xiaomi / HyperOS / MIUI | Accessibility may be under Additional settings | Wording varies; use the OpenGUI overlay shortcut or search for Floating windows | Battery > OpenGUI > No restrictions |
| Other vendor skins | Search for Accessibility, assistive features, or the OpenGUI service name | Search for Display over other apps, Appear on top, or Floating window | Search for Battery optimization, Unrestricted, or No restrictions |

If a path does not match your phone, search Settings for `OpenGUI`,
`Accessibility`, `display over other apps`, `floating window`, or
`battery optimization`.

## Setup Steps

### 1. Approve USB debugging

For a local backend, connect the phone to the computer, accept the device's USB
debugging prompt, and verify that ADB reports it as `device` rather than
`unauthorized`:

```bash
adb devices
adb reverse tcp:7777 tcp:7777
```

### 2. Enable the Accessibility Service

Open OpenGUI and tap the missing Accessibility permission item. Android should
open its Accessibility settings. Select **OpenGUI AI Automation Service
(required)** and enable it.

On Android 13 or newer, a sideloaded APK may show **Restricted setting**. If you
trust the APK you built from this repository, open **App info > More > Allow
restricted settings**, then return to Accessibility and enable the service.

### 3. Allow display over other apps

Return to OpenGUI and tap the overlay permission item. On the system page for
OpenGUI, enable the switch named **Display over other apps**, **Appear on top**,
**Floating window**, or the equivalent label used by the device.

### 4. Disable battery optimization for OpenGUI

Tap the battery permission item and allow OpenGUI to ignore battery optimization
or choose **Unrestricted** / **No restrictions**. The current client includes
this exemption in its preflight permission check.

### 5. Verify the result

Return to OpenGUI and start the task again. The missing-permission dialog should
no longer appear. During execution, OpenGUI should be able to show its floating
task controls, capture a screenshot, and perform an accessibility action.

## Troubleshooting

- **The Accessibility service is enabled but OpenGUI still reports it missing:**
  turn the service off and on again, then restart OpenGUI.
- **The Accessibility switch is disabled:** check whether Android is showing a
  restricted-setting warning for the sideloaded APK.
- **The overlay page does not use the same wording:** search Settings for
  `OpenGUI`, then inspect Special app access, App management, or Other
  permissions.
- **Tasks stop after the screen is locked or OpenGUI is backgrounded:** confirm
  that the battery mode is Unrestricted / No restrictions and that the vendor's
  background activity control allows OpenGUI.
- **ADB shows `unauthorized`:** reconnect the cable and approve the computer on
  the phone. Revoke old USB debugging authorizations if the prompt does not
  reappear.

## Screenshots and Version Differences

Permission screens change frequently. Any screenshot added to this guide should
include the device brand, model, Android version, vendor OS version, and system
language. Do not use a screenshot as the only instruction; keep the searchable
permission name beside it.

Official references:

- [Use accessibility features on Android](https://support.google.com/accessibility/android/answer/16323943?hl=en)
- [Learn about restricted settings](https://support.google.com/android/answer/12623953?hl=en)
- [Samsung: Apps that can appear on top](https://www.samsung.com/us/support/troubleshoot/TSG10004868/)
- [Xiaomi: Allow an app to run with no battery restrictions](https://www.mi.com/global/support/faq/details/KA-538010/)
