package com.coremate.opengui.automation.base.task

import androidx.annotation.CallSuper
import com.coremate.opengui.automation.base.context.AMContext
import com.coremate.opengui.automation.base.data.AMDataContainer
import com.coremate.opengui.automation.base.utils.AMUtils
import java.util.concurrent.LinkedBlockingQueue
import java.util.concurrent.ThreadPoolExecutor
import java.util.concurrent.ThreadPoolExecutor.DiscardPolicy
import java.util.concurrent.TimeUnit

/**
 * 任务基类
 * */
internal abstract class AMBaseTask<T : AMBaseStepHelper>(val amContext: AMContext) {

    protected var helper: T = AMUtils.getT(this, 0) as T

    init {
        //上下文
        helper.amContext = amContext
        //线程池
        helper.executorService = ThreadPoolExecutor(
            1,
            1,
            0L,
            TimeUnit.MILLISECONDS,
            LinkedBlockingQueue(),
            amContext.threadFactory,
            DiscardPolicy()
        )
    }

    /**
     * 任务初始化
     * */
    abstract fun initTaskAndData(dataContainer: AMDataContainer?)


    /**
     * 任务执行(子线程)
     * */
    open fun onExecute() {
        helper.onStartStep()
    }

    /**
     * 任务状态改变
     * */
    fun onObserveTaskStateChanged(isStopThrows: Boolean) {
        helper.onNotifyTaskStateChanged(isStopThrows)
    }

    /**
     * 任务销毁
     * */
    @CallSuper
    open fun onDestroy() {
        helper.onDestroy()
    }

}
