package com.coremate.opengui.automation.base.context

import android.app.Activity
import android.os.Handler
import android.os.Looper
import android.view.accessibility.AccessibilityEvent
import android.view.accessibility.AccessibilityNodeInfo
import com.google.android.accessibility.selecttospeak.SelectToSpeakService
import com.coremate.opengui.automation.base.AMTargetApp
import com.coremate.opengui.automation.base.component.AMBaseFloatWindow
import com.coremate.opengui.automation.base.component.AMWindowManager
import com.coremate.opengui.automation.base.component.manager.AMCompManager
import com.coremate.opengui.automation.base.data.AMDataContainer
import com.coremate.opengui.automation.base.exception.AMTaskException
import com.coremate.opengui.automation.base.task.AMTaskManager
import com.coremate.opengui.automation.base.utils.AMLog
import java.util.concurrent.ThreadFactory
import kotlin.reflect.KClass

internal class AMContext(
    var activity: Activity? = null,
    val targetApps: List<AMTargetApp>,
    val threadFactory: ThreadFactory,
) : AMCheckTargetAppListener {

    companion object {
        //Whether in the target app
        @Volatile
        var isInTargetApp: Boolean = false
    }

    //Targetapp Check
    private val checkTargetApp = AMCheckTargetApp(this, this)

    //Floating/component management
    val windowManager = AMWindowManager()
    var componentManager: AMCompManager? = null
        set(value) {
            field = value
            field?.let { addForeOrBackObserver(it) }
        }

    //Task management
    var taskManager: AMTaskManager = AMTaskManager(this)

    //Root node cache
    @Volatile
    private var mRootNode: AccessibilityNodeInfo? = null

    fun rootNode(): AccessibilityNodeInfo? {
        synchronized(this) {
            try {
                mRootNode = SelectToSpeakService.service?.rootInActiveWindow
                val packageNames = targetApps.joinToString(separator = ", ") { it.packageName }
                if (!packageNames.contains(mRootNode?.packageName?.toString() ?: "")) {
                    SelectToSpeakService.service?.windows?.let {
                        it.forEach { windowInfo ->
                            if (windowInfo != null) {
                                //window Info.root is a getter; even if the direct null check passes, values below may still be null, so use ?
                                val tempPackageName = windowInfo.root?.packageName
                                if (tempPackageName != null && packageNames.contains(tempPackageName.toString())) {
                                    return windowInfo.root
                                }
                            }
                        }
                    }
                }
                return mRootNode
            } catch (e: Exception) {
                e.printStackTrace()
                return null
            }
        }
    }

    //Process status callback
    var processListener: IAMProcessListener? = null

    //Foreground/background listener
    private val foreOrBackObservers = mutableListOf<IAMCompForeBackObserver>()

    /**
 * Add Foreground/background listener
     * */
    fun addForeOrBackObserver(observer: IAMCompForeBackObserver) {
        foreOrBackObservers.add(observer)
    }

    /**
 * Check whether in the target app and dispatch to the task
     * */
    fun checkTargetAndDispatchTaskManager(event: AccessibilityEvent) {
        val rootNode = rootNode()
        //Check first:
        if (event.eventType == AccessibilityEvent.TYPE_WINDOW_STATE_CHANGED) {
            //Check only for window state changes
            val isInTargetApp =
                checkTargetApp.checkInTargetApp(targetApps, rootNode, event)
            //Observe result
            observeInTargetApp(isInTargetApp, rootNode)
        }
        //Task dispatch:
        if (taskManager.isStartTool) {
            taskManager.observeAccessibilityEventInTask(isInTargetApp, event)
        }
    }

    /**
 * Observe whether inside target
     * */
    private fun observeInTargetApp(
        inTargetApp: Boolean,
        rootNode: AccessibilityNodeInfo?,
        isRecheck: Boolean = false,
        times: Int = 0
    ) {

        isInTargetApp = inTargetApp
        val rootNodePackage = rootNode?.packageName
        if (isRecheck) {
            for (targetApp in targetApps) {
                if (rootNodePackage == targetApp.packageName) {
                    isInTargetApp = true
                    break
                }
            }
        }
        if (isInTargetApp) {
            if (isRecheck) {
                AMLog.onEDebugLog(
                    "重新检测 ${times}次结果:Node= ${rootNodePackage},在${
                        targetApps.joinToString(
                            separator = ", "
                        ) { it.zhName }
                    }中"
                )
                checkTargetApp.cancelReCheck()
            } else {
                AMLog.onEDebugLog("在${targetApps.joinToString(separator = ", ") { it.zhName }}中")
            }
            foreOrBackObservers.forEach {
                it.onBecameForegroundInTargetApp()
            }
        } else {
            if (isRecheck) {
                AMLog.onEDebugLog(
                    "重新检测 ${times}次结果:Node= ${rootNodePackage},不在${
                        targetApps.joinToString(
                            separator = ", "
                        ) { it.zhName }
                    }中"
                )
            } else {
                AMLog.onEDebugLog("不在目标app中")
            }
            foreOrBackObservers.forEach {
                it.onBecameBackgroundInTargetApp()
            }
        }
    }

    override fun onInTargetAppRecheck(times: Int) {
        observeInTargetApp(
            inTargetApp = true,
            rootNode = rootNode(),
            isRecheck = true,
            times = times
        )
    }

    /////////////////////////////////////////////////////////////////////////////////
    //
    //                      Tool Method
    //
    /////////////////////////////////////////////////////////////////////////////////

    fun showToast(msg: String) {
        Handler(Looper.getMainLooper()).post {
            windowManager.showToast(msg)
        }
    }

    /**
 * Whether the current component allows event pass-through; currently supports suspended dialogs
     * */
    fun changeCompEventStrike(isStrike: Boolean) {
        val curComps = componentManager?.allComponent()
        curComps?.let { list ->
            for (curComp in list) {
                curComp.let {
                    windowManager.changeEventStrike(
                        it.component as AMBaseFloatWindow<*, *>,
                        isStrike
                    )
                }
            }
        }
    }

    /////////////////////////////////////////////////////////////////////////////////
    //
    // Release
    //
    /////////////////////////////////////////////////////////////////////////////////

    fun destroyCompsAndTask() {
        componentManager?.onDestroy()
        taskManager.onDestroy()
    }

    fun destroyAll() {
        windowManager.onDestroy()
        taskManager.onDestroy()
        foreOrBackObservers.clear()
        processListener = null
    }
}

/**
 * Child manager lifecycle
 * */
interface IAMSubManagerLifeCycle {

    //execute
    fun onExecute(taskCls: KClass<*>, dataContainer: AMDataContainer?) {

    }

    //Release
    fun onDestroy()
}

/**
 * Overall process callback status
 * */
interface IAMProcessListener {

    //Task started
    fun onProcessTaskStart() {}

    /**
 * Task paused
 * @param is Active whether the pause is active
     */
    fun onProcessTaskPause(isActive: Boolean = true) {}

    //Task resumed
    fun onProcessTaskResume() {}

    /**
 * Task complete
 * @param is Success whether execution succeeded
 * @param elapsed Time elapsed time
 * @param exception exception
 * @param suc Data data
     */
    fun onProcessTaskFinish(
        isSuccess: Boolean,
        elapsedTime: Long,
        exception: AMTaskException? = null,
        sucData: AMDataContainer? = null,
    ) {
    }
}