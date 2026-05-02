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
 * Step 14:Observe whether export is complete
 */
internal class AMTkPublishVideoStep14(index: Int, helper: AMTkPublishVideoHelper) :
    AMBaseStep<AMTkPublishVideoHelper>(index, helper) {

    override fun onExecute(data: AMDataContainer?, isResume: Boolean): AMStepCondition {
        val condition = super.onExecute(data, isResume)
        if (condition.isIntercept) {
            return condition
        }
        AMEventUtils.sleep(AMActionDelay.LONG)

        while (true) {
            if (helper.isTaskPauseOrStop()) {
                return condition
            }
            val rootNode = AMCore.instance.amContext?.rootNode()
            if (rootNode != null && rootNode.childCount > 0) {
                val startExportBtn =
                    AMNodeUtils.getFirstNodeById(
                        rootNode,
                        IAMWidgetLV.startExportBtn().resourceId
                    )
                val exportDialogClose =
                    AMNodeUtils.getFirstNodeById(
                        rootNode,
                        IAMWidgetLV.exportDialogClose().resourceId
                    )
                if (startExportBtn != null || exportDialogClose != null) {
                    break
                }
            } else {
                break
            }
            AMEventUtils.sleep(AMActionDelay.MIDDLE)
        }

        helper.executorService.execute {
            helper.fifteenStep()?.onExecute()
        }


        return condition
    }

    override fun onDestroy() {
    }
}