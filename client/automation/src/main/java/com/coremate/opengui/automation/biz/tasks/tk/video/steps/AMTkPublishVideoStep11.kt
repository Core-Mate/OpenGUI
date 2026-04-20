package com.coremate.opengui.automation.biz.tasks.tk.video.steps

import android.view.accessibility.AccessibilityNodeInfo
import com.coremate.opengui.automation.base.AMCore
import com.coremate.opengui.automation.base.data.AMDataContainer
import com.coremate.opengui.automation.base.exception.AMTaskException
import com.coremate.opengui.automation.base.task.AMBaseStep
import com.coremate.opengui.automation.base.task.AMStepCondition
import com.coremate.opengui.automation.base.utils.AMActionDelay
import com.coremate.opengui.automation.base.utils.AMEventUtils
import com.coremate.opengui.automation.base.utils.AMNodeUtils
import com.coremate.opengui.automation.base.utils.MatchCallback
import com.coremate.opengui.automation.base.utils.Something
import com.coremate.opengui.automation.biz.common.node.lv.IAMWidgetLV
import com.coremate.opengui.automation.biz.tasks.tk.video.AMTkPublishVideoHelper

/**
 * 第11步：判断是否能生成视频的条件
 */
internal class AMTkPublishVideoStep11(index: Int, helper: AMTkPublishVideoHelper) :
    AMBaseStep<AMTkPublishVideoHelper>(index, helper) {

    override fun onExecute(data: AMDataContainer?, isResume: Boolean): AMStepCondition {
        val condition = super.onExecute(data, isResume)
        if (condition.isIntercept) {
            return condition
        }
        AMEventUtils.sleep(AMActionDelay.MIDDLE_LONG)

        //判断是否开通了SVIP
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
                    val btnNode =
                        AMNodeUtils.getFirstNodeByText(
                            rootNode,
                            false,
                            "开通SVIP后获积分"
                        )
                    return btnNode != null
                }
            }).dealWith { isSuc, intercept ->
            if (isSuc) {
                throw AMTaskException.business("需要开通SVIP")
            }
        }

        AMEventUtils.sleep(AMActionDelay.MIDDLE)

        //点击确定使用
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
                        AMNodeUtils.getFirstNodeByIdWithCallback(
                            rootNode,
                            object :
                                MatchCallback<AccessibilityNodeInfo> {
                                override fun isMatch(result: AccessibilityNodeInfo?): Boolean {
                                    return result?.text?.toString() == IAMWidgetLV.startBtnConfirm().text
                                }
                            },
                            IAMWidgetLV.makeAiVideo().resourceId
                        ) ?: return false
                    return AMEventUtils.clickFirstClickableParentWithSimulate(
                        commitBtn,
                        helper
                    )
                }
            }).dealWith { isSuc, intercept ->

        }

        helper.executorService.execute {
            helper.twelveStep()?.onExecute()
        }

        return condition
    }

    override fun onDestroy() {
    }
}