# OpenGUI 模型交互说明

本文记录 `dsh-coremate-mobile` 对父模型、直接命令和手机子模型的可见内容，以及 Token、截图历史和 KV Cache 行为。安装与配置请从[中文 README](../README.zh.md)开始。

## Host 可见的工具

### 模型看到的内容

父模型会看到固定的 `phone_agent({ task })`、`browser_agent({ task })`、`phone_control(...)` 和 `browser_control(...)` schema。父级入口是两个 `*_agent`；两个 `*_control` 只能由插件创建并绑定目标的对应子任务使用。

### Token 影响

插件挂载期间，四份固定 schema 会增加 Host 请求 token。只有实际执行委派后，委派结果才会加入子任务 run id 和最终内容。

### KV Cache 影响

工具 schema 在插件版本及挂载状态不变时构成稳定的 Host 请求前缀。OpenGUI 模型端点设置不会改变这些 schema。

## 直接 `/opengui` 命令

空命令会在模型路由前直接返回用法。非空命令在父模型之外启动一个受限路由子任务。默认情况下，内部 `coremate-inherited` 适配器会把请求转发给接收任务的 DSH 会话 provider、model 和输出 token 上限，不复制凭据；路由子任务只能调用 `phone_agent` 和 `browser_agent`，两层控制子任务继承同一条已解析路由。

当前模型声明支持图片时不询问；可写的自定义模型遗漏 `input` 时，只询问是否支持图片和工具调用，确认后为当前 provider/model 补全 `input: [text, image]` 并继续同一任务。不可写且能力未知的模型也只记住这一条精确路由。明确仅支持文字时才使用专用回退。

专用配置不再有额外的介绍页；只在用户主动选择后询问端点、协议、模型 ID 和密钥，最后确认能力后才写入。跳过任意一步会正常取消，不留下半套配置，也不调用模型或设备。

通过能力准入后，命令自身才会产生路由模型请求，具体控制仍在独立子任务中执行。控制截图不进入父模型上下文或命令最终文本，只在实时嵌套工具卡片中供用户查看。模型若返回图片或工具能力错误，任务不会自动重试；对应的精确信任会清除，插件自动加入且未被用户改动的图片声明也会撤回。

控制子任务的 `phone_control` / `browser_control` 调用会作为外层委派调用的嵌套执行过程实时展示，包含参数和可见工具结果；隐藏推理、系统提示词与模型配置不向父对话投影。

## 独立的浏览器子任务请求

浏览器子任务只看到 `browser_control`。首次调用时，插件若未找到固定版本 Chromium，会等待 Web UI 用户确认；确认后下载、校验并继续原任务。工具支持观察、HTTP(S) 导航、点击、Unicode 文本输入、有限按键、滚动、后退、刷新和等待。除首次 `navigate` 外，修改必须携带最新 `observationId`，每次动作后返回当前 URL、标题和 JPEG 观察；相同画面复用附件。

浏览器子任务、二进制、独立 profile 和进程生命周期全部属于插件，不依赖 CoreMateDesktop2 或系统浏览器。输入框停止按钮会取消等待确认、下载、子任务和浏览器进程。

## 独立的手机子任务请求

### 模型看到的内容

每台已选手机都会得到独立的子模型请求，其中包含委派任务、该手机的显示名、固定目标的手机控制 persona，以及唯一可用的 `phone_control` 工具。工具结果包含观察元数据；画面变化时还包含 JPEG 附件。继承适配器与专用适配器都会用简短标记替换较早的手机图片，只保留最新截图，同时转发取消信号、工具 schema 和流式结果。

手机控制 persona 为：

```markdown
You control exactly one fixed Android phone, labeled {device label}. Never try to discover, switch, or act on another phone. Observe before the first change. For every mutation, echo the exact current observationId. Tap with a tight targetBBox and swipe with coordinates in current screenshot pixels. Perform exactly one action per phone_control call and inspect the returned observation. Use wait only when the UI is visibly loading; ordinary actions already auto-observe. Never reuse coordinates from an old observation. Stop and report any authorization, device, model, repeated-no-progress, operation-limit, or unsupported-action error.
```

### Token 影响

每次子任务 action 都会向持久会话追加文本元数据。变化画面增加一份图片附件；未变化画面复用前一附件，只增加元数据。Provider 请求最多携带最新一张手机截图，文本和工具历史会持续增长，直到子任务结束或达到操作上限。

### KV Cache 影响

手机子任务是独立模型请求，persona 和工具 schema 前缀保持稳定。追加普通历史会保留该前缀，但把旧截图替换成省略标记会改变该截图位置的请求内容，并可能使其后内容无法复用。Provider 是否提供缓存以及缓存淘汰策略不属于本插件保证。

## `phone_control` 行为

`phone_control` 只接受观察、当前截图像素中的点击目标边界和滑动端点、有界 Unicode 文本、指定导航按键、经过校验的包启动，以及显式有界等待。点击使用紧凑 `targetBBox` 的中心。

每次修改必须携带最新的 `observationId`，并在 ADB 返回后立即自动观察；只有显式 `wait` 会推迟观察。成功 action 会返回经过验证的观察结果和 JPEG 截图，相同画面会复用此前附件。连续无进展操作和超过操作预算的任务会在继续访问设备前失败。

`text` action 最多接受 500 个 Unicode 字符。安全 ASCII 走 `adb input text`；中文、emoji 和其他 Unicode 内容通过 scrcpy 标准控制协议发送 UTF-8 剪贴板消息，并在收到对应的设备 ACK 后才报告成功。该协议路径与手机厂商和当前输入法无关。文本以进程参数或原始 socket 数据发送，不经过 shell 拼接。输入框右侧的停止按钮会取消整个 OpenGUI 任务。

Web 界面会在任务接纳前发现已授权设备。插件忽略 offline 和 unauthorized 行，只向浏览器暴露进程内 opaque id 与显示名。单台自动选择；多台时由用户在 OpenGUI Tab 选择子集。任务接纳后会冻结该子集，并在每个子任务首次调用工具前绑定一个 Host 私有 serial。后续每条设备命令都会明确携带该子任务锁定的 serial。
