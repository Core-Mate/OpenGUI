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
    object StreamChunkCompleted : AutomationEvent() // Streaming chat completed.
    object EventProcessingStart : AutomationEvent() // Event processing started.
    object EventProcessingDone : AutomationEvent() // Event processing completed.
    object ErrorReturnToPromotorApp : AutomationEvent() // Return to the app after an error.
    object EventLogout: AutomationEvent() // Logout event.
    object AccessibilityServiceWarningEvent: AutomationEvent() // Accessibility service warning.

    /** Remote task dispatch from the server over the standby channel. */
    data class RemoteDispatch(
        val executionId: Int,
        val taskId: Int,
        val taskName: String,
    ) : AutomationEvent()
}

enum class StopReason {
    COMPLETED,      // Task completed normally.
    ERROR,          // Task stopped because of an error.
    USER_INTERRUPT, // Task was interrupted by the user.
    SERVICE_DESTROY // Task stopped because the service was destroyed.
}
