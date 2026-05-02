package com.google.android.accessibility.selecttospeak

import android.accessibilityservice.AccessibilityService
import android.accessibilityservice.AccessibilityServiceInfo
import android.view.accessibility.AccessibilityEvent
import com.coremate.opengui.automation.base.AMCore
import com.coremate.opengui.automation.base.utils.AMLog
import com.coremate.opengui.automation.base.utils.AMUtils
import kotlin.reflect.KProperty

/**
 * Accessibility service
 * */
class SelectToSpeakService : AccessibilityService() {

    companion object {
        //Accessibility service
        var service: SelectToSpeakService? = null
    }

    private var serviceInfoConfig by AccessibilityConfig()

    /**
 * Bind service
     * */
    override fun onServiceConnected() {
        super.onServiceConnected()
        service = this
        AMLog.onEDebugLog("服务开启")
        //Set configuration
        serviceInfoConfig = serviceInfo
        serviceInfo = serviceInfoConfig
        //Return to the app
//        AMUtils.jumpToPageInApp(this, AMCore.activityByOp)
    }

    /**
 * Toggle real layout versus simplified layout capture
     * */
    fun changeAccessibilityFlags(isReal: Boolean) {
        serviceInfoConfig = serviceInfo
        if (isReal) {
            serviceInfoConfig?.flags =
                (AccessibilityServiceInfo.FLAG_INCLUDE_NOT_IMPORTANT_VIEWS
                        or AccessibilityServiceInfo.FLAG_REPORT_VIEW_IDS
                        or AccessibilityServiceInfo.FLAG_REQUEST_ENHANCED_WEB_ACCESSIBILITY
                        or AccessibilityServiceInfo.FLAG_RETRIEVE_INTERACTIVE_WINDOWS)
        } else {
            serviceInfoConfig?.flags =
                (AccessibilityServiceInfo.FLAG_REPORT_VIEW_IDS
                        or AccessibilityServiceInfo.FLAG_REQUEST_ENHANCED_WEB_ACCESSIBILITY
                        or AccessibilityServiceInfo.FLAG_RETRIEVE_INTERACTIVE_WINDOWS)
        }
        serviceInfo = serviceInfoConfig
    }

    /**
 * Received the specified observed event
     * */
    override fun onAccessibilityEvent(event: AccessibilityEvent) {
        //Accessibility event type
        AMCore.instance.onAccessibilityEvent(event)
    }

    /**
 * Service interrupted
     * */
    override fun onInterrupt() {
        //....
        AMCore.instance.onAccessibilityInterrupt()
    }

    /**
 * Service destroyed
     * */
    override fun onDestroy() {
        super.onDestroy()
        service = null
    }

}

/**
 * Configuration
 * */
class AccessibilityConfig {
    companion object {
        var observePackageNames =
            "com.lemon.lv,com.android.launcher,com.tencent.mm,com.ss.android.ugc.aweme,com.tencent.wework,com.oppo.launcher,com.android.permissioncontroller,com.oplus.securitypermission,com.google.android.permissioncontroller.overlay.oplus"
    }

    private var myServiceInfo: AccessibilityServiceInfo? = null

    operator fun setValue(
        myAccessibilityService: SelectToSpeakService,
        property: KProperty<*>,
        accessibilityServiceInfo: AccessibilityServiceInfo?
    ) {
        myServiceInfo = accessibilityServiceInfo
    }

    operator fun getValue(
        myAccessibilityService: SelectToSpeakService,
        property: KProperty<*>
    ): AccessibilityServiceInfo? {

        if (observePackageNames.isNotEmpty()) {
            val pns = observePackageNames.split(",")
            myServiceInfo?.packageNames = pns.toTypedArray()
        } else {
            myServiceInfo?.packageNames = null
        }
        return myServiceInfo
    }
}