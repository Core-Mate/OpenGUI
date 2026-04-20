package com.coremate.opengui.automation.biz.tasks.common.check.steps.wx.steps

import android.view.accessibility.AccessibilityNodeInfo
import android.widget.EditText
import com.coremate.opengui.automation.base.AMCore
import com.coremate.opengui.automation.base.data.AMDataContainer
import com.coremate.opengui.automation.base.task.AMBaseStep
import com.coremate.opengui.automation.base.task.AMStepCondition
import com.coremate.opengui.automation.base.utils.AMActionDelay
import com.coremate.opengui.automation.base.utils.AMEventUtils
import com.coremate.opengui.automation.base.utils.AMNodeUtils
import com.coremate.opengui.automation.base.utils.Something
import com.coremate.opengui.automation.biz.common.event.IAMPageEvent
import com.coremate.opengui.automation.biz.common.node.wx.IAMWidgetWX
import com.coremate.opengui.automation.biz.tasks.common.check.steps.wx.AMWxAutoReplyHelper

/**
 * 第7步：自动回复
 */
internal class AMWxAutoReplyStep7(index: Int, helper: AMWxAutoReplyHelper) :
    AMBaseStep<AMWxAutoReplyHelper>(index, helper) {

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
        //输入框节点
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
                    editNode = AMNodeUtils.getNodeByClassName(
                        rootNode,
                        EditText::class.java.name,
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
                            AMNodeUtils.getFirstNodeById(rootNode, IAMWidgetWX.sendBtn().resourceId)
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