package com.coremate.opengui.automation.base.task

import android.os.Handler
import android.os.Looper
import androidx.annotation.CallSuper
import com.coremate.opengui.automation.base.context.AMContext
import com.coremate.opengui.automation.base.exception.AMTaskException
import com.coremate.opengui.automation.base.utils.AMLog
import com.coremate.opengui.automation.base.utils.AMActionDelay
import java.util.concurrent.ThreadPoolExecutor
import kotlin.reflect.KClass

/**
 * Step Helper Class
 * */
internal abstract class AMBaseStepHelper {

    //Context
    lateinit var amContext: AMContext

    //Current task Status
    private var curTaskState: AMTaskState? = null

    //Main-thread handler
    val mainHandler by lazy { Handler(Looper.getMainLooper()) }

    //Task start time
    var startTime: Long = 0

    //Current step index, starting at 1 by default
    @Volatile
    var setStepIndex = 1
        set(value) {
            synchronized(this) {
                field = value
            }
        }

    val currentStep: Int
        get() = setStepIndex

    lateinit var executorService: ThreadPoolExecutor

    //All steps
    private var steps = mutableListOf<AMBaseStep<*>>()

    /**
 * Register Step
     * */
    fun registerSteps(vararg steps: KClass<*>) {
        AMLog.onEDebugLog("成功注册${steps.size}个步骤")
        steps.forEachIndexed { index, kClass ->
            val step = (kClass.constructors.first()
                .call(index + 1, this) as AMBaseStep<*>)
            this.steps.add(step)
        }
    }

    /**
 * Start execution Step
     * */
    fun onStartStep() {
        executorService.execute {
            startTime = System.currentTimeMillis()
            firstStep()?.onExecute()
        }
    }

    /**
 * Task status changed
     * */
    fun onNotifyTaskStateChanged(isStopThrows: Boolean) {

        if (curTaskState == AMTaskState.STOP) {
            AMLog.onEDebugLog("任务已经结束，不在处理步骤")
            return
        }

        when (amContext.taskManager.taskState) {
            AMTaskState.RESUME -> {
                if (curTaskState != AMTaskState.RESUME) {
                    executorService.execute {
                        AMLog.onEDebugLog("任务恢复")
                        amContext.taskManager.setTaskResume = true
                        onObserveTaskResume()
                    }
                } else {
                    AMLog.onEDebugLog("任务状态已经是恢复")
                }
            }

            AMTaskState.PAUSE -> {
                if (curTaskState != AMTaskState.PAUSE) {
                    executorService.execute {
                        AMLog.onEDebugLog("任务暂停")
                        amContext.taskManager.setTaskResume = false
                        //Throw exception
                        throw AMTaskException.pause()
                    }
                } else {
                    AMLog.onEDebugLog("任务状态已经是暂停")
                }
            }

            AMTaskState.STOP -> {
                executorService.execute {
                    AMLog.onEDebugLog("任务结束")
                    amContext.taskManager.setTaskResume = false
                    //Throw exception
                    if (isStopThrows) {
                        throw AMTaskException.stop()
                    }
                }
            }

            else -> {}
        }
        synchronized(this) {
            curTaskState = amContext.taskManager.taskState
        }

    }

    protected abstract fun onObserveTaskResume()

    /**
 * Get Step 1
     * */
    fun firstStep() = this[0]

    /**
 * Get Step 2
     * */
    fun secondStep() = this[1]

    /**
 * Get Step 3
     * */
    fun thirdStep() = this[2]

    /**
 * Get Step 4
     * */
    fun forthStep() = this[3]

    /**
 * Get Step 5
     * */
    fun fiveStep() = this[4]

    /**
 * Get Step 6
     * */
    fun sixStep() = this[5]

    /**
 * Get Step 7
     * */
    fun sevenStep() = this[6]

    /**
 * Get Step 8
     * */
    fun eightStep() = this[7]

    /**
 * Get Step 9
     * */
    fun nineStep() = this[8]

    /**
 * Get Step 10
     * */
    fun tenStep() = this[9]

    /**
 * Get Step 11
     * */
    fun elevenStep() = this[10]

    /**
 * Get step 12
     * */
    fun twelveStep() = this[11]

    /**
 * Get Step 13
     * */
    fun thirteenStep() = this[12]

    /**
 * Get Step 14
     * */
    fun fourteenStep() = this[13]

    /**
 * Get Step 15
     * */
    fun fifteenStep() = this[14]

    /**
 * Get Step 16
     * */
    fun sixteenStep() = this[15]

    /**
 * Get Step 17
     * */
    fun seventeenStep() = this[16]

    /**
 * Get Step 18
     * */
    fun eightTeenStep() = this[17]

    /**
 * Get step n
     * */
    protected operator fun get(index: Int): AMBaseStep<*>? =
        if (index < steps.size) steps[index] else null

    /**
 * Whether the task is paused or stopped
     * */
    fun isTaskPauseOrStop(): Boolean {
        return amContext.taskManager.taskState == AMTaskState.PAUSE || amContext.taskManager.taskState == AMTaskState.STOP
    }

    /**
 * Whether the task is stopped
     * */
    fun isTaskStop(): Boolean {
        return amContext.taskManager.taskState == AMTaskState.STOP
    }

    /**
 * Run on main thread
     * */
    inline fun postMainHandler(crossinline action: () -> Unit, delay: AMActionDelay? = null) {
        if (delay != null) {
            mainHandler.postDelayed({
                action()
            }, delay.millis)
        } else {
            mainHandler.post {
                action()
            }
        }
    }

    /**
 * Release
     * */
    @CallSuper
    open fun onDestroy() {
        steps.forEach {
            it.onDestroy()
        }
        steps.clear()
        if (::executorService.isInitialized) {
            executorService.shutdown()
        }
    }

}