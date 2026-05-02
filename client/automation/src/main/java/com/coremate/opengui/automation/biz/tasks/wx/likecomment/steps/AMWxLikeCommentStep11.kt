package com.coremate.opengui.automation.biz.tasks.wx.likecomment.steps

import android.graphics.Rect
import android.view.accessibility.AccessibilityNodeInfo
import com.coremate.opengui.automation.base.data.AMDataContainer
import com.coremate.opengui.automation.base.task.AMBaseStep
import com.coremate.opengui.automation.base.task.AMStepCondition
import com.coremate.opengui.automation.base.utils.AMActionDelay
import com.coremate.opengui.automation.base.utils.AMEventUtils
import com.coremate.opengui.automation.base.utils.AMNodeUtils
import com.coremate.opengui.automation.base.utils.Something
import com.coremate.opengui.automation.biz.common.node.wx.IAMWidgetWX
import com.coremate.opengui.automation.biz.tasks.wx.likecomment.AMWxLikeCommentHelper
import com.coremate.opengui.automation.biz.tasks.wx.likecomment.bean.AMWxLikeCommentEventType

/**
 * Step 11:comment 4, swipe current Moment to top
 */
internal class AMWxLikeCommentStep11(index: Int, helper: AMWxLikeCommentHelper) :
    AMBaseStep<AMWxLikeCommentHelper>(index, helper) {

    override fun onExecute(data: AMDataContainer?, isResume: Boolean): AMStepCondition {
        val condition = super.onExecute(data, isResume)
        if (condition.isIntercept) {
            return condition
        }

        if (helper.param?.count == helper.sucCount + 1) {
            return condition
        }

        if (helper.param?.eventType == AMWxLikeCommentEventType.COMMENT || helper.param?.eventType == AMWxLikeCommentEventType.LIKE_AND_COMMENT) {
            //Check whether the more button is on screen
            AMEventUtils.sleep(AMActionDelay.MIDDLE)
            val nodeInfo = data?.bean as AccessibilityNodeInfo
            AMEventUtils.reProcessUntilOk(
                helper,
                10,
                AMActionDelay.SHORT,
                object : Something<Boolean> {
                    override fun judgmentSuccess(result: Boolean): Boolean {
                        return result
                    }

                    override fun work(timeIndex: Int): Boolean {
                        //Get the more button and tap it
                        val btnNode = AMNodeUtils.getFirstNodeById(
                            nodeInfo,
                            IAMWidgetWX.fcMoreBtn().resourceId
                        ) ?: return false
                        val rect = Rect()
                        btnNode.getBoundsInScreen(rect)
                        if ((rect.top + 100) > 250) {
                            AMEventUtils.doSwipeSmallUp(helper.listNode, helper, 30f)
                            return false
                        } else {
                            return true
                        }
                    }
                }, isInterruptIgnore = false
            ).dealWith { isSuc, intercept ->
                if (!isSuc) {
                    return condition
                }
            }
        }

        return condition
    }

    override fun onDestroy() {
    }
}