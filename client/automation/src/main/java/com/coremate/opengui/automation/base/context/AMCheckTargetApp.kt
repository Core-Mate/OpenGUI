package com.coremate.opengui.automation.base.context

import android.os.Handler
import android.os.Looper
import android.view.accessibility.AccessibilityEvent
import android.view.accessibility.AccessibilityNodeInfo
import com.coremate.opengui.automation.base.AMTargetApp
import com.coremate.opengui.automation.base.utils.AMLog
import java.util.*

/**
 * Checkwhetherin Targetinside
 * */
internal class AMCheckTargetApp(
    var amContext: AMContext,
    val listener: AMCheckTargetAppListener?
) {

    private val mainHandler = Handler(Looper.getMainLooper())

    private var mCheckTimer: Timer? = null
    private var mCheckTimerTask: BroadcastTimerTask? = null

    //Delayed check time
    private val mCheckDelayTime: Long = 500

    //Countdowninterval
    private val mCheckCtTime: Long = 800

    //Checkcount
    private var mCheckCount = 3

    //Temporary count
    private var mTmpCount = 0

    /**
 * Checkwhetherin Targetapp
 * @param event event
 * @param reCheck whether recheck is needed
     * */
    fun checkInTargetApp(
        targetApps: List<AMTargetApp>,
        rootNode: AccessibilityNodeInfo?,
        event: AccessibilityEvent
    ): Boolean {
        val eventPackage = event.packageName
        AMLog.onEDebugLog(
            "======package:${eventPackage} -->class:${event.className} "
        )
        AMLog.onEDebugLog("====== Node:" + rootNode?.packageName)
        //If this is the current package name, treat it as already inside We Chat
        val packageNames = targetApps.joinToString(separator = ", ") { it.packageName }
        if (packageNames.contains(eventPackage)) {
            AMLog.onEDebugLog(
                "一定在${targetApps.joinToString(separator = ", ") { it.zhName }}中 - 是${
                    targetApps.joinToString(
                        separator = ", "
                    ) { it.zhName }
                }的包名"
            )
            cancelReCheck()
            return true
        }
        //Fallback: check mCheckCount times through nodes
        if (packageNames.contains(rootNode?.packageName?.toString() ?: "")) {
            startCheckInTargetAppByTimer()
            return true
        }

        return false
    }

    private fun startCheckInTargetAppByTimer() {
        if (mCheckTimer == null) {
            AMLog.onEDebugLog("重新检测")
            mCheckTimer = Timer()
            mCheckTimerTask = BroadcastTimerTask()
            mCheckTimer?.schedule(mCheckTimerTask, mCheckDelayTime, mCheckCtTime)
        }
    }

    /**
 * Cancel recheck
     * */
    fun cancelReCheck() {
        mTmpCount = 0
        mCheckTimer?.cancel()
        mCheckTimer = null
        mCheckTimerTask?.cancel()
        mCheckTimerTask = null
    }

    //Countdown
    private inner class BroadcastTimerTask : TimerTask() {
        override fun run() {
            mTmpCount++
            mainHandler.post {
                listener?.onInTargetAppRecheck(mTmpCount)
                if (mTmpCount == mCheckCount) {
                    cancelReCheck()
                }
            }
        }
    }
}

interface AMCheckTargetAppListener {
    fun onInTargetAppRecheck(times: Int)
}
