# Agent Note: 手机 action 预检避免重复设备发现

Status: implemented

[English](2026-08-18-phone-action-preflight-avoids-device-rediscovery.md) | 中文

## Problem

每次 `phone_control` 调用都会执行 `adb devices -l`，包括子任务已锁定 serial 后的调用。第四次相同无进展 action 只在该发现命令之后检查重复保护，因此按文档应在 ADB 前失败的 action 仍会访问设备服务。显式 observe 或 wait 得到变化截图时，旧的重复计数也会继续保留。单元测试覆盖了状态 helper，但没有通过 Loader 启动插件，也没有证明 registry 会随 fiber 清理。

## Decision

首次观察发现并锁定一台已授权设备。后续 action 都通过 `-s` 直接使用该 serial；目标断开或失去授权时，定向 ADB 命令失败，任务不会选择另一台手机。修改操作的校验会先构造白名单命令并检查重复保护，然后才解析缓存 serial 或调用 ADB。任何新观察的截图 fingerprint 与前一观察不同时，发布该观察会清除重复状态。

观察标识在工具输入校验和生成后使用包拥有的 `ObservationId` brand。免密钥子进程 fixture 通过 Harness app boot 和 Loader 加载真实 bundle patch，对模型可见的 provider 与工具协议生成 snapshot，处置插件 fiber，并验证路由和工具随之消失。Fixture 在测试处置前把 Loader 可写配置复制到隔离的临时目录。

## Alternatives considered

**每次 action 前重新枚举设备。** 这种方案保留自定义断开诊断，但每次 action 都多执行一个 ADB 进程，而且使预检保护仍会接触 ADB。固定 serial 的定向命令已经可以报告断开和授权错误，并且不会允许切换设备。

**只在修改操作完成时清除无进展状态。** 这种方案会遗漏显式 observe 和 wait 产生的变化画面；如果后续画面再次匹配更早的 fingerprint，旧计数会重新生效。

**只保留 helper 单元测试。** 纯函数测试速度快，但不能证明 Loader patch 组合、模型可见 schema 或 Cordis fiber 处置。

## Consequences

首次发现后的每次 action 都从关键路径移除一个 `adb devices -l` 进程，第四次相同且画面未变化的修改会在任何 ADB 进程前失败。断开错误改由固定 serial 的 ADB 操作报告，不再来自提前执行的自定义枚举诊断。无论通过哪种方式请求观察，只要画面变化就会重置重复保护。

Loader smoke 增加仅供测试使用的 app-boot、本地设置与附件 provider，以及子进程 harness。它不连接手机或模型端点；真机延迟和端点兼容性仍由部署 smoke 负责验证。
