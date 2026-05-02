package com.coremate.opengui.automation.biz.tasks.wx.likecomment.steps

import com.coremate.opengui.automation.base.data.AMDataContainer
import com.coremate.opengui.automation.base.task.AMBaseStep
import com.coremate.opengui.automation.base.task.AMStepCondition
import com.coremate.opengui.automation.base.utils.AMLog
import com.coremate.opengui.automation.biz.tasks.wx.likecomment.AMWxLikeCommentHelper

/**
 * Step 4:Task dispatch
 */
internal class AMWxLikeCommentStep4(index: Int, helper: AMWxLikeCommentHelper) :
    AMBaseStep<AMWxLikeCommentHelper>(index, helper) {

    override val isDispatcher: Boolean
        get() = true

    //Record loop filter index
    private var tempIndex = 0

    init {
        subStepIndex = 5
    }

    override fun onExecute(data: AMDataContainer?, isResume: Boolean): AMStepCondition {
        val condition = super.onExecute(data, isResume)
        if (condition.isIntercept) {
            return condition
        }

        var isCanNext = true
        for (i in 0 until helper.tempNodeList.size) {
            if (i >= tempIndex) {
                val nodeInfo = helper.tempNodeList[i]
                AMLog.onEDebugLog("当前子步骤${subStepIndex}")
                //Step 5 - Check
                if (subStepIndex == 5) {
                    isCanNext =
                        onExecuteSubStep(
                            helper.fiveStep(),
                            AMDataContainer(bean = nodeInfo)
                        ).also {
                            if (it.first) {
                                return condition
                            }
                        }.second

                }

                //Step 6 - like 1
                if (subStepIndex in 5..6 && isCanNext) {
                    isCanNext =
                        onExecuteSubStep(
                            helper.sixStep(),
                            AMDataContainer(bean = nodeInfo).withExtra(i)
                        ).also {
                            if (it.first) {
                                return condition
                            }
                        }.second
                }

                //Step 7 - like 2
                if (subStepIndex in 5..7 && isCanNext) {
                    isCanNext =
                        onExecuteSubStep(
                            helper.sevenStep(),
                            AMDataContainer(bean = nodeInfo).withExtra(i)
                        ).also {
                            if (it.first) {
                                return condition
                            }
                        }.second
                }

                //Step 8 - comment 1
                if (subStepIndex in 5..8 && isCanNext) {
                    isCanNext =
                        onExecuteSubStep(
                            helper.eightStep(),
                            AMDataContainer(bean = nodeInfo).withExtra(i)
                        ).also {
                            if (it.first) {
                                return condition
                            }
                        }.second
                }
                //Step 9 - comment 2
                if (subStepIndex in 5..9 && isCanNext) {
                    isCanNext =
                        onExecuteSubStep(
                            helper.nineStep(),
                            AMDataContainer(bean = nodeInfo).withExtra(i)
                        ).also {
                            if (it.first) {
                                return condition
                            }
                        }.second
                }
                //Step 10 - comment 3
                if (subStepIndex in 5..10 && isCanNext) {
                    isCanNext =
                        onExecuteSubStep(
                            helper.tenStep(),
                            AMDataContainer(bean = nodeInfo).withExtra(i)
                        ).also {
                            if (it.first) {
                                return condition
                            }
                        }.second
                }
                //Step 11 - comment 4
                if (subStepIndex in 5..11 && isCanNext) {
                    isCanNext =
                        onExecuteSubStep(
                            helper.elevenStep(),
                            AMDataContainer(bean = nodeInfo).withExtra(i)
                        ).also {
                            if (it.first) {
                                return condition
                            }
                        }.second
                }
                //TODO: temporarily increment success count here
                helper.sucCount += 1

                if (helper.sucCount >= (helper.param?.count ?: 0)) {
                    helper.isFinish = true
                    break
                }
                subStepIndex = 5
                //Increment filter index
                tempIndex++
            }
        }

        //Return to step 3
        helper.executorService.execute {
            tempIndex = 0
            AMLog.onEDebugLog("回到第3步")
            helper.thirdStep()?.onExecute()
        }

        return condition
    }

    override fun onDestroy() {
    }
}