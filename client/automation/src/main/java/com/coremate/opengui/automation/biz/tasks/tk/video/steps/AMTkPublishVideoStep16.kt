package com.coremate.opengui.automation.biz.tasks.tk.video.steps

import com.coremate.opengui.automation.base.AMCore
import com.coremate.opengui.automation.base.data.AMDataContainer
import com.coremate.opengui.automation.base.exception.AMTaskException
import com.coremate.opengui.automation.base.task.AMBaseStep
import com.coremate.opengui.automation.base.task.AMStepCondition
import com.coremate.opengui.automation.base.utils.AMActionDelay
import com.coremate.opengui.automation.base.utils.AMEventUtils
import com.coremate.opengui.automation.base.utils.AMNodeUtils
import com.coremate.opengui.automation.base.utils.Something
import com.coremate.opengui.automation.biz.common.event.lv.AMLVPageEvent
import com.coremate.opengui.automation.biz.common.node.lv.IAMWidgetLV
import com.coremate.opengui.automation.biz.tasks.tk.video.AMTkPublishVideoHelper

/**
 * Step 16:Tap share to Douyin
 */
internal class AMTkPublishVideoStep16(index: Int, helper: AMTkPublishVideoHelper) :
    AMBaseStep<AMTkPublishVideoHelper>(index, helper) {

    override fun onExecute(data: AMDataContainer?, isResume: Boolean): AMStepCondition {
        val condition = super.onExecute(data, isResume)
        if (condition.isIntercept) {
            return condition
        }
        AMEventUtils.sleep(AMActionDelay.MIDDLE_LONG)

        //Tap share to Douyin
        AMEventUtils.reProcessUntilOk(
            helper,
            3,
            AMActionDelay.MIDDLE,
            object : Something<Boolean> {
                override fun judgmentSuccess(result: Boolean): Boolean {
                    return result
                }

                override fun work(timeIndex: Int): Boolean {
                    val rootNode = AMCore.instance.amContext?.rootNode() ?: return false
                    val commitBtn =
                        AMNodeUtils.getFirstNodeById(
                            rootNode,
                            IAMWidgetLV.startExportBtn().resourceId
                        ) ?: return false
                    return AMEventUtils.clickFirstClickableParentWithSimulate(
                        commitBtn,
                        helper
                    )
                }
            }).dealWith { isSuc, intercept ->
            if (!isSuc) {
                throw AMTaskException.business("点击分享到抖音失败")
            }
        }

        if (AMLVPageEvent.isOpenAppAndOpen(helper)) {
            AMEventUtils.sleep(AMActionDelay.MIDDLE)
        }

        helper.executorService.execute {
            helper.seventeenStep()?.onExecute()
        }

        return condition
    }

    override fun onDestroy() {
    }
}