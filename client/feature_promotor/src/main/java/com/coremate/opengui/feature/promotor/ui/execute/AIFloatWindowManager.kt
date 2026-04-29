package com.coremate.opengui.feature.promotor.ui

import android.content.Context
import android.os.PowerManager
import android.util.Log
import com.coremate.opengui.feature.promotor.common.MessageController
import com.coremate.opengui.feature.promotor.ui.window.AccessibilityServiceWarningWindow
import com.coremate.opengui.feature.promotor.ui.window.CallUserWindow
import com.coremate.opengui.feature.promotor.ui.window.ExecuteTaskWindow
import com.coremate.opengui.feature.promotor.ui.window.GradientWindow
import com.coremate.opengui.feature.promotor.ui.window.SlideExpandWindow

object AIFloatWindowManager {
    @Volatile
    private var screenWakeLock: PowerManager.WakeLock? = null

    private var executeTaskWindow: ExecuteTaskWindow? = null
    private var slideExpandWindow: SlideExpandWindow? = null
    private var callUserWindow: CallUserWindow? = null
    private var gradientWindow: GradientWindow? = null
    private var accessibilityServiceWarningWindow: AccessibilityServiceWarningWindow? = null

    /**
     */
    var taskIsExecuted = false

    fun registerAccessibilityServiceWarning(accessibilityServiceWarningWindow: AccessibilityServiceWarningWindow) {
        this.accessibilityServiceWarningWindow = accessibilityServiceWarningWindow
    }


    fun registerCallUserWindow(callUserWindow: CallUserWindow) {
        this.callUserWindow = callUserWindow
    }

    fun showCallUserWindow(message: String?) {
        this.callUserWindow?.show(message)
    }

    fun hideCallUserWindow() {
        this.callUserWindow?.dismiss()
    }

    fun resetExecuteWindow(from: String) {
        this.executeTaskWindow?.reset(from)
    }


    fun registerExecuteTaskWindow(executeTaskWindow: ExecuteTaskWindow) {
        this.executeTaskWindow = executeTaskWindow
    }

    fun getExecuteTaskWindow(): ExecuteTaskWindow? {
        return this.executeTaskWindow
    }

    fun registerSlideExpandWindow(slideExpandWindow: SlideExpandWindow) {
        this.slideExpandWindow = slideExpandWindow
    }

    fun getSlideExpandWindow(): SlideExpandWindow? {
        return this.slideExpandWindow
    }

    fun registerGradientWindow(gradientWindow: GradientWindow) {
        this.gradientWindow = gradientWindow
    }

    fun getGradientWindow(): GradientWindow? {
        return this.gradientWindow
    }

    fun showGradientWindow(from: String) {
        if (MessageController.getBackgroundStatus()) {
            this.gradientWindow?.show(from)
        }
    }

    fun getCallUserWindow(): CallUserWindow? {
        return this.callUserWindow
    }

    fun getAccessibilityServiceWarningWindow(): AccessibilityServiceWarningWindow? {
        return this.accessibilityServiceWarningWindow
    }

    fun showSlideExpandWindow(currentTaskIsExecuted: Boolean, from: String) {
        acquireScreenWakeLock(slideExpandWindow?.context)
        slideExpandWindow?.show("AIFloatWindowManager - $from")
    }

    fun showExecuteTaskWindow(from: String) {
//        if (MessageController.getBackgroundStatus()) {
        acquireScreenWakeLock(executeTaskWindow?.context)
        executeTaskWindow?.show(from)
//        }
    }

    fun hideExecuteTaskWindow(from: String) {
        executeTaskWindow?.dismiss(from)
    }

    fun updateExecuteTaskWindow(content: String) {
        this.slideExpandWindow?.updateContent(content)
        this.executeTaskWindow?.updateContent(
            content,
            "AIFloatWindowManager - updateExecuteTaskWindow - $content"
        )
    }

    fun dismissAllWindow() {
        try {
            releaseScreenWakeLock()
            this.executeTaskWindow?.reset("AIFloatWindowManager dismissAllWindow")
            this.executeTaskWindow?.dismiss("AIFloatWindowManager dismissAllWindow")
            this.callUserWindow?.dismiss()
            this.gradientWindow?.dismiss("AIFloatWindowManager dismissAllWindow")
            this.slideExpandWindow?.dismiss("AIFloatWindowManager dismissAllWindow")
            this.slideExpandWindow?.updateBackground(false)
        } catch (e: Exception) {
            e.printStackTrace()
        }
    }

    private fun acquireScreenWakeLock(context: Context?) {
        if (context == null) return
        synchronized(this) {
            if (screenWakeLock?.isHeld == true) return@synchronized
            val pm = context.getSystemService(Context.POWER_SERVICE) as? PowerManager
                ?: return@synchronized

            @Suppress("DEPRECATION")
            val wakeLock = pm.newWakeLock(
                PowerManager.SCREEN_BRIGHT_WAKE_LOCK,
                "AIFloatWindowManager:screenOn"
            ).apply {
                setReferenceCounted(false)
            }
            wakeLock.acquire(10 * 60 * 60 * 1000L)
            screenWakeLock = wakeLock
        }
    }

    private fun releaseScreenWakeLock() {
        synchronized(this) {
            try {
                screenWakeLock?.let {
                    if (it.isHeld) it.release()
                }
            } catch (e: Exception) {
                Log.d("AIFloatWindowManager", "releaseScreenWakeLock", e)
            }
            screenWakeLock = null
        }
    }
}