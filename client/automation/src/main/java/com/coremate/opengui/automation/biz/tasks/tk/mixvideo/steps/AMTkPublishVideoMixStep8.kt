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
import com.coremate.opengui.automation.biz.common.node.lv.IAMWidgetLV
import com.coremate.opengui.automation.biz.tasks.tk.mixvideo.AMTkPublishVideoMixHelper

/**
 * 第8步：点击导出
 */
internal class AMTkPublishVideoMixStep8(index: Int, helper: AMTkPublishVideoMixHelper) :
    AMBaseStep<AMTkPublishVideoMixHelper>(index, helper) {

    override fun onExecute(data: AMDataContainer?, isResume: Boolean): AMStepCondition {
        val condition = super.onExecute(data, isResume)
        if (condition.isIntercept) {
            return condition
        }

        AMEventUtils.sleep(AMActionDelay.MIDDLE)
        AMEventUtils.reProcessUntilOk(
            helper,
            3,
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
                            IAMWidgetLV.mixStartExportTv().resourceId
                        ) ?: return false

                    return AMEventUtils.clickFirstClickableParentWithSimulate(nextNode, helper)
                }
            }).dealWith { isSuc, intercept ->
            if (!isSuc) {
                throw  AMTaskException.business("点击导出失败")
            }
        }
        AMEventUtils.sleep(AMActionDelay.MIDDLE)
        AMEventUtils.reProcessUntilOk(
            helper,
            3,
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
                            IAMWidgetLV.mixStartExportBtn().resourceId
                        ) ?: return false

                    return AMEventUtils.clickFirstClickableParentWithSimulate(nextNode, helper)
                }
            }).dealWith { isSuc, intercept ->
            if (!isSuc) {
                throw AMTaskException.business("点击导出分享失败")
            }
        }

        helper.executorService.execute {
            helper.nineStep()?.onExecute()
        }

        return condition
    }

    override fun onDestroy() {
    }
}