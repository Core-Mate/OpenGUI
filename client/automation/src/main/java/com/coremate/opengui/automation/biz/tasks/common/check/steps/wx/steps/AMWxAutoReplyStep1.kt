package com.coremate.opengui.automation.biz.tasks.common.check.steps.wx.steps

import com.google.android.accessibility.selecttospeak.SelectToSpeakService
import com.coremate.opengui.automation.base.data.AMDataContainer
import com.coremate.opengui.automation.base.exception.AMTaskException
import com.coremate.opengui.automation.base.task.AMBaseStep
import com.coremate.opengui.automation.base.task.AMStepCondition
import com.coremate.opengui.automation.base.utils.AMActionDelay
import com.coremate.opengui.automation.base.utils.AMEventUtils
import com.coremate.opengui.automation.biz.common.event.IAMPageEvent
import com.coremate.opengui.automation.biz.common.event.wx.AMWxPageEvent
import com.coremate.opengui.automation.biz.tasks.common.check.steps.wx.AMWxAutoReplyHelper

/**
 * Step 1: Navigate to WeChat home (conversation page)
 */
internal class AMWxAutoReplyStep1(index: Int, helper: AMWxAutoReplyHelper) :
    AMBaseStep<AMWxAutoReplyHelper>(index, helper) {

    override fun onExecute(data: AMDataContainer?, isResume: Boolean): AMStepCondition {
        val condition = super.onExecute(data, isResume)
        if (condition.isIntercept || !helper.isOngoing()) {
            return condition
        }
        if (AMWxPageEvent.isOpenAppAndOpen(helper)) {
            AMEventUtils.sleep(AMActionDelay.MAX)
            AMEventUtils.sleep(AMActionDelay.MIDDLE)
        }
        SelectToSpeakService.service?.changeAccessibilityFlags(false)
        //Check Back WeChat home
        AMWxPageEvent.back2WeChatHomePage(object : IAMPageEvent.IAMTaskCallBack {
            override fun action(): Boolean {
                return helper.isTaskPauseOrStop() || !helper.isOngoing()
            }
        }, helper)

        //Check Whether on We Chat home page
        if (!AMWxPageEvent.isInWeChatHomePage()) {
            throw AMTaskException.business("不在微信首页")
        }
        if (condition.isIntercept || !helper.isOngoing()) {
            return condition
        }
        helper.executorService.execute {
            if (helper.isOngoing()) {
                helper.secondStep()?.onExecute()
            }
        }
        return condition
    }


    override fun onDestroy() {
    }


}