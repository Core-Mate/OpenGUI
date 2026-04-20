package com.coremate.opengui.automation.biz.tasks.wx.likecomment.steps

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
 * 第7步：点赞2
 */
internal class AMWxLikeCommentStep7(index: Int, helper: AMWxLikeCommentHelper) :
    AMBaseStep<AMWxLikeCommentHelper>(index, helper) {

    override fun onExecute(data: AMDataContainer?, isResume: Boolean): AMStepCondition {
        val condition = super.onExecute(data, isResume)
        if (condition.isIntercept) {
            return condition
        }


        if (helper.param?.eventType == AMWxLikeCommentEventType.LIKE || helper.param?.eventType == AMWxLikeCommentEventType.LIKE_AND_COMMENT) {
            val nodeInfo = data?.bean as AccessibilityNodeInfo
            AMEventUtils.sleep(AMActionDelay.LONG)



            AMEventUtils.reProcessUntilOk(
                helper,
                3,
                AMActionDelay.SHORT,
                object : Something<Boolean> {
                    override fun judgmentSuccess(result: Boolean): Boolean {
                        return result
                    }

                    override fun work(timeIndex: Int): Boolean {
                        //获取更多按钮
                        val btnNode = AMNodeUtils.getFirstNodeById(
                            nodeInfo,
                            IAMWidgetWX.fcMoreBtn().resourceId
                        ) ?: return false
                        //点赞
                        return AMEventUtils.doClickDownByX(btnNode, helper, x = -250f)
                    }
                }).dealWith { isSuc, intercept ->
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