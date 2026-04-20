package com.coremate.opengui.automation.biz.tasks.wx.likecomment.steps

import android.graphics.Rect
import android.view.accessibility.AccessibilityNodeInfo
import com.coremate.opengui.automation.base.data.AMDataContainer
import com.coremate.opengui.automation.base.task.AMBaseStep
import com.coremate.opengui.automation.base.task.AMStepCondition
import com.coremate.opengui.automation.base.utils.AMActionDelay
import com.coremate.opengui.automation.base.utils.AMEventUtils
import com.coremate.opengui.automation.base.utils.AMLog
import com.coremate.opengui.automation.base.utils.AMNodeUtils
import com.coremate.opengui.automation.base.utils.AMScreenUtils
import com.coremate.opengui.automation.base.utils.Something
import com.coremate.opengui.automation.biz.common.node.wx.IAMWidgetWX
import com.coremate.opengui.automation.biz.tasks.wx.likecomment.AMWxLikeCommentHelper
import com.coremate.opengui.automation.biz.tasks.wx.likecomment.bean.AMWxLikeCommentEventType

/**
 * 第5步：检测更多按钮位置
 */
internal class AMWxLikeCommentStep5(index: Int, helper: AMWxLikeCommentHelper) :
    AMBaseStep<AMWxLikeCommentHelper>(index, helper) {

    override fun onExecute(data: AMDataContainer?, isResume: Boolean): AMStepCondition {
        val condition = super.onExecute(data, isResume)
        if (condition.isIntercept) {
            return condition
        }
        AMEventUtils.sleep(AMActionDelay.SHORT)
        //判断更多按钮是否在屏幕内
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
                    //获取更多按钮并点击
                    val btnNode = AMNodeUtils.getFirstNodeById(
                        nodeInfo,
                        IAMWidgetWX.fcMoreBtn().resourceId
                    ) ?: return false
                    val rect = Rect()
                    btnNode.getBoundsInScreen(rect)
                    if ((rect.top + 100) > AMScreenUtils.screenHeight()) {
                        AMEventUtils.doSwipeSmallUp(helper.listNode, helper,60f)
                        return false
                    } else {
                        return true
                    }
                }
            }).dealWith { isSuc, intercept ->
            if (!isSuc) {
                return condition
            }
        }
        return condition
    }


    override fun onDestroy() {
    }
}