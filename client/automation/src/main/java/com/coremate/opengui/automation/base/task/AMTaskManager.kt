package com.coremate.opengui.automation.base.task

import android.os.Handler
import android.os.Looper
import android.view.accessibility.AccessibilityEvent
import com.coremate.opengui.automation.base.context.AMContext
import com.coremate.opengui.automation.base.context.IAMSubManagerLifeCycle
import com.coremate.opengui.automation.base.data.AMDataContainer
import com.coremate.opengui.automation.base.utils.AMActionDelay
import com.coremate.opengui.automation.base.utils.AMLog
import kotlin.reflect.KClass

enum class AMTaskState {
    START, //开始
    RESUME, //恢复
    PAUSE, //暂停
    STOP, //结束
}

internal class AMTaskManager(private val amContext: AMContext) : IAMSubManagerLifeCycle {

    //是否开始使用工具
    var isStartTool = false

    //当前任务
    var task: AMBaseTask<*>? = null

    //任务状态改变监听
    var listener: AMTaskChangedListener? = null

    /**
     * 设置任务状态
     * @param isStopThrows (默认设置结束状态时，不抛出异常)
     */
    fun setTaskState(taskState: AMTaskState, isStopThrows: Boolean = false) {
        synchronized(this) {
            setTaskState = taskState
            amContext.taskManager.onObserveTaskStateChanged(isStopThrows)
        }
    }

    @Volatile
    private var setTaskState = AMTaskState.STOP

    //获取任务状态
    val taskState: AMTaskState
        get() = setTaskState


    //设置恢复或者暂停
    @Volatile
    var setTaskResume = true
        set(value) {
            synchronized(this) {
                field = value
                listener?.onChanged()
            }
        }

    //是否恢复
    val isTaskResume: Boolean
        get() = setTaskResume

    //记录是否在wx
    private var isRecordInWx = false

    /**
     * 执行任务
     * */
    override fun onExecute(taskCls: KClass<*>, dataContainer: AMDataContainer?) {
        if (task == null) {
            task = taskCls.constructors.first().call(amContext) as AMBaseTask<*>
        }
        //执行时，再次判断是否在目前App内
        val rootNodePackage = amContext.rootNode()?.packageName ?: ""
        val packageNames = amContext.targetApps.joinToString(separator = ", ") { it.packageName }
        if (packageNames.contains(rootNodePackage.toString())) {
            AMContext.isInTargetApp = true
        }
        if (AMContext.isInTargetApp) {
            amContext.processListener?.onProcessTaskStart()
            //任务初始化
            task?.initTaskAndData(dataContainer)
            //延时执行任务（为等带有键盘组件隐藏之后移除焦点）
            Handler(Looper.getMainLooper()).postDelayed({
                task?.onExecute()
            }, AMActionDelay.SHORT.millis)
        } else {
            AMLog.onEDebugLog("不在目标app，任务暂停1")
            amContext.processListener?.onProcessTaskPause(false)
        }
    }

    /**
     * 辅助监听
     * */
    fun observeAccessibilityEventInTask(isInTargetApp: Boolean, event: AccessibilityEvent) {
        if (amContext.taskManager.taskState != AMTaskState.STOP) {
            if (isInTargetApp == isRecordInWx) {
                return
            }
            if (isInTargetApp) {
                //任务正在执行中
            } else {
                //暂停任务
                AMLog.onEDebugLog("不在目标App，任务暂停2")
                amContext.processListener?.onProcessTaskPause(false)
            }
            isRecordInWx = isInTargetApp
        }
    }

    /**
     * 任务状态改变
     * */
    private fun onObserveTaskStateChanged(isStopThrows: Boolean) {
        task?.onObserveTaskStateChanged(isStopThrows)
    }

    override fun onDestroy() {
        task?.onDestroy()
        task = null
        listener = null
    }

}

/**
 * 任务状态真实改变回调
 * */
interface AMTaskChangedListener {
    //状态改变
    fun onChanged()
}
