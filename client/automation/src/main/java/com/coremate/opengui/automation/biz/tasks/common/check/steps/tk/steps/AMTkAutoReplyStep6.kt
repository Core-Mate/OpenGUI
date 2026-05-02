package com.coremate.opengui.automation.biz.tasks.common.check.steps.tk.steps

import android.view.accessibility.AccessibilityNodeInfo
import android.widget.FrameLayout
import android.widget.RelativeLayout
import com.coremate.opengui.automation.AMServiceManager
import com.coremate.opengui.automation.base.AMCore
import com.coremate.opengui.automation.base.data.AMDataContainer
import com.coremate.opengui.automation.base.task.AMBaseStep
import com.coremate.opengui.automation.base.task.AMStepCondition
import com.coremate.opengui.automation.base.utils.AMActionDelay
import com.coremate.opengui.automation.base.utils.AMEventUtils
import com.coremate.opengui.automation.base.utils.AMLog
import com.coremate.opengui.automation.base.utils.AMNodeUtils
import com.coremate.opengui.automation.base.utils.MatchCallback
import com.coremate.opengui.automation.base.utils.Something
import com.coremate.opengui.automation.biz.common.node.tk.IAMWidgetTK
import com.coremate.opengui.automation.biz.tasks.common.check.steps.tk.AMTkAutoReplyHelper

/**
 * Step 6:Pass parameters to AI and get comment
 */
internal class AMTkAutoReplyStep6(index: Int, helper: AMTkAutoReplyHelper) :
    AMBaseStep<AMTkAutoReplyHelper>(index, helper) {

    override fun onExecute(data: AMDataContainer?, isResume: Boolean): AMStepCondition {
        val condition = super.onExecute(data, isResume)
        if (condition.isIntercept) {
            return condition
        }
        if (!helper.isOngoing()) {
            condition.isCanNext = false
            return condition
        }
        AMEventUtils.sleep(AMActionDelay.MIDDLE)

        //Get the last message
        var recyclerViewNode: AccessibilityNodeInfo? = null
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
                    recyclerViewNode =
                        AMNodeUtils.getFirstNodeById(rootNode, IAMWidgetTK.chatList().resourceId)
                    return recyclerViewNode != null && (recyclerViewNode?.childCount ?: 0) > 0
                }
            }).dealWith { isSuc, intercept ->
            if (!isSuc) {
                condition.isCanNext = false
                return condition
            }
        }
        if (!helper.isOngoing()) {
            condition.isCanNext = false
            return condition
        }
        //Get the last node
        val nodeList = mutableListOf<AccessibilityNodeInfo?>()
        for (i in 0..<(recyclerViewNode?.childCount ?: 0)) {
            val node = recyclerViewNode?.getChild(i)
            if (node?.className.toString() == FrameLayout::class.java.name.toString()) {
                nodeList.add(node)
            }
        }
        var contentStr = ""
        if (nodeList.isNotEmpty()) {
            val lastNode = nodeList.last()
            val lastTextNode =
                AMNodeUtils.getFirstNodeByIdWithCallback(lastNode, object :
                    MatchCallback<AccessibilityNodeInfo> {
                    override fun isMatch(result: AccessibilityNodeInfo?): Boolean {
                        return result?.className.toString() == IAMWidgetTK.chatContent().classCame
                    }
                }, IAMWidgetTK.chatContent().resourceId)
            if (lastTextNode != null && lastTextNode.text != null && lastTextNode.text.toString()
                    .isNotEmpty()
            ) {
                contentStr = lastTextNode.text.toString()
            }
        }

        // Run test scenario 2
        val mockChatPartnerNickname = helper.nickName
        val mockLastWeChatMessage = contentStr
        if (!helper.isOngoing()) {
            condition.isCanNext = false
            return condition
        }
        var isCallBack = false
        AMLog.onEDebugLog("开始请求AI")
//        AMServiceManager.instance.cozeAIManager?.testScenario_WeChatChatReply(
//            mockLastWeChatMessage,
//            mockChatPartnerNickname, onResult = { result ->
//                isCallBack = true
//                helper.replyContent = result ?: ""
//            }, onError = { _ ->
//                isCallBack = true
//                condition.isCanNext = false
//            }
//        )
        while (true) {
            if (helper.isTaskPauseOrStop()) {
                return condition.interceptted()
            }
            if (!helper.isOngoing()) {
                condition.isCanNext = false
                return condition
            }
            if (isCallBack) {
                break
            }
        }


        return condition
    }


    override fun onDestroy() {
    }

}