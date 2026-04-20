package com.coremate.opengui.common_jvm.event

/**
 * Represents an event from the automation core.
 * This event will be published by core_accessibility and consumed by UI.
 */
sealed class AutomationEvent {
    data class StatusUpdate(val message: String) : AutomationEvent()
    object Started : AutomationEvent()
    data class Stopped(val reason: StopReason) : AutomationEvent()
    data class AppChanged(val packageName: String, val appName: String) : AutomationEvent()
    object Paused : AutomationEvent()

    data class CallUser(val message: String?) : AutomationEvent()
    object Resumed : AutomationEvent()
    data class ThoughtUpdate(val thoughtContent: String) : AutomationEvent()
    object ReturnToPromotorApp : AutomationEvent()
    object ScreenshotRequested : AutomationEvent()
    object ScreenshotFail : AutomationEvent()
    object UpdateMyTask : AutomationEvent()
    object ImageUploadComplete : AutomationEvent()
    object StreamChunkCompleted : AutomationEvent() // 流式聊天完成
    object EventProcessingStart : AutomationEvent() // 事件处理开始
    object EventProcessingDone : AutomationEvent() // 事件处理开始
    object ErrorReturnToPromotorApp : AutomationEvent() // 事件处理开始
    object EventLogout: AutomationEvent()//退出登录
    object AccessibilityServiceWarningEvent: AutomationEvent()//退出登录

    /** 远程任务派发 — Server 通过 standby 通道下发 */
    data class RemoteDispatch(
        val executionId: Int,
        val taskId: Int,
        val taskName: String,
    ) : AutomationEvent()
}

enum class StopReason {
    COMPLETED,      // 任务正常完成
    ERROR,          // 任务异常中断
    USER_INTERRUPT, // 任务被用户主动中断
    SERVICE_DESTROY // 服务销毁导致的任务停止
}