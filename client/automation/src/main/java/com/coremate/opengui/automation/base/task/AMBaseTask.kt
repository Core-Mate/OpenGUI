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
 * Base task class
 * */
internal abstract class AMBaseTask<T : AMBaseStepHelper>(val amContext: AMContext) {

    protected var helper: T = AMUtils.getT(this, 0) as T

    init {
        //Context
        helper.amContext = amContext
        //Thread pool
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
 * Initialize task
     * */
    abstract fun initTaskAndData(dataContainer: AMDataContainer?)


    /**
 * Execute task on background thread
     * */
    open fun onExecute() {
        helper.onStartStep()
    }

    /**
 * Task status changed
     * */
    fun onObserveTaskStateChanged(isStopThrows: Boolean) {
        helper.onNotifyTaskStateChanged(isStopThrows)
    }

    /**
 * Destroy task
     * */
    @CallSuper
    open fun onDestroy() {
        helper.onDestroy()
    }

}
