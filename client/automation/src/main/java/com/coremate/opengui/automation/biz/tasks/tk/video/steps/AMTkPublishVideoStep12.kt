package com.coremate.opengui.automation.biz.tasks.tk.video.steps

import com.coremate.opengui.automation.base.AMCore
import com.coremate.opengui.automation.base.data.AMDataContainer
import com.coremate.opengui.automation.base.task.AMBaseStep
import com.coremate.opengui.automation.base.task.AMStepCondition
import com.coremate.opengui.automation.base.utils.AMActionDelay
import com.coremate.opengui.automation.base.utils.AMEventUtils
import com.coremate.opengui.automation.base.utils.AMNodeUtils
import com.coremate.opengui.automation.biz.common.node.lv.IAMWidgetLV
import com.coremate.opengui.automation.biz.tasks.tk.video.AMTkPublishVideoHelper

/**
 * 第12步：视频生成中监听
 */
internal class AMTkPublishVideoStep12(index: Int, helper: AMTkPublishVideoHelper) :
    AMBaseStep<AMTkPublishVideoHelper>(index, helper) {

    override fun onExecute(data: AMDataContainer?, isResume: Boolean): AMStepCondition {
        val condition = super.onExecute(data, isResume)
        if (condition.isIntercept) {
            return condition
        }
        AMEventUtils.sleep(AMActionDelay.MIDDLE)

        while (true) {
            if (helper.isTaskStop()) break
            val rootNode = AMCore.instance.amContext?.rootNode()
            AMNodeUtils.getFirstNodeById(rootNode, IAMWidgetLV.startLoadingTv().resourceId)
                ?: break
        }
        AMEventUtils.sleep(AMActionDelay.MIDDLE)
        AMEventUtils.sleep(AMActionDelay.LONG)

        helper.executorService.execute {
            helper.thirteenStep()?.onExecute()
        }

        return condition
    }

    override fun onDestroy() {
    }
}