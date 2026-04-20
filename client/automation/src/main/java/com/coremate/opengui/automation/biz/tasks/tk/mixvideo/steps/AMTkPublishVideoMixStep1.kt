package com.coremate.opengui.automation.biz.tasks.tk.mixvideo.steps

import com.google.android.accessibility.selecttospeak.SelectToSpeakService
import com.coremate.opengui.automation.base.data.AMDataContainer
import com.coremate.opengui.automation.base.exception.AMTaskException
import com.coremate.opengui.automation.base.task.AMBaseStep
import com.coremate.opengui.automation.base.task.AMStepCondition
import com.coremate.opengui.automation.base.utils.AMActionDelay
import com.coremate.opengui.automation.base.utils.AMEventUtils
import com.coremate.opengui.automation.biz.common.event.IAMPageEvent
import com.coremate.opengui.automation.biz.common.event.lv.AMLVPageEvent
import com.coremate.opengui.automation.biz.tasks.tk.mixvideo.AMTkPublishVideoMixHelper

/**
 * 第1步：跳转到剪映首页
 */
internal class AMTkPublishVideoMixStep1(index: Int, helper: AMTkPublishVideoMixHelper) :
    AMBaseStep<AMTkPublishVideoMixHelper>(index, helper) {

    override fun onExecute(data: AMDataContainer?, isResume: Boolean): AMStepCondition {
        val condition = super.onExecute(data, isResume)
        if (condition.isIntercept) {
            return condition
        }
        if (AMLVPageEvent.isOpenAppAndOpen(helper)) {
            AMEventUtils.sleep(AMActionDelay.MAX)
            AMEventUtils.sleep(AMActionDelay.MIDDLE_LONG)
        }

        SelectToSpeakService.service?.changeAccessibilityFlags(false)
        AMLVPageEvent.backHomePage(object : IAMPageEvent.IAMTaskCallBack {
            override fun action(): Boolean {
                return helper.isTaskPauseOrStop()
            }
        }, helper)
        //判断是否在剪映首页
        if (!AMLVPageEvent.isInHomePage(helper)) {
            throw AMTaskException.business("不在剪映首页")
        }
        helper.executorService.execute {
            helper.secondStep()?.onExecute()
        }
        return condition
    }

    override fun onDestroy() {
    }
}