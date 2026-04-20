package com.coremate.opengui.automation.base.context

import android.os.Handler
import android.os.Looper
import android.view.accessibility.AccessibilityEvent
import android.view.accessibility.AccessibilityNodeInfo
import com.coremate.opengui.automation.base.AMTargetApp
import com.coremate.opengui.automation.base.utils.AMLog
import java.util.*

/**
 * 检测是否在目标内
 * */
internal class AMCheckTargetApp(
    var amContext: AMContext,
    val listener: AMCheckTargetAppListener?
) {

    private val mainHandler = Handler(Looper.getMainLooper())

    private var mCheckTimer: Timer? = null
    private var mCheckTimerTask: BroadcastTimerTask? = null

    //延时检测时间
    private val mCheckDelayTime: Long = 500

    //倒计时间隔
    private val mCheckCtTime: Long = 800

    //检测次数
    private var mCheckCount = 3

    //临时计数
    private var mTmpCount = 0

    /**
     * 检测是否在目标app
     * @param event 事件
     * @param reCheck 是否需要进行重新检测
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
        //如果是当前包名,默认就在微信中
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
        //兜底策略:通过node进行mCheckCount次检测
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
     * 取消重新检测
     * */
    fun cancelReCheck() {
        mTmpCount = 0
        mCheckTimer?.cancel()
        mCheckTimer = null
        mCheckTimerTask?.cancel()
        mCheckTimerTask = null
    }

    //倒计时
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
