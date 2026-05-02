package com.coremate.opengui.automation.biz.tasks.wx.likecomment.steps

import android.view.accessibility.AccessibilityNodeInfo
import com.google.android.accessibility.selecttospeak.SelectToSpeakService
import com.coremate.opengui.automation.base.AMCore
import com.coremate.opengui.automation.base.data.AMDataContainer
import com.coremate.opengui.automation.base.exception.AMTaskException
import com.coremate.opengui.automation.base.task.AMBaseStep
import com.coremate.opengui.automation.base.task.AMStepCondition
import com.coremate.opengui.automation.base.utils.AMActionDelay
import com.coremate.opengui.automation.base.utils.AMEventUtils
import com.coremate.opengui.automation.base.utils.AMNodeUtils
import com.coremate.opengui.automation.base.utils.MatchCallback
import com.coremate.opengui.automation.base.utils.Something
import com.coremate.opengui.automation.biz.common.event.IAMPageEvent
import com.coremate.opengui.automation.biz.common.event.wx.AMWxPageEvent
import com.coremate.opengui.automation.biz.common.node.wx.IAMWidgetWX
import com.coremate.opengui.automation.biz.tasks.wx.likecomment.AMWxLikeCommentHelper
import com.coremate.opengui.automation.biz.tasks.wx.likecomment.bean.AMWxLikeCommentEventType

/**
 * Step 10:comment 3
 */
internal class AMWxLikeCommentStep10(index: Int, helper: AMWxLikeCommentHelper) :
    AMBaseStep<AMWxLikeCommentHelper>(index, helper) {

    override fun onExecute(data: AMDataContainer?, isResume: Boolean): AMStepCondition {
        val condition = super.onExecute(data, isResume)
        if (condition.isIntercept) {
            return condition
        }


        if (helper.param?.eventType == AMWxLikeCommentEventType.COMMENT || helper.param?.eventType == AMWxLikeCommentEventType.LIKE_AND_COMMENT) {
            AMEventUtils.sleep(AMActionDelay.MIDDLE)
            val nodeInfo = data?.bean as AccessibilityNodeInfo
            //Tap comment button
            AMEventUtils.reProcessUntilOk(
                helper,
                3,
                AMActionDelay.SHORT,
                object : Something<Boolean> {
                    override fun judgmentSuccess(result: Boolean): Boolean {
                        return result
                    }

                    override fun work(timeIndex: Int): Boolean {
                        //Get the more button
                        val btnNode = AMNodeUtils.getFirstNodeById(
                            nodeInfo,
                            IAMWidgetWX.fcMoreBtn().resourceId
                        ) ?: return false
                        return AMEventUtils.doClickDownByX(btnNode, helper, x = -90f)
                    }
                }).dealWith { isSuc, intercept ->
                if (!isSuc) {
                    return condition
                }
            }
            AMEventUtils.sleep(AMActionDelay.MIDDLE)
            AMEventUtils.sleep(AMActionDelay.MINI)
            //Tap and enter comment content
            AMEventUtils.reProcessUntilOk(
                helper,
                3,
                AMActionDelay.SHORT,
                object : Something<Boolean> {
                    override fun judgmentSuccess(result: Boolean): Boolean {
                        return result
                    }

                    override fun work(timeIndex: Int): Boolean {
                        val editInfo = AMNodeUtils.getFirstNodeByIdWithCallback(
                            AMCore.instance.amContext?.rootNode(),
                            object :
                                MatchCallback<AccessibilityNodeInfo> {
                                override fun isMatch(result: AccessibilityNodeInfo?): Boolean {
                                    return result?.className?.toString() == IAMWidgetWX.fcListCommentEdit().classCame
                                }
                            },
                            IAMWidgetWX.fcListCommentEdit().resourceId
                        ) ?: return false
                        return AMEventUtils.setTextToEditText(editInfo, helper.tempCommentText)
                    }
                }).dealWith { isSuc, intercept ->
                if (!isSuc) {
                    return condition
                }
            }
            AMEventUtils.reProcessUntilOk(
                helper,
                3,
                AMActionDelay.SHORT,
                object : Something<Boolean> {
                    override fun judgmentSuccess(result: Boolean): Boolean {
                        return result
                    }

                    override fun work(timeIndex: Int): Boolean {
                        val sendNode = AMNodeUtils.getFirstNodeByIdWithCallback(
                            AMCore.instance.amContext?.rootNode(),
                            object :
                                MatchCallback<AccessibilityNodeInfo> {
                                override fun isMatch(result: AccessibilityNodeInfo?): Boolean {
                                    return result?.className?.toString() == IAMWidgetWX.fcListCommentSend().classCame
                                }
                            },
                            IAMWidgetWX.fcListCommentSend().resourceId
                        ) ?: return false
                        return AMEventUtils.clickFirstClickableParentWithSimulate(sendNode, helper)
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