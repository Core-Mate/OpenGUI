package com.coremate.opengui.automation.biz.tasks.common.check.steps.tk.steps

import com.google.android.accessibility.selecttospeak.SelectToSpeakService
import com.coremate.opengui.automation.base.data.AMDataContainer
import com.coremate.opengui.automation.base.task.AMBaseStep
import com.coremate.opengui.automation.base.task.AMStepCondition
import com.coremate.opengui.automation.base.utils.AMActionDelay
import com.coremate.opengui.automation.base.utils.AMEventUtils
import com.coremate.opengui.automation.base.utils.AMLog
import com.coremate.opengui.automation.base.utils.AMNodeUtils
import com.coremate.opengui.automation.biz.common.event.IAMPageEvent
import com.coremate.opengui.automation.biz.common.event.tk.AMTkPageEvent
import com.coremate.opengui.automation.biz.common.node.tk.IAMWidgetTK
import com.coremate.opengui.automation.biz.tasks.common.check.steps.tk.AMTkAutoReplyHelper

/**
 * Step 4:Dispatch subtasks
 */
internal class AMTkAutoReplyStep4(index: Int, helper: AMTkAutoReplyHelper) :
    AMBaseStep<AMTkAutoReplyHelper>(index, helper) {

    override val isDispatcher: Boolean
        get() = true

    //Record loop filter index
    private var tempIndex = 0

    init {
        subStepIndex = 5
    }


    override fun onExecute(data: AMDataContainer?, isResume: Boolean): AMStepCondition {
        val condition = super.onExecute(data, isResume)
        if (condition.isIntercept || !helper.isOngoing()) {
            return condition
        }

        SelectToSpeakService.service?.changeAccessibilityFlags(false)
        AMEventUtils.sleep(AMActionDelay.SHORT)

        var isCanNext = true
        for (i in 0 until helper.tempNodeList.size) {
            if (condition.isIntercept || !helper.isOngoing()) {
                return condition
            }
            if (i >= tempIndex) {
                val nodeInfo = helper.tempNodeList[i]
                AMLog.onEDebugLog("当前子步骤${subStepIndex}")
                //Step 5 - Tap to enter
                if (subStepIndex == 5) {
                    val nameInfo = AMNodeUtils.getFirstNodeById(
                        nodeInfo,
                        IAMWidgetTK.contactNickName().resourceId
                    )
                    helper.nickName = nameInfo?.text.toString()
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

                //Step 6 - Pass parameters to AI and get comment
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

                //Step 7 - Auto-reply
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

                //Return to message list
                AMTkPageEvent.backTKChatListPage(object : IAMPageEvent.IAMTaskCallBack {
                    override fun action(): Boolean {
                        return helper.isTaskPauseOrStop() || !helper.isOngoing()
                    }
                }, helper)


                subStepIndex = 5
                //Increment filter index
                tempIndex++
            }
        }
        AMEventUtils.sleep(AMActionDelay.MIDDLE)
        helper.executorService.execute {
            //Return to step 3
            tempIndex = 0
            AMLog.onEDebugLog("回到第3步")
            helper.thirdStep()?.onExecute(data = AMDataContainer().withExtra(true))
        }
        return condition
    }

    override fun onDestroy() {
    }


}