package com.coremate.opengui.automation.base.task

import androidx.annotation.CallSuper
import com.coremate.opengui.automation.base.data.AMDataContainer
import com.coremate.opengui.automation.base.utils.AMLog

/**
 * 步骤
 * */
internal abstract class AMBaseStep<T : AMBaseStepHelper>(
    val index: Int,
    protected val helper: T,
) {

    //是否需要分发子步骤的功能
    open val isDispatcher = false

    //子步骤索引
    protected var subStepIndex = 4

    /**
     * 执行主步骤
     *  @param data 数据
     *  @param isResume 是否恢复
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
     * 执行子步骤
     * @param subStep 子步骤
     * @param data 数据
     * @param
     * @return Pair<isIsIntercept,isCanNext>
     * */
    fun onExecuteSubStep(
        subStep: AMBaseStep<*>?,
        data: AMDataContainer? = null
    ): Pair<Boolean, Boolean> {
        //是否可以进行下一步
        var isCanNext = true
        //是否被拦截
        var isIsIntercept = false
        subStep?.onExecute(data)?.let {
            //记录子步骤索引
            subStepIndex = it.index
            //赋值
            isCanNext = it.isCanNext
            isIsIntercept = it.isIntercept
            //判断出错
            if (!isCanNext) {
                AMLog.onEDebugLog("第${it.index}步出错")
            }
        }
        return Pair(isIsIntercept, isCanNext)
    }

    /**
     * 执行子步骤扩展
     * @param subStep 子步骤
     * @param data 数据
     * @param
     * @return Pair<isIsIntercept,isCanNext>
     * */
    fun onExecuteSubStepExt(
        subStep: AMBaseStep<*>?,
        data: AMDataContainer? = null
    ): Triple<Boolean, Boolean, Any?> {
        //是否可以进行下一步
        var isCanNext = true
        //是否被拦截
        var isIsIntercept = false
        var extra: Any? = null
        subStep?.onExecute(data)?.let {
            //记录子步骤索引
            subStepIndex = it.index
            //赋值
            isCanNext = it.isCanNext
            isIsIntercept = it.isIntercept
            extra = it.extra
            //判断出错
            if (!isCanNext) {
                AMLog.onEDebugLog("第${it.index}步出错")
            }
        }
        return Triple(isIsIntercept, isCanNext, extra)
    }

    //释放
    abstract fun onDestroy()
}

/**
 * 条件判断
 * @param index 当步骤
 * @param isIntercept 是否拦截
 * @param isCanNext 是否可以进行下一步
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


