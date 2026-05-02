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
import com.coremate.opengui.automation.base.utils.AMLog
import com.coremate.opengui.automation.base.utils.AMNodeUtils
import com.coremate.opengui.automation.base.utils.Something
import com.coremate.opengui.automation.biz.common.node.lv.IAMWidgetLV
import com.coremate.opengui.automation.biz.common.node.wx.IAMWidgetWX
import com.coremate.opengui.automation.biz.tasks.tk.video.AMTkPublishVideoHelper

/**
 * Step 5:Enter the content for AI generation
 */
internal class AMTkPublishVideoStep5(index: Int, helper: AMTkPublishVideoHelper) :
    AMBaseStep<AMTkPublishVideoHelper>(index, helper) {

    override fun onExecute(data: AMDataContainer?, isResume: Boolean): AMStepCondition {
        val condition = super.onExecute(data, isResume)
        if (condition.isIntercept) {
            return condition
        }
        AMEventUtils.sleep(AMActionDelay.MIDDLE_LONG)

        //Input field node
        var editNode: AccessibilityNodeInfo? = null
        AMEventUtils.reProcessUntilOk(
            helper,
            3,
            AMActionDelay.LONG,
            object : Something<Boolean> {
                override fun judgmentSuccess(result: Boolean): Boolean {
                    return result
                }

                override fun work(timeIndex: Int): Boolean {
                    val rootNode = AMCore.instance.amContext?.rootNode() ?: return false
                    editNode =
                        AMNodeUtils.getFirstNodeById(rootNode, IAMWidgetLV.aiInput().resourceId)
                    return editNode != null
                }
            },
        ).dealWith { isSuc, intercept ->
            if (!isSuc) {
                throw AMTaskException.business("文字回复 - 输入框获取失败")
            }
        }
        var content =
            "${helper.param?.videoText}\n"
        if (helper.param?.isUseUserBg == true) {
            helper.param?.targetCustomerGroup?.let {
                content = "我的目标客户:${it}\n" + content
            }
            helper.param?.productFeatures?.let {
                content = "我销售的产品特点:${it}\n" + content
            }
            helper.param?.industry?.let {
                content = "我销售的产品:${it}\n" + content
            }
            helper.param?.industry?.let {
                content = "我的行业是:${it}\n" + content
            }
        }
        content += "视频时长限制在:${helper.param?.videoLength}秒"
        AMEventUtils.setTextToEditText(editNode, content)

        helper.executorService.execute {
            helper.sixStep()?.onExecute()
        }

        return condition
    }

    override fun onDestroy() {
    }
}