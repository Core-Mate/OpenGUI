package com.coremate.opengui.feature.promotor.event

import kotlinx.coroutines.flow.MutableSharedFlow
import kotlinx.coroutines.flow.SharedFlow
import kotlinx.coroutines.flow.asSharedFlow

/**
 */
object FrontAndBackgroundSwitchEventBus {
    private val _events = MutableSharedFlow<FrontAndBackgroundSwitchEvent>(
    )

    val events: SharedFlow<FrontAndBackgroundSwitchEvent> = _events.asSharedFlow()

    suspend fun publish(event: FrontAndBackgroundSwitchEvent) {
        _events.emit(event)
    }
}