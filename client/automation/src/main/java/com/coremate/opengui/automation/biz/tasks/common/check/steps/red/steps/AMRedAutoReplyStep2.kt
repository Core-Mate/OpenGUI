package com.coremate.opengui.automation.biz.tasks.common.check.steps.red.steps

import com.coremate.opengui.automation.base.AMCore
import com.coremate.opengui.automation.base.data.AMDataContainer
import com.coremate.opengui.automation.base.task.AMBaseStep
import com.coremate.opengui.automation.base.task.AMStepCondition
import com.coremate.opengui.automation.base.utils.AMActionDelay
import com.coremate.opengui.automation.base.utils.AMEventUtils
import com.coremate.opengui.automation.base.utils.AMNodeUtils
import com.coremate.opengui.automation.biz.common.node.red.IAMWidgetRed
import com.coremate.opengui.automation.biz.tasks.common.check.steps.red.AMRedAutoReplyHelper

/**
 * 第2步：监控微信未读消息数
 */
internal class AMRedAutoReplyStep2(index: Int, helper: AMRedAutoReplyHelper) :
    AMBaseStep<AMRedAutoReplyHelper>(index, helper) {

    override fun onExecute(data: AMDataContainer?, isResume: Boolean): AMStepCondition {
        val condition = super.onExecute(data, isResume)
        if (condition.isIntercept || !helper.isOngoing()) {
            return condition
        }
        AMEventUtils.sleep(AMActionDelay.MIDDLE)
        helper.commonHelper?.setReplying(false)
        if (helper.commonHelper?.isHasFinish == true) {
            ///完成
            helper.commonHelper?.amContext?.processListener?.onProcessTaskFinish(
                true,
                System.currentTimeMillis() - (helper.commonHelper?.startTime ?: 0),
            )
            return condition
        }
        while (true) {
            if (!helper.isOngoing() || helper.isTaskPauseOrStop()) {
                return condition
            }
            val rootNode = AMCore.instance.amContext?.rootNode()
            val unReadNode =
                AMNodeUtils.getFirstNodeById(rootNode, IAMWidgetRed.unReadText().resourceId)
            if (unReadNode != null && unReadNode.text != null && unReadNode.text.toString()
                    .isNotEmpty() && unReadNode.text.toString().toInt() > 0
            ) {
                helper.executorService.execute {
                    if (helper.isOngoing()) {
                        helper.commonHelper?.setReplying(true)
                        helper.thirdStep()?.onExecute()
                    }
                }
                return condition
            }
        }
    }


    override fun onDestroy() {
    }

}