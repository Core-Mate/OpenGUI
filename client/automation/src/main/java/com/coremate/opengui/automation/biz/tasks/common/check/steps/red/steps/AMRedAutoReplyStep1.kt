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
 * 第1步：跳转到小红书会话页面
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
        //判断返回的小红书消息列表
        AMRedPageEvent.backRedChatListPage(object : IAMPageEvent.IAMTaskCallBack {
            override fun action(): Boolean {
                return helper.isTaskPauseOrStop() || !helper.isOngoing()
            }
        }, helper)

        //判断是否在会话列表
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