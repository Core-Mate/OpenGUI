package com.coremate.opengui.automation.biz.tasks.common.check.steps.red.steps

import android.view.accessibility.AccessibilityNodeInfo
import com.coremate.opengui.automation.base.AMCore
import com.coremate.opengui.automation.base.data.AMDataContainer
import com.coremate.opengui.automation.base.task.AMBaseStep
import com.coremate.opengui.automation.base.task.AMStepCondition
import com.coremate.opengui.automation.base.utils.AMActionDelay
import com.coremate.opengui.automation.base.utils.AMEventUtils
import com.coremate.opengui.automation.base.utils.AMNodeUtils
import com.coremate.opengui.automation.base.utils.Something
import com.coremate.opengui.automation.biz.common.node.red.IAMWidgetRed
import com.coremate.opengui.automation.biz.tasks.common.check.steps.red.AMRedAutoReplyHelper

/**
 * Step 7:Auto-reply
 */
internal class AMRedAutoReplyStep7(index: Int, helper: AMRedAutoReplyHelper) :
    AMBaseStep<AMRedAutoReplyHelper>(index, helper) {

    override fun onExecute(data: AMDataContainer?, isResume: Boolean): AMStepCondition {
        val condition = super.onExecute(data, isResume)
        if (condition.isIntercept) {
            return condition
        }
        if (!helper.isOngoing()) {
            condition.isCanNext = false
            return condition
        }

        AMEventUtils.sleep(AMActionDelay.SHORT)
        //Input field node
        var editNode: AccessibilityNodeInfo? = null
        AMEventUtils.reProcessUntilOk(
            helper,
            3,
            AMActionDelay.MIDDLE,
            object : Something<Boolean> {
                override fun judgmentSuccess(result: Boolean): Boolean {
                    return result
                }

                override fun work(timeIndex: Int): Boolean {
                    val rootNode = AMCore.instance.amContext?.rootNode() ?: return false
                    editNode = AMNodeUtils.getFirstNodeById(
                        rootNode,
                        IAMWidgetRed.chatEdit().resourceId,
                    )
                    return editNode != null
                }
            },
        ).dealWith { isSuc, intercept ->
            if (!isSuc) {
                condition.isCanNext = false
                return condition
            }
        }
        AMEventUtils.sleep(AMActionDelay.MIDDLE)

        if (AMEventUtils.setTextToEditText(editNode, helper.replyContent)) {
            AMEventUtils.sleep(AMActionDelay.SHORT)
            var sendNodeInfo: AccessibilityNodeInfo? = null
            AMEventUtils.reProcessUntilOk(
                helper,
                3,
                AMActionDelay.MIDDLE,
                object : Something<Boolean> {
                    override fun judgmentSuccess(result: Boolean) = result

                    override fun work(timeIndex: Int): Boolean {
                        val rootNode = AMCore.instance.amContext?.rootNode() ?: return false
                        sendNodeInfo =
                            AMNodeUtils.getFirstNodeById(
                                rootNode,
                                IAMWidgetRed.sendBtn().resourceId
                            )
                        return AMEventUtils.clickFirstClickableParentWithSimulate(
                            sendNodeInfo,
                            helper
                        )
                    }
                }).dealWith { isSuc, intercept ->
                if (!isSuc) {
                    condition.isCanNext = false
                }
            }
        } else {
            condition.isCanNext = false
        }


        return condition
    }


    override fun onDestroy() {
    }

}