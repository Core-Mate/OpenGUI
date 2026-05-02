package com.coremate.opengui.automation.base.task

import androidx.annotation.CallSuper
import com.coremate.opengui.automation.base.data.AMDataContainer
import com.coremate.opengui.automation.base.utils.AMLog

/**
 * Step
 * */
internal abstract class AMBaseStep<T : AMBaseStepHelper>(
    val index: Int,
    protected val helper: T,
) {

    //Whether substep dispatch is needed
    open val isDispatcher = false

    //Substep index
    protected var subStepIndex = 4

    /**
 * Execute main step
 * @param data data
 * @param is Resume whether this is a resume
     * */
    @CallSuper
    open fun onExecute(
        data: AMDataContainer? = null,
        isResume: Boolean = false,
    ): AMStepCondition {

        helper.setStepIndex = index
        val logPrifix = if (isResume) "恢复" else ""
        if (isDispatcher) {
            AMLog.onEDebugLog("${logPrifix}开始执行第${index}步,进行子任务分发")
        } else {
            AMLog.onEDebugLog("${logPrifix}开始执行第${index}步")
        }
        if (helper.isTaskPauseOrStop()) {
            AMLog.onEDebugLog("${logPrifix}任务停止在第${index}步 - 步骤执行前")
            return AMStepCondition.createIntercept(index)
        }
        return AMStepCondition.createPass(index)
    }

    /**
 * Execute substep
 * @param subStep substep
 * @param data data
     * @param
     * @return Pair<isIsIntercept,isCanNext>
     * */
    fun onExecuteSubStep(
        subStep: AMBaseStep<*>?,
        data: AMDataContainer? = null
    ): Pair<Boolean, Boolean> {
        //Whether the next step can proceed
        var isCanNext = true
        //Whether intercepted
        var isIsIntercept = false
        subStep?.onExecute(data)?.let {
            //RecordSubstep index
            subStepIndex = it.index
            //Assign value
            isCanNext = it.isCanNext
            isIsIntercept = it.isIntercept
            //Check for errors
            if (!isCanNext) {
                AMLog.onEDebugLog("第${it.index}步出错")
            }
        }
        return Pair(isIsIntercept, isCanNext)
    }

    /**
 * Execute substep extension
 * @param subStep substep
 * @param data data
     * @param
     * @return Pair<isIsIntercept,isCanNext>
     * */
    fun onExecuteSubStepExt(
        subStep: AMBaseStep<*>?,
        data: AMDataContainer? = null
    ): Triple<Boolean, Boolean, Any?> {
        //Whether the next step can proceed
        var isCanNext = true
        //Whether intercepted
        var isIsIntercept = false
        var extra: Any? = null
        subStep?.onExecute(data)?.let {
            //RecordSubstep index
            subStepIndex = it.index
            //Assign value
            isCanNext = it.isCanNext
            isIsIntercept = it.isIntercept
            extra = it.extra
            //Check for errors
            if (!isCanNext) {
                AMLog.onEDebugLog("第${it.index}步出错")
            }
        }
        return Triple(isIsIntercept, isCanNext, extra)
    }

    //Release
    abstract fun onDestroy()
}

/**
 * Condition check
 * @param index current step
 * @param is Intercept whether intercepted
 * @param is Can Next Whether the next step can proceed
 * */
class AMStepCondition private constructor(
    val index: Int,
    var isIntercept: Boolean,
    var isCanNext: Boolean = true
) {
    var extra: Any? = null

    companion object {
        fun createPass(index: Int) = AMStepCondition(index, false)
        fun createIntercept(index: Int) = AMStepCondition(index, true)
    }

    fun interceptted() = apply {
        isIntercept = true
    }
}


