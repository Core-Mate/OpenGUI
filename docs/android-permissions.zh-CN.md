<p align="center">
  <strong>语言切换：</strong><a href="./android-permissions.md">English</a> | <a href="./android-permissions.zh-CN.md">简体中文</a> | <a href="./android-permissions.ja-JP.md">日本語</a>
</p>

# Android 权限配置指南

OpenGUI 不需要 Root，也不需要解锁 Bootloader。为了获取屏幕、执行无障碍手势并在其他应用上方显示任务控制窗口，Android 客户端需要开启几项系统权限。

本指南适用于 Android 11（API 30）或更高版本，这是当前截图执行链路支持的最低版本。

不同手机品牌会修改权限名称和设置入口。下面的路径应作为搜索提示，不应视为所有系统版本都完全一致的固定路径。

## 权限检查清单

运行第一个任务前，请完成以下四项：

- [ ] 在手机上允许来自运行 OpenGUI 的电脑的 USB 调试连接。
- [ ] 在无障碍设置中开启 **OpenGUI AI Automation Service (required)**。
- [ ] 允许 OpenGUI 显示在其他应用上层。
- [ ] 允许 OpenGUI 忽略电池优化。

USB 调试用于安装 APK 和配置 `adb reverse`。其余三项会由 Android 客户端在任务执行前检查。

无障碍和悬浮窗权限能力较高，只应授予你信任的 OpenGUI 构建。这些权限允许应用读取当前可见屏幕、操作其他应用，并在其他应用上方显示控制窗口。

## 不同 Android 品牌的常见名称

实际名称取决于手机型号、Android 版本、厂商系统版本和系统语言。

| 系统 | 无障碍权限 | 悬浮窗权限 | 电池设置 |
| --- | --- | --- | --- |
| Android / Pixel | “无障碍”；服务可能位于“已下载的应用”中 | “显示在其他应用上层” | “不受限制”或“不优化” |
| OPPO / ColorOS | [Issue #41](https://github.com/Core-Mate/OpenGUI/issues/41) 反馈为“辅助功能”；部分版本使用“无障碍” | Issue #41 反馈为“允许显示在其他应用的上层”；部分版本使用“悬浮窗” | 使用 OpenGUI 打开的电池设置页面；名称会随 ColorOS 版本变化 |
| Samsung / One UI | “无障碍” > “已安装的应用” | “显示在顶部”（Appear on top） | 使用 OpenGUI 打开的电池设置页面；名称会随 One UI 版本变化 |
| Xiaomi / HyperOS / MIUI | “无障碍”可能位于“更多设置”中 | 名称会随版本变化；使用 OpenGUI 的悬浮窗入口，或搜索“悬浮窗” | “电池” > OpenGUI > “无限制” |
| 其他厂商系统 | 搜索“无障碍”“辅助功能”或 OpenGUI 服务名称 | 搜索“显示在其他应用上层”“显示在顶部”或“悬浮窗” | 搜索“电池优化”“不受限制”或“无限制” |

如果路径与手机不一致，可以在系统设置中搜索 `OpenGUI`、`无障碍`、`辅助功能`、`显示在其他应用上层`、`悬浮窗` 或 `电池优化`。

## 配置步骤

### 1. 允许 USB 调试

使用本地后端时，将手机连接到电脑，在手机上接受 USB 调试授权，并确认 ADB 显示为 `device`，而不是 `unauthorized`：

```bash
adb devices
adb reverse tcp:7777 tcp:7777
```

### 2. 开启无障碍服务

打开 OpenGUI，点击缺失的无障碍权限项目。Android 应跳转到无障碍设置页面。找到并开启 **OpenGUI AI Automation Service (required)**。

Android 13 或更高版本可能会对侧载 APK 显示“受限制的设置”。如果你信任从本仓库构建的 APK，请打开 **应用信息 > 更多 > 允许受限制的设置**，然后返回无障碍页面开启服务。

### 3. 允许显示在其他应用上层

返回 OpenGUI 并点击悬浮窗权限项目。在 OpenGUI 对应的系统设置页面中，打开“显示在其他应用上层”“允许显示在其他应用的上层”“悬浮窗”“显示在顶部”或设备使用的同类开关。

### 4. 关闭 OpenGUI 的电池优化

点击电池权限项目，允许 OpenGUI 忽略电池优化，或者选择“不受限制”“无限制”。当前客户端会在任务执行前检查这项设置。

### 5. 验证结果

返回 OpenGUI，再次启动任务。此时不应继续出现权限缺失窗口。任务执行期间，OpenGUI 应能够显示悬浮任务控制窗口、获取截图并执行无障碍操作。

## 常见问题

- **无障碍已经开启，但 OpenGUI 仍提示缺失：**关闭后重新开启该服务，然后重新启动 OpenGUI。
- **无障碍开关无法点击：**检查 Android 是否针对侧载 APK 显示“受限制的设置”提示。
- **找不到相同名称的悬浮窗页面：**在系统设置中搜索 `OpenGUI`，然后查看“特殊应用权限”“应用管理”或“其他权限”。
- **锁屏或切到后台后任务停止：**确认电池模式为“不受限制”或“无限制”，并允许 OpenGUI 在后台活动。
- **ADB 显示 `unauthorized`：**重新连接数据线并在手机上授权此电脑。如果授权弹窗不再出现，可以撤销旧的 USB 调试授权后重试。

## 截图与系统版本差异

权限页面会随系统版本频繁变化。向本指南添加截图时，应同时标注手机品牌、型号、Android 版本、厂商系统版本和系统语言。不要仅使用截图作为说明，截图旁仍应保留可搜索的权限名称。

官方参考：

- [使用 Android 无障碍功能](https://support.google.com/accessibility/android/answer/16323943?hl=zh-Hans)
- [了解受限制的设置](https://support.google.com/android/answer/12623953?hl=zh-Hans)
- [Samsung：允许应用显示在顶部](https://www.samsung.com/us/support/troubleshoot/TSG10004868/)
- [Xiaomi：允许应用不受电池限制地运行](https://www.mi.com/global/support/faq/details/KA-538010/)
