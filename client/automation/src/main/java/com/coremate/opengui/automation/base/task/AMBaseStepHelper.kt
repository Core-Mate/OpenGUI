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
 * 步骤辅助类
 * */
internal abstract class AMBaseStepHelper {

    //上下文
    lateinit var amContext: AMContext

    //当前任务状态
    private var curTaskState: AMTaskState? = null

    //主线程handler
    val mainHandler by lazy { Handler(Looper.getMainLooper()) }

    //任务开始时间
    var startTime: Long = 0

    //当前执行的步骤索引（默认从1开始）
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

    //所有步骤
    private var steps = mutableListOf<AMBaseStep<*>>()

    /**
     * 注册步骤
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
     * 开始执行步骤
     * */
    fun onStartStep() {
        executorService.execute {
            startTime = System.currentTimeMillis()
            firstStep()?.onExecute()
        }
    }

    /**
     * 任务状态改变
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
                        //抛出异常
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
                    //抛出异常
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
     * 获取第一步
     * */
    fun firstStep() = this[0]

    /**
     * 获取第二步
     * */
    fun secondStep() = this[1]

    /**
     * 获取第三步
     * */
    fun thirdStep() = this[2]

    /**
     * 获取第四步
     * */
    fun forthStep() = this[3]

    /**
     * 获取第五步
     * */
    fun fiveStep() = this[4]

    /**
     * 获取第六步
     * */
    fun sixStep() = this[5]

    /**
     * 获取第七步
     * */
    fun sevenStep() = this[6]

    /**
     * 获取第八步
     * */
    fun eightStep() = this[7]

    /**
     * 获取第九步
     * */
    fun nineStep() = this[8]

    /**
     * 获取第十步
     * */
    fun tenStep() = this[9]

    /**
     * 获取第十一步
     * */
    fun elevenStep() = this[10]

    /**
     * 获取第十二步
     * */
    fun twelveStep() = this[11]

    /**
     * 获取第13步
     * */
    fun thirteenStep() = this[12]

    /**
     * 获取第14步
     * */
    fun fourteenStep() = this[13]

    /**
     * 获取第15步
     * */
    fun fifteenStep() = this[14]

    /**
     * 获取第16步
     * */
    fun sixteenStep() = this[15]

    /**
     * 获取第17步
     * */
    fun seventeenStep() = this[16]

    /**
     * 获取第18步
     * */
    fun eightTeenStep() = this[17]

    /**
     * 获取第n步
     * */
    protected operator fun get(index: Int): AMBaseStep<*>? =
        if (index < steps.size) steps[index] else null

    /**
     * 任务是否暂停或者停止
     * */
    fun isTaskPauseOrStop(): Boolean {
        return amContext.taskManager.taskState == AMTaskState.PAUSE || amContext.taskManager.taskState == AMTaskState.STOP
    }

    /**
     * 任务是否停止
     * */
    fun isTaskStop(): Boolean {
        return amContext.taskManager.taskState == AMTaskState.STOP
    }

    /**
     * 主线程执行
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
     * 释放
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