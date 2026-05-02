package com.coremate.opengui.automation.biz.tasks.wx.likecomment.steps

import com.google.android.accessibility.selecttospeak.SelectToSpeakService
import com.coremate.opengui.automation.base.data.AMDataContainer
import com.coremate.opengui.automation.base.exception.AMTaskException
import com.coremate.opengui.automation.base.task.AMBaseStep
import com.coremate.opengui.automation.base.task.AMStepCondition
import com.coremate.opengui.automation.base.utils.AMActionDelay
import com.coremate.opengui.automation.base.utils.AMEventUtils
import com.coremate.opengui.automation.biz.common.event.wx.AMWxPageEvent
import com.coremate.opengui.automation.biz.tasks.wx.likecomment.AMWxLikeCommentHelper

/**
 * Step 1:Navigate to We Chat Moments
 */
internal class AMWxLikeCommentStep1(index: Int, helper: AMWxLikeCommentHelper) :
    AMBaseStep<AMWxLikeCommentHelper>(index, helper) {

    override fun onExecute(data: AMDataContainer?, isResume: Boolean): AMStepCondition {
        val condition = super.onExecute(data, isResume)
        if (condition.isIntercept) {
            return condition
        }
        if (AMWxPageEvent.isOpenAppAndOpen(helper)) {
            AMEventUtils.sleep(AMActionDelay.MAX)
            AMEventUtils.sleep(AMActionDelay.MIDDLE)
        }

        SelectToSpeakService.service?.changeAccessibilityFlags(false)
        AMWxPageEvent.back2MomentAndHomePage(helper).dealWith { isSuc, intercept ->
            if (!isSuc) {
                if (intercept) {
                    return condition.interceptted()
                }
                throw AMTaskException.business("进入朋友圈失败")
            }
        }
        //Check whether on Moments
        AMWxPageEvent.comeToFriendMoments(helper, condition).let {
            if (it.isIntercept) return it
        }
        helper.executorService.execute {
            helper.secondStep()?.onExecute()
        }
        return condition
    }

    override fun onDestroy() {
    }
}