package com.coremate.opengui.automation.biz.tasks.common.check.steps.red.steps

import android.view.accessibility.AccessibilityNodeInfo
import android.widget.FrameLayout
import android.widget.LinearLayout
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
import com.coremate.opengui.automation.biz.common.node.red.IAMWidgetRed
import com.coremate.opengui.automation.biz.tasks.common.check.steps.red.AMRedAutoReplyHelper

/**
 * 第6步：传参数给AI，获取评论
 */
internal class AMRedAutoReplyStep6(index: Int, helper: AMRedAutoReplyHelper) :
    AMBaseStep<AMRedAutoReplyHelper>(index, helper) {

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

        //获取最后一条信息
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
                        AMNodeUtils.getFirstNodeById(rootNode, IAMWidgetRed.chatList().resourceId)
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
        //获取最后一个节点
        val nodeList = mutableListOf<AccessibilityNodeInfo?>()
        for (i in 0..<(recyclerViewNode?.childCount ?: 0)) {
            val node = recyclerViewNode?.getChild(i)
            if (node?.className.toString() == LinearLayout::class.java.name.toString()) {
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
                        return result?.className.toString() == IAMWidgetRed.lastMessage().classCame
                    }
                }, IAMWidgetRed.lastMessage().resourceId)
            if (lastTextNode != null && lastTextNode.text != null && lastTextNode.text.toString()
                    .isNotEmpty()
            ) {
                contentStr = lastTextNode.text.toString()
            }
        }

        // 运行测试场景 2
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