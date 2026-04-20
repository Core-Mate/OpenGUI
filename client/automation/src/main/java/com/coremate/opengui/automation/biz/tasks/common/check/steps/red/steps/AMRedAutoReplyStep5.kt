package com.coremate.opengui.automation.biz.tasks.common.check.steps.red.steps

import android.view.accessibility.AccessibilityNodeInfo
import com.coremate.opengui.automation.base.data.AMDataContainer
import com.coremate.opengui.automation.base.task.AMBaseStep
import com.coremate.opengui.automation.base.task.AMStepCondition
import com.coremate.opengui.automation.base.utils.AMActionDelay
import com.coremate.opengui.automation.base.utils.AMEventUtils
import com.coremate.opengui.automation.base.utils.Something
import com.coremate.opengui.automation.biz.tasks.common.check.steps.red.AMRedAutoReplyHelper

/**
 * 第5步：获取昵称并点击进入会话
 */
internal class AMRedAutoReplyStep5(index: Int, helper: AMRedAutoReplyHelper) :
    AMBaseStep<AMRedAutoReplyHelper>(index, helper) {

    override fun onExecute(data: AMDataContainer?, isResume: Boolean): AMStepCondition {
        val condition = super.onExecute(data, isResume)
        if (condition.isIntercept) {
            return condition
        }
        if (!helper.isOngoing()) {
            condition.isCanNext = false
            return condition
        }
        AMEventUtils.sleep(AMActionDelay.SHORT)
        val nodeInfo = data?.bean as AccessibilityNodeInfo

        AMEventUtils.reProcessUntilOk(
            helper,
            3,
            AMActionDelay.MIDDLE,
            object : Something<Boolean> {
                override fun judgmentSuccess(result: Boolean): Boolean {
                    return result
                }

                override fun work(timeIndex: Int): Boolean {
                    return AMEventUtils.clickFirstClickableParentWithSimulate(nodeInfo, helper)
                }
            }).dealWith { isSuc, intercept ->
            if (!isSuc) {
                condition.isCanNext = false
                return condition
            }
        }

        return condition
    }

    override fun onDestroy() {
    }

}