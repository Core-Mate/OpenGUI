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
        //是否在目标App内
        @Volatile
        var isInTargetApp: Boolean = false
    }

    //目标app检测
    private val checkTargetApp = AMCheckTargetApp(this, this)

    //悬浮/组件管理
    val windowManager = AMWindowManager()
    var componentManager: AMCompManager? = null
        set(value) {
            field = value
            field?.let { addForeOrBackObserver(it) }
        }

    //任务管理
    var taskManager: AMTaskManager = AMTaskManager(this)

    //根结点缓存
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
                                //windowInfo.root是get方法，直接判断空，下面的不一定不为空，所以用?
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

    //流程状态回调
    var processListener: IAMProcessListener? = null

    //前后台监听
    private val foreOrBackObservers = mutableListOf<IAMCompForeBackObserver>()

    /**
     * 添加前后台监听
     * */
    fun addForeOrBackObserver(observer: IAMCompForeBackObserver) {
        foreOrBackObservers.add(observer)
    }

    /**
     * 检测是否在目标APP，并分发给任务
     * */
    fun checkTargetAndDispatchTaskManager(event: AccessibilityEvent) {
        val rootNode = rootNode()
        //先检测：
        if (event.eventType == AccessibilityEvent.TYPE_WINDOW_STATE_CHANGED) {
            //只有（窗口-状态改变）才去检测
            val isInTargetApp =
                checkTargetApp.checkInTargetApp(targetApps, rootNode, event)
            //监听结果
            observeInTargetApp(isInTargetApp, rootNode)
        }
        //任务分发：
        if (taskManager.isStartTool) {
            taskManager.observeAccessibilityEventInTask(isInTargetApp, event)
        }
    }

    /**
     * 监听是否在目标内
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
     * 当前组件是否事件穿透（目前支持挂起弹窗）
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
    //                      释放
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
 * 子管理的生命周期
 * */
interface IAMSubManagerLifeCycle {

    //执行
    fun onExecute(taskCls: KClass<*>, dataContainer: AMDataContainer?) {

    }

    //释放
    fun onDestroy()
}

/**
 * 整体流程回调状态
 * */
interface IAMProcessListener {

    //任务开始
    fun onProcessTaskStart() {}

    /**
     * 任务暂停
     * @param isActive 是否主动暂停
     */
    fun onProcessTaskPause(isActive: Boolean = true) {}

    //任务恢复
    fun onProcessTaskResume() {}

    /**
     * 任务完成
     * @param isSuccess 是否成功
     * @param elapsedTime 耗时
     * @param exception 异常
     * @param sucData 数据
     */
    fun onProcessTaskFinish(
        isSuccess: Boolean,
        elapsedTime: Long,
        exception: AMTaskException? = null,
        sucData: AMDataContainer? = null,
    ) {
    }
}