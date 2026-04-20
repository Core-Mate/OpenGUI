package com.google.android.accessibility.selecttospeak

import android.accessibilityservice.AccessibilityService
import android.accessibilityservice.AccessibilityServiceInfo
import android.view.accessibility.AccessibilityEvent
import com.coremate.opengui.automation.base.AMCore
import com.coremate.opengui.automation.base.utils.AMLog
import com.coremate.opengui.automation.base.utils.AMUtils
import kotlin.reflect.KProperty

/**
 * 辅助服务
 * */
class SelectToSpeakService : AccessibilityService() {

    companion object {
        //无障碍服务
        var service: SelectToSpeakService? = null
    }

    private var serviceInfoConfig by AccessibilityConfig()

    /**
     * 绑定service
     * */
    override fun onServiceConnected() {
        super.onServiceConnected()
        service = this
        AMLog.onEDebugLog("服务开启")
        //设置配置信息
        serviceInfoConfig = serviceInfo
        serviceInfo = serviceInfoConfig
        //跳转回app
//        AMUtils.jumpToPageInApp(this, AMCore.activityByOp)
    }

    /**
     * 更改是否获取真实布局或者简略布局
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
     * 获取到指定的监听事件
     * */
    override fun onAccessibilityEvent(event: AccessibilityEvent) {
        //辅助功能的事件类型
        AMCore.instance.onAccessibilityEvent(event)
    }

    /**
     * 服务被中断
     * */
    override fun onInterrupt() {
        //....
        AMCore.instance.onAccessibilityInterrupt()
    }

    /**
     * service销毁
     * */
    override fun onDestroy() {
        super.onDestroy()
        service = null
    }

}

/**
 * 配置信息
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