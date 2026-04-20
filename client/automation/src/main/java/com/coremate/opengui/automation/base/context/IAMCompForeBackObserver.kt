package com.coremate.opengui.automation.base.context

internal interface IAMCompForeBackObserver {
    fun onBecameForegroundInTargetApp() {}
    fun onBecameBackgroundInTargetApp() {}
}