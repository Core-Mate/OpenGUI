package com.coremate.opengui.automation.biz.tasks.tk.video.steps

import com.google.android.accessibility.selecttospeak.SelectToSpeakService
import com.coremate.opengui.automation.base.AMCore
import com.coremate.opengui.automation.base.data.AMDataContainer
import com.coremate.opengui.automation.base.task.AMBaseStep
import com.coremate.opengui.automation.base.task.AMStepCondition
import com.coremate.opengui.automation.base.utils.AMActionDelay
import com.coremate.opengui.automation.base.utils.AMEventUtils
import com.coremate.opengui.automation.base.utils.AMNodeUtils
import com.coremate.opengui.automation.base.utils.Something
import com.coremate.opengui.automation.biz.common.node.lv.IAMWidgetLV
import com.coremate.opengui.automation.biz.tasks.tk.video.AMTkPublishVideoHelper

/**
 * Step 3:Check permissions and other confirm buttons
 */
internal class AMTkPublishVideoStep3(index: Int, helper: AMTkPublishVideoHelper) :
    AMBaseStep<AMTkPublishVideoHelper>(index, helper) {

    override fun onExecute(data: AMDataContainer?, isResume: Boolean): AMStepCondition {
        val condition = super.onExecute(data, isResume)
        if (condition.isIntercept) {
            return condition
        }
        AMEventUtils.sleep(AMActionDelay.MIDDLE)

        //Tap Got it
        AMEventUtils.reProcessUntilOk(
            helper,
            2,
            AMActionDelay.SHORT,
            object : Something<Boolean> {
                override fun judgmentSuccess(result: Boolean): Boolean {
                    return result
                }

                override fun work(timeIndex: Int): Boolean {
                    val rootNode = AMCore.instance.amContext?.rootNode() ?: return false
                    val commitBtn =
                        AMNodeUtils.getFirstNodeById(
                            rootNode,
                            IAMWidgetLV.funcUpKnow().resourceId
                        ) ?: return false
                    return AMEventUtils.clickFirstClickableParentWithSimulate(
                        commitBtn,
                        helper
                    )
                }
            }).dealWith { isSuc, intercept ->
            //...
        }

        helper.executorService.execute {
            helper.forthStep()?.onExecute()
        }

        return condition
    }

    override fun onDestroy() {
    }
}