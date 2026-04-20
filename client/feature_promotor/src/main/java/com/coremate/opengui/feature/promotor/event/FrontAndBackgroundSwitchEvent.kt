package com.coremate.opengui.feature.promotor.event

sealed class FrontAndBackgroundSwitchEvent {
    data object Background : FrontAndBackgroundSwitchEvent()
    data object Frontground : FrontAndBackgroundSwitchEvent()

}