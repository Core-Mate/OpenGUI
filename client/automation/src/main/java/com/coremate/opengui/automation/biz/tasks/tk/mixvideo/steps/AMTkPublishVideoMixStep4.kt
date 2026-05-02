package com.coremate.opengui.automation.biz.tasks.tk.mixvideo.steps

import android.view.accessibility.AccessibilityNodeInfo
import com.google.android.accessibility.selecttospeak.SelectToSpeakService
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
 * Step 4:Select material
 */
internal class AMTkPublishVideoMixStep4(index: Int, helper: AMTkPublishVideoMixHelper) :
    AMBaseStep<AMTkPublishVideoMixHelper>(index, helper) {

    override fun onExecute(data: AMDataContainer?, isResume: Boolean): AMStepCondition {
        val condition = super.onExecute(data, isResume)
        if (condition.isIntercept) {
            return condition
        }
        SelectToSpeakService.service?.changeAccessibilityFlags(false)
        AMEventUtils.sleep(AMActionDelay.SHORT)
        //Get Material list
        var listNode: AccessibilityNodeInfo? = null
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
                    val vpNode =
                        AMNodeUtils.getFirstNodeById(
                            rootNode,
                            IAMWidgetLV.mixVideoViewPager().resourceId
                        ) ?: return false
                    listNode = AMNodeUtils.getFirstNodeById(
                        vpNode,
                        IAMWidgetLV.mixVideoViewGridList().resourceId
                    )
                    return listNode != null
                }
            }).dealWith { isSuc, intercept ->
            if (!isSuc) {
                throw AMTaskException.business("素材列表没有找到")
            }
        }

        for ((index, node) in AMNodeUtils.getAllNodeById(
            listNode,
            IAMWidgetLV.mixVideoItemSelBtn().resourceId
        ).withIndex()) {
            if (index < (helper.param?.videoCount ?: 0)) {
                AMEventUtils.sleep(AMActionDelay.MINI)
                AMEventUtils.reProcessUntilOk(
                    helper,
                    3,
                    AMActionDelay.MINI,
                    object : Something<Boolean> {
                        override fun judgmentSuccess(result: Boolean): Boolean {
                            return result
                        }

                        override fun work(timeIndex: Int): Boolean {
                            return AMEventUtils.clickFirstClickableParentWithSimulate(node, helper)
                        }
                    }).dealWith { isSuc, intercept ->
                }
            }
        }

        helper.executorService.execute {
            helper.fiveStep()?.onExecute()
        }

        return condition
    }

    override fun onDestroy() {
    }
}