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
import com.coremate.opengui.automation.biz.common.node.tk.IAMWidgetTK
import com.coremate.opengui.automation.biz.tasks.tk.video.AMTkPublishVideoHelper

/**
 * 第17步：抖音操作下一步
 */
internal class AMTkPublishVideoStep17(index: Int, helper: AMTkPublishVideoHelper) :
    AMBaseStep<AMTkPublishVideoHelper>(index, helper) {

    override fun onExecute(data: AMDataContainer?, isResume: Boolean): AMStepCondition {
        val condition = super.onExecute(data, isResume)
        if (condition.isIntercept) {
            return condition
        }
        AMEventUtils.sleep(AMActionDelay.MAX)
//        AMEventUtils.reProcessUntilOk(
//            helper,
//            8,
//            AMActionDelay.MIDDLE,
//            object : Something<Boolean> {
//                override fun judgmentSuccess(result: Boolean): Boolean {
//                    return result
//                }
//
//                override fun work(timeIndex: Int): Boolean {
//                    val rootNode = AMCore.instance.amContext?.rootNode() ?: return false
//                    val nextNode =
//                        AMNodeUtils.getFirstNodeById(
//                            rootNode,
//                            IAMWidgetTK.nextBtn().resourceId
//                        ) ?: return false
//
//                    return AMEventUtils.clickFirstClickableParentWithSimulate(nextNode, helper)
//                }
//            }).dealWith { isSuc, intercept ->
//            if (!isSuc) {
//                throw AMTaskException.business("点击下一步失败")
//            }
//        }
//        helper.executorService.execute {
//            helper.eightTeenStep()?.onExecute()
//        }

        helper.amContext.showToast("您可以手动发布视频")
        helper.amContext.processListener?.onProcessTaskFinish(
            true,
            System.currentTimeMillis() - helper.startTime,
        )

        return condition
    }

    override fun onDestroy() {
    }
}