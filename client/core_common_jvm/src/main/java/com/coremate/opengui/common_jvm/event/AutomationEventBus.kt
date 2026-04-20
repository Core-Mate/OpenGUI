package com.coremate.opengui.common_jvm.event

import kotlinx.coroutines.flow.MutableSharedFlow
import kotlinx.coroutines.flow.SharedFlow
import kotlinx.coroutines.flow.asSharedFlow

/**
 * A simple Event Bus implemented using Kotlin SharedFlow for automation events.
 * This allows decoupling event publishers (core_accessibility) from event subscribers (UI).
 */
object AutomationEventBus {
    // MutableSharedFlow allows emitting events
    private val _events = MutableSharedFlow<AutomationEvent>(
        // replay = 0, // No replay of past events for new collectors
        // extraBufferCapacity = 64, // A buffer for fast producers and slow consumers
        // onBufferOverflow = Suspend // Strategy for when buffer is full
    )

    // SharedFlow provides a read-only view for collectors
    val events: SharedFlow<AutomationEvent> = _events.asSharedFlow()

    /**
     * Emits an automation event.
     * This method should be called from a CoroutineScope.
     */
    suspend fun publish(event: AutomationEvent) {
        _events.emit(event)
    }
}