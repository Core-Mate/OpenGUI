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
    START, // Start.
    RESUME, // Resume.
    PAUSE, // Pause.
    STOP, // Stop.
}

internal class AMTaskManager(private val amContext: AMContext) : IAMSubManagerLifeCycle {

    //Whether tool use has started
    var isStartTool = false

    //Current task
    var task: AMBaseTask<*>? = null

    //Task status change listener
    var listener: AMTaskChangedListener? = null

    /**
 * Set task status
 * @param is Stop Throws whether to throw when setting stop status; default does not throw
     */
    fun setTaskState(taskState: AMTaskState, isStopThrows: Boolean = false) {
        synchronized(this) {
            setTaskState = taskState
            amContext.taskManager.onObserveTaskStateChanged(isStopThrows)
        }
    }

    @Volatile
    private var setTaskState = AMTaskState.STOP

    //Get task status
    val taskState: AMTaskState
        get() = setTaskState


    //Set resume or pause
    @Volatile
    var setTaskResume = true
        set(value) {
            synchronized(this) {
                field = value
                listener?.onChanged()
            }
        }

    //Whether resumed
    val isTaskResume: Boolean
        get() = setTaskResume

    //Record whether in We Chat
    private var isRecordInWx = false

    /**
 * Execute task
     * */
    override fun onExecute(taskCls: KClass<*>, dataContainer: AMDataContainer?) {
        if (task == null) {
            task = taskCls.constructors.first().call(amContext) as AMBaseTask<*>
        }
        //Check again at execution time whether the current app is active
        val rootNodePackage = amContext.rootNode()?.packageName ?: ""
        val packageNames = amContext.targetApps.joinToString(separator = ", ") { it.packageName }
        if (packageNames.contains(rootNodePackage.toString())) {
            AMContext.isInTargetApp = true
        }
        if (AMContext.isInTargetApp) {
            amContext.processListener?.onProcessTaskStart()
            //Initialize task
            task?.initTaskAndData(dataContainer)
            //Delay task execution until the keyboard component hides and focus is cleared
            Handler(Looper.getMainLooper()).postDelayed({
                task?.onExecute()
            }, AMActionDelay.SHORT.millis)
        } else {
            AMLog.onEDebugLog("不在目标app，任务暂停1")
            amContext.processListener?.onProcessTaskPause(false)
        }
    }

    /**
 * Helper listener
     * */
    fun observeAccessibilityEventInTask(isInTargetApp: Boolean, event: AccessibilityEvent) {
        if (amContext.taskManager.taskState != AMTaskState.STOP) {
            if (isInTargetApp == isRecordInWx) {
                return
            }
            if (isInTargetApp) {
                //Task is running
            } else {
                //Pause task
                AMLog.onEDebugLog("不在目标App，任务暂停2")
                amContext.processListener?.onProcessTaskPause(false)
            }
            isRecordInWx = isInTargetApp
        }
    }

    /**
 * Task status changed
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
 * Real task status change callback
 * */
interface AMTaskChangedListener {
    //Status changed
    fun onChanged()
}
