package com.coremate.opengui.automation.biz.tasks.tk.mixvideo.steps

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
import com.coremate.opengui.automation.biz.tasks.tk.mixvideo.AMTkPublishVideoMixHelper

/**
 * Step 3:Check permissions and other confirm buttons
 */
internal class AMTkPublishVideoMixStep3(index: Int, helper: AMTkPublishVideoMixHelper) :
    AMBaseStep<AMTkPublishVideoMixHelper>(index, helper) {

    override fun onExecute(data: AMDataContainer?, isResume: Boolean): AMStepCondition {
        val condition = super.onExecute(data, isResume)
        if (condition.isIntercept) {
            return condition
        }
        AMEventUtils.sleep(AMActionDelay.MIDDLE)
        SelectToSpeakService.service?.changeAccessibilityFlags(true)
        var isHasDialog = false
        var hasRoot = false
        AMEventUtils.reProcessUntilOk(
            helper,
            3,
            AMActionDelay.MIDDLE,
            object : Something<Boolean> {
                override fun judgmentSuccess(result: Boolean): Boolean {
                    return result
                }

                override fun work(timeIndex: Int): Boolean {
                    val rootNode = AMCore.instance.amContext?.rootNode()
                    if (rootNode != null) {
                        hasRoot = true
                    }
                    val checkNode = AMNodeUtils.getFirstNodeByText(rootNode, true, "欢迎使用AI功能")
                    return (checkNode != null)
                }
            }).dealWith { isSuc, intercept ->
            isHasDialog = isSuc
            if (!hasRoot && !isSuc) {
                isHasDialog = true
            }
        }

        if (isHasDialog) {
            //Tap confirm in AI dialog
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
                                IAMWidgetLV.mixAiCommitBtn().resourceId
                            ) ?: return false
                        return AMEventUtils.clickFirstClickableParentWithSimulate(
                            commitBtn,
                            helper
                        )
                    }
                }).dealWith { isSuc, intercept ->
                //...
            }
            AMEventUtils.sleep(AMActionDelay.MIDDLE)
        }

        //Tap try it
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
                            IAMWidgetLV.mixTryGoEditBtn().resourceId
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