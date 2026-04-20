package com.coremate.opengui.automation.biz.tasks.tk.mixvideo.steps

import com.coremate.opengui.automation.base.AMCore
import com.coremate.opengui.automation.base.data.AMDataContainer
import com.coremate.opengui.automation.base.task.AMBaseStep
import com.coremate.opengui.automation.base.task.AMStepCondition
import com.coremate.opengui.automation.base.utils.AMActionDelay
import com.coremate.opengui.automation.base.utils.AMEventUtils
import com.coremate.opengui.automation.base.utils.AMNodeUtils
import com.coremate.opengui.automation.biz.common.node.lv.IAMWidgetLV
import com.coremate.opengui.automation.biz.tasks.tk.mixvideo.AMTkPublishVideoMixHelper

/**
 * 第7步：等待合成
 */
internal class AMTkPublishVideoMixStep7(index: Int, helper: AMTkPublishVideoMixHelper) :
    AMBaseStep<AMTkPublishVideoMixHelper>(index, helper) {

    override fun onExecute(data: AMDataContainer?, isResume: Boolean): AMStepCondition {
        val condition = super.onExecute(data, isResume)
        if (condition.isIntercept) {
            return condition
        }

        AMEventUtils.sleep(AMActionDelay.MIDDLE)
        while (true) {
            if (helper.isTaskStop()) break
            val rootNode = AMCore.instance.amContext?.rootNode()
            AMNodeUtils.getFirstNodeById(rootNode, IAMWidgetLV.mixStartLoadingTv().resourceId)
                ?: break
        }
        AMEventUtils.sleep(AMActionDelay.MIDDLE)
        AMEventUtils.sleep(AMActionDelay.MINI)
        while (true) {
            if (helper.isTaskStop()) break
            val rootNode = AMCore.instance.amContext?.rootNode()
            AMNodeUtils.getFirstNodeById(rootNode, IAMWidgetLV.mixStartProgressTv().resourceId)
                ?: break
        }
        helper.executorService.execute {
            helper.eightStep()?.onExecute()
        }


        return condition
    }

    override fun onDestroy() {
    }
}