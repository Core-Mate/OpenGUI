package com.coremate.opengui.automation.biz.tasks.common.check.steps.red.steps

import com.google.android.accessibility.selecttospeak.SelectToSpeakService
import com.coremate.opengui.automation.base.data.AMDataContainer
import com.coremate.opengui.automation.base.exception.AMTaskException
import com.coremate.opengui.automation.base.task.AMBaseStep
import com.coremate.opengui.automation.base.task.AMStepCondition
import com.coremate.opengui.automation.base.utils.AMActionDelay
import com.coremate.opengui.automation.base.utils.AMEventUtils
import com.coremate.opengui.automation.biz.common.event.IAMPageEvent
import com.coremate.opengui.automation.biz.common.event.red.AMRedPageEvent
import com.coremate.opengui.automation.biz.tasks.common.check.steps.red.AMRedAutoReplyHelper

/**
 * Step 1: Navigate to the Xiaohongshu conversation page
 */
internal class AMRedAutoReplyStep1(index: Int, helper: AMRedAutoReplyHelper) :
    AMBaseStep<AMRedAutoReplyHelper>(index, helper) {

    override fun onExecute(data: AMDataContainer?, isResume: Boolean): AMStepCondition {
        val condition = super.onExecute(data, isResume)
        if (condition.isIntercept || !helper.isOngoing()) {
            return condition
        }
        if (AMRedPageEvent.isOpenAppAndOpen(helper)) {
            AMEventUtils.sleep(AMActionDelay.MAX)
            AMEventUtils.sleep(AMActionDelay.MIDDLE)
        }
        SelectToSpeakService.service?.changeAccessibilityFlags(false)
        //Check Back Xiaohongshu Message list
        AMRedPageEvent.backRedChatListPage(object : IAMPageEvent.IAMTaskCallBack {
            override fun action(): Boolean {
                return helper.isTaskPauseOrStop() || !helper.isOngoing()
            }
        }, helper)

        //Check whether on the conversation list
        if (!AMRedPageEvent.isInRedChatListPage()) {
            throw AMTaskException.business("不在小红书首页")
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