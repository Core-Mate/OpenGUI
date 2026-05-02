package com.coremate.opengui.automation.biz.tasks.common.check.steps.tk.steps

import com.google.android.accessibility.selecttospeak.SelectToSpeakService
import com.coremate.opengui.automation.base.data.AMDataContainer
import com.coremate.opengui.automation.base.exception.AMTaskException
import com.coremate.opengui.automation.base.task.AMBaseStep
import com.coremate.opengui.automation.base.task.AMStepCondition
import com.coremate.opengui.automation.base.utils.AMActionDelay
import com.coremate.opengui.automation.base.utils.AMEventUtils
import com.coremate.opengui.automation.biz.common.event.IAMPageEvent
import com.coremate.opengui.automation.biz.common.event.tk.AMTkPageEvent
import com.coremate.opengui.automation.biz.tasks.common.check.steps.tk.AMTkAutoReplyHelper

/**
 * Step 1:Navigate to Douyin conversation page
 */
internal class AMTkAutoReplyStep1(index: Int, helper: AMTkAutoReplyHelper) :
    AMBaseStep<AMTkAutoReplyHelper>(index, helper) {

    override fun onExecute(data: AMDataContainer?, isResume: Boolean): AMStepCondition {
        val condition = super.onExecute(data, isResume)
        if (condition.isIntercept || !helper.isOngoing()) {
            return condition
        }
        if (AMTkPageEvent.isOpenAppAndOpen(helper)) {
            AMEventUtils.sleep(AMActionDelay.MAX)
            AMEventUtils.sleep(AMActionDelay.MIDDLE)
        }
        SelectToSpeakService.service?.changeAccessibilityFlags(false)
        //Check Back WeChat home
        AMTkPageEvent.backTKChatListPage(object : IAMPageEvent.IAMTaskCallBack {
            override fun action(): Boolean {
                return helper.isTaskPauseOrStop() || !helper.isOngoing()
            }
        }, helper)

        //Check whether on the conversation page
        if (!AMTkPageEvent.isInTkChatListPage()) {
            throw AMTaskException.business("不在抖音首页")
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