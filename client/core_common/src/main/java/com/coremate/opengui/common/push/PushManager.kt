package com.coremate.opengui.common.push

import android.content.Context
import java.io.File

/**
 * Stub PushManager for source-available version.
 * Push notifications (UMeng) are disabled.
 */
class PushManager {

    var mDeviceToken: String? = null

    companion object {
        const val TAG = "PushManager"
        lateinit var applicationContext: Context
        val instance by lazy(LazyThreadSafetyMode.SYNCHRONIZED) {
            PushManager()
        }
    }

    fun registerPush(context: Context, callback: PushFileCallback) {
        // Push notifications disabled in source-available version
    }

    fun startActiveStatistics(context: Context) {}

    fun handleCustomMessages(context: Context) {}

    fun uploadLogs(startTime: Long = 0, endTime: Long = System.currentTimeMillis()) {}

    fun uploadAccessibilityLogs() {}

    interface PushFileCallback {
        fun callback(file: File, id: Int)
    }
}
