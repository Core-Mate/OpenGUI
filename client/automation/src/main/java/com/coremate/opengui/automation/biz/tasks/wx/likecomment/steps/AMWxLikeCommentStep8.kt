package com.coremate.opengui.automation.biz.tasks.wx.likecomment.steps

import com.coremate.opengui.automation.base.data.AMDataContainer
import com.coremate.opengui.automation.base.task.AMBaseStep
import com.coremate.opengui.automation.base.task.AMStepCondition
import com.coremate.opengui.automation.base.utils.AMActionDelay
import com.coremate.opengui.automation.base.utils.AMEventUtils
import com.coremate.opengui.automation.base.utils.AMLog
import com.coremate.opengui.automation.biz.tasks.wx.likecomment.AMWxLikeCommentHelper
import com.coremate.opengui.automation.biz.tasks.wx.likecomment.bean.AMWxLikeCommentEventType

/**
 * Step 8: comment 1 - upload screenshot
 */
internal class AMWxLikeCommentStep8(index: Int, helper: AMWxLikeCommentHelper) :
    AMBaseStep<AMWxLikeCommentHelper>(index, helper) {

    override fun onExecute(data: AMDataContainer?, isResume: Boolean): AMStepCondition {
        val condition = super.onExecute(data, isResume)
        if (condition.isIntercept) {
            return condition
        }
        if (helper.param?.eventType == AMWxLikeCommentEventType.COMMENT || helper.param?.eventType == AMWxLikeCommentEventType.LIKE_AND_COMMENT) {
            AMEventUtils.sleep(AMActionDelay.MIDDLE)

// helper.tempCommentText = "Like"
            var isCallBack = false
            AMLog.onEDebugLog("开始请求AI")
//            AMServiceManager.instance.cozeAIManager?.testScenario_WeChatMomentsComment(
//                onResult = { result ->
//                    isCallBack = true
//                    helper.tempCommentText = result ?: ""
//                }, onError = { _ ->
//                    isCallBack = true
//                    condition.isCanNext = false
//                }, helper.param?.wordNum ?: CommentLength.SHORT
//            )
            while (true) {
                if (helper.isTaskPauseOrStop()) {
                    return condition.interceptted()
                }
                if (isCallBack) {
                    break
                }
            }
        }

        return condition
    }

    override fun onDestroy() {
    }
}