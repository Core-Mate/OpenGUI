package com.coremate.opengui.automation.biz.tasks.tk.video.steps

import android.view.accessibility.AccessibilityNodeInfo
import android.widget.EditText
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
 * 第9步：点击应用
 */
internal class AMTkPublishVideoStep9(index: Int, helper: AMTkPublishVideoHelper) :
    AMBaseStep<AMTkPublishVideoHelper>(index, helper) {

    override fun onExecute(data: AMDataContainer?, isResume: Boolean): AMStepCondition {
        val condition = super.onExecute(data, isResume)
        if (condition.isIntercept) {
            return condition
        }
        AMEventUtils.sleep(AMActionDelay.MIDDLE)
        AMEventUtils.sleep(AMActionDelay.LONG)

//        var editNode: AccessibilityNodeInfo? = null
//        AMEventUtils.reProcessUntilOk(
//            helper,
//            3,
//            AMActionDelay.MIDDLE,
//            object : Something<Boolean> {
//                override fun judgmentSuccess(result: Boolean): Boolean {
//                    return result
//                }
//
//                override fun work(timeIndex: Int): Boolean {
//                    val rootNode = AMCore.instance.amContext?.rootNode() ?: return false
//                    editNode = AMNodeUtils.getNodeByClassName(
//                        rootNode,
//                        EditText::class.java.name,
//                    )
//                    return editNode != null
//                }
//            }).dealWith { isSuc, intercept ->
//            if (isSuc) {
//                val bText = editNode?.text.toString()
//                AMEventUtils.setTextToEditText(editNode, bText+"\n视频时长限制在:${helper.param?.videoLength}秒以内")
//            }
//        }
//        AMEventUtils.sleep(AMActionDelay.MIDDLE_LONG)
        //点击应用
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
                                    return result?.text?.toString() == IAMWidgetLV.makeAiVideo().text
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
            if (!isSuc) {
                throw AMTaskException.business("点击应用失败")
            }
        }

        helper.executorService.execute {
            helper.tenStep()?.onExecute()
        }

        return condition
    }

    override fun onDestroy() {
    }
}