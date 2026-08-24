# Agent Note: CoreMate 直接手机命令

Status: implemented

[English](2026-08-18-coremate-direct-phone-command.md) | 中文

## Problem

启动手机任务必须由父模型选择 `phone_agent`，即使用户已经明确表达该意图。直接命令仍需保持相同的手机模型配置、子任务 persona、工具限制、ADB policy、取消和任务结果语义。命令与工具各自实现会产生行为偏差，也可能同时控制部署所选择的同一台手机。

## Decision

插件通过官方 Harness 命令 registry 注册 `/coremate <phone task>`。命令把 trim 后的参数直接交给包内 `PhoneTaskCoordinator`，不会把命令行发送给父模型。`phone_agent` 调用同一个 coordinator；该模块通过一个注入的启动操作统一拥有配置检查、凭据解析、子任务创建、任务结算和卸载取消。

同一插件实例在两个入口之间一次只接纳一个手机任务。由于每个任务都会选择同一台排序第一的已授权手机，并发调用会在访问模型或 ADB 前失败。插件卸载会中止活动子任务的 signal 并等待任务结束。工具会保留所有最终 content block；通用命令结果会连接最终文本 block，没有文本时返回稳定的 run 完成消息。

## Alternatives considered

**把 `/coremate` 转换为父模型 prompt。** 这会消耗一次父模型请求，而且即使命令已经指定执行路径，工具选择仍具有不确定性。

**从命令 handler 调用已注册的 `phone_agent` 工具。** 工具 runtime 管理模型调用的调度和日志，不负责直接 UI 组合。内部 coordinator 让两个 adapter 共用一个实现，并且不伪造模型工具调用。

**允许命令和工具任务重叠。** 子任务内部的工具串行不能阻止两个子任务选择并控制同一台实体手机。插件级接纳检查会在访问共享资源前给出确定失败。

**把子任务截图投影到命令结果。** 官方通用命令结果接受文本和可选 source event，而手机截图属于子会话。客户端专用投影会让插件范围超出仅在 host 注册命令的功能。

## Consequences

用户可以用一个斜杠命令确定地调用手机 runner，同时仍可使用普通的模型委派。直接命令不消耗父模型 token，但只显示文本。即使部署以后连接多台已授权手机，第二个会话也不能通过同一插件实例并发运行手机任务；增加显式设备选择时必须重新评估这项接纳规则。
