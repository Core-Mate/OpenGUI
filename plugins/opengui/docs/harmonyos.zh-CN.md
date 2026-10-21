# 鸿蒙设备驱动

本插件 在 `plugins/opengui` 的独立电脑端插件中增加 HDC + UiTest 驱动，复用现有 CLI、会话锁、设备预览、操作预算和截图生命周期。AI 继续根据截图决定操作，控件树提供辅助信息。

## 源码构建与连接

环境：macOS arm64/x64、Node.js 22.19+、本机安装的 DevEco Studio/HDC、已开启并授权 USB 调试的原生鸿蒙设备。驱动以 API 17 为最低能力门槛，当前真机证据来自 API 24；其他版本仍需验证。

在此目录的父级插件根目录执行：

```bash
pnpm install --frozen-lockfile --ignore-scripts
pnpm check
export OPENGUI_PLATFORM=harmonyos
# HDC 默认从 PATH 和常见 DevEco Studio 路径查找。非标准安装时指定绝对路径：
# export OPENGUI_HDC_PATH=/absolute/path/to/sdk/toolchains/hdc
node lib/cli.js --doctor
node lib/cli.js --interfaces
node lib/cli.js opengui_list_devices '{}'
node lib/cli.js opengui_open_session '{}'
```

工具操作沿用宿主提供的 `CODEX_THREAD_ID`，不得伪造其他任务身份。多台设备时，在 `opengui_open_session` 中显式传入 `opengui_list_devices` 返回的 `deviceIds`。

所有调用必须保持 `OPENGUI_PLATFORM=harmonyos`。默认值是 `android`，不支持的值会报错；两端使用不同的守护进程端点，避免切换环境后误连另一端。可通过 `OPENGUI_CODEX_DATA_DIR` 指定专用的绝对路径作为本地运行目录。

已准备私有 Node 的插件安装也可以使用 `sh scripts/opengui ...`，该启动器会保留上述平台设置。本插件 的鸿蒙功能尚未发布到上游安装包，请使用这里构建的源码产物。

HDC 来自本机 SDK，本实现不分发 HDC、不安装手机代理，也不初始化 ADB/scrcpy。若 `--doctor` 无设备，检查手机调试开关及授权；它不会重启手机或替换其他程序的 HDC 服务。


先调用 `opengui_observe` 并查看返回的 JPEG 文件。每次动作传入最新 `observationId`，以及明确的 `externalSideEffect` 分类。动作失败后，旧 observation 被消耗，须重新观察；不能盲目重复发送或其他业务动作。

| action | 鸿蒙映射与限制 |
| --- | --- |
| `tap` | `uitest uiInput click`，使用截图内的 `targetBBox` 中心 |
| `long_press` | `uitest uiInput longClick` |
| `swipe` | 将截图坐标映射到原图像素，将 `durationMs` 换算为 UiTest 速度；速度受 200–40000 px/s 限制，实际时长可能近似 |
| `text` | 要求唯一聚焦的可编辑节点；API 18+ 使用 `uiInput text`，API 17 使用坐标 `inputText` |
| `key` | `Back`、`Home`、`Enter`；当前明确拒绝 `AppSwitch` |
| `launch` | `aa start`；必须提供 bundle 对应的 `packageName` 和 UIAbility 对应的 `abilityName` |
| `wait` | 可取消的显式等待，之后重新观察 |

启动应用示例，替换会话、观察 ID 及实际包名：

```json
{
  "sessionId": "returned-session-id",
  "observationId": "returned-observation-id",
  "action": "launch",
  "packageName": "com.example.demo",
  "abilityName": "EntryAbility",
  "externalSideEffect": "none"
}
```

## 观察、布局和输入结果

- `width`、`height` 是设备截图原始尺寸；动作坐标及 `layout.nodes[].bounds` 均采用返回的 JPEG 像素坐标系。JPEG 长边有上限，不能混用原图坐标。
- `layout` 最多返回 250 个辅助节点；`truncated` 表示输出达到上限。源布局限制 2 MiB 和 5000 个节点。
- `layout.stable` 表示截图前后的布局指纹一致。连续变化时有限重试，仍不稳定则返回截图及警告，并拒绝后续坐标/输入动作。
- 执行坐标或文本操作前再次核对实时布局。页面发生变化时拒绝操作，要求重新观察。系统状态栏时钟和输入法候选词不参与应用内容指纹，键盘窗口尺寸仍参与检测。
- **节点不等于可见目标。** 实测 Flutter 隐藏菜单也可能标记 `visible=true`，可见节点可能 `opacity=0`。驱动不提供自动“按文本点击”，不以这些属性替代截图确认。
- 截图与布局不是系统级原子快照，指纹比较也不能发现所有纯视觉变化；动画、Canvas、视频及受截图保护页面需要额外验证。

`actionAssessment` 明确区分：

| status | 含义 |
| --- | --- |
| `performed` | 工具已确认动作执行，仍需核对页面结果 |
| `text_present` | 聚焦输入节点中包含请求文本；必须核对完整字段值，尤其追加/替换语义 |
| `permission_required` | 检测到系统剪贴板授权弹窗，输入尚未确认；按用户授权处理后重新检查字段 |
| `text_unconfirmed` | 未在聚焦输入节点中确认文本，查看新截图后再决定下一步 |

中文/Emoji 输入可能修改系统剪贴板。驱动不读取、恢复原剪贴板，也不自动点击授权或授予永久权限。处理弹窗后的点击会返回新观察，调用方应对字段值做断言，不应再次盲目输入相同内容。

## 清理与验收

调用 `opengui_close_session` 或 `opengui_cancel` 结束会话，必要时用 `opengui_list_sessions` 恢复本任务的会话 ID。结束后可用 `--shutdown-daemon` 停止对应平台的空闲守护进程。

每次采集采用唯一的设备临时文件，回传完成后删除；取消时使用独立的短超时尝试清理。物理断连或进程被强制终止时可能留下文件，后续只清理属于该次运行的 `opengui-<UUID>.png/json`，不能全量删除其他工具文件。持久截图沿用原有按会话保存及清理逻辑。

自动化测试覆盖 Android 回归、HDC 错误应答、Unicode shell 转义、未授权设备、布局变化/限额、坐标缩放、速度换算、API 17/24 输入选择、权限状态、取消及临时文件清理。单测中的 API 17 路径不等于 API 17 真机验收。

当前适配仅涵盖此独立插件；DSH 插件、WorkBuddy 插件、Android 客户端/服务端、iOS，以及项目业务版本验收属于后续范围。

接口依据：[UiTest 官方文档](https://github.com/openharmony/docs/blob/master/zh-cn/application-dev/application-test/uitest-guidelines.md)、[HDC 官方文档](https://github.com/openharmony/docs/blob/master/zh-cn/application-dev/dfx/hdc.md)。

合入上游前的验证范围及复现步骤见 [设备验证说明](harmonyos-testing.md)。

## 精简观察输出

在接口名前加 `--compact`，保留聚焦输入、布局稳定性、授权状态和截图坐标。
`observationPath` 对应完整私有 JSON，可按需查询字段；精简节点不能用来判定
元素不存在，也不能替代截图判断。默认输出保持完整。完整 JSON 与截图在
会话关闭、取消及过期清理时一并删除；升级源码前先结束旧会话和旧守护进程。
见[输出及证据生命周期](compact-observations.md)。
