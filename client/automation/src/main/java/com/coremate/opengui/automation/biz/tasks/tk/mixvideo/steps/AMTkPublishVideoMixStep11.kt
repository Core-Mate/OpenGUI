package com.coremate.opengui.automation.biz.tasks.tk.mixvideo.steps

import com.coremate.opengui.automation.base.AMCore
import com.coremate.opengui.automation.base.data.AMDataContainer
import com.coremate.opengui.automation.base.exception.AMTaskException
import com.coremate.opengui.automation.base.task.AMBaseStep
import com.coremate.opengui.automation.base.task.AMStepCondition
import com.coremate.opengui.automation.base.utils.AMActionDelay
import com.coremate.opengui.automation.base.utils.AMEventUtils
import com.coremate.opengui.automation.base.utils.AMNodeUtils
import com.coremate.opengui.automation.base.utils.Something
import com.coremate.opengui.automation.biz.common.node.tk.IAMWidgetTK
import com.coremate.opengui.automation.biz.tasks.tk.mixvideo.AMTkPublishVideoMixHelper

/**
 * Step 11: final publish (deprecated)
 */
internal class AMTkPublishVideoMixStep11(index: Int, helper: AMTkPublishVideoMixHelper) :
    AMBaseStep<AMTkPublishVideoMixHelper>(index, helper) {

    override fun onExecute(data: AMDataContainer?, isResume: Boolean): AMStepCondition {
        val condition = super.onExecute(data, isResume)
        if (condition.isIntercept) {
            return condition
        }

        AMEventUtils.sleep(AMActionDelay.MIDDLE_LONG)
        AMEventUtils.reProcessUntilOk(
            helper,
            8,
            AMActionDelay.SHORT,
            object : Something<Boolean> {
                override fun judgmentSuccess(result: Boolean): Boolean {
                    return result
                }

                override fun work(timeIndex: Int): Boolean {
                    val rootNode = AMCore.instance.amContext?.rootNode() ?: return false
                    val nextNode =
                        AMNodeUtils.getFirstNodeById(
                            rootNode,
                            IAMWidgetTK.publishBtn().resourceId
                        ) ?: return false

                    return AMEventUtils.doClickDown(nextNode, helper)
                }
            }).dealWith { isSuc, intercept ->
            if (!isSuc) {
                throw AMTaskException.business("点击发布失败")
            }
        }

        helper.amContext.showToast("完成发布！！！！")
        helper.amContext.processListener?.onProcessTaskFinish(
            true,
            System.currentTimeMillis() - helper.startTime,
        )


        return condition
    }

    override fun onDestroy() {
    }
}