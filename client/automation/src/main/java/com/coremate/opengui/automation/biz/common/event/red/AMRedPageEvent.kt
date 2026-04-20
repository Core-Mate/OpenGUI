package com.coremate.opengui.automation.biz.common.event.red

import android.accessibilityservice.AccessibilityService
import android.view.accessibility.AccessibilityNodeInfo
import com.google.android.accessibility.selecttospeak.SelectToSpeakService
import com.coremate.opengui.automation.base.AMCore
import com.coremate.opengui.automation.base.AMTargetApp
import com.coremate.opengui.automation.base.task.AMBaseStepHelper
import com.coremate.opengui.automation.base.utils.AMActionDelay
import com.coremate.opengui.automation.base.utils.AMEventUtils
import com.coremate.opengui.automation.base.utils.AMNodeUtils
import com.coremate.opengui.automation.base.utils.MatchCallback
import com.coremate.opengui.automation.base.utils.Something
import com.coremate.opengui.automation.biz.common.event.IAMPageEvent
import com.coremate.opengui.automation.biz.common.node.red.IAMWidgetRed

internal object AMRedPageEvent : IAMPageEvent() {

    /**
     * 回到小红书会话
     * */
    fun backRedChatListPage(callBack: IAMTaskCallBack, helper: AMBaseStepHelper? = null) {
        AMEventUtils.doSomethingUntilSuccess(
            10,
            AMActionDelay.SHORT,
            object : Something<Boolean> {
                override fun judgmentSuccess(result: Boolean): Boolean {
                    if (callBack.action()) return true
                    if (result) return true
                    if (!isInTargetApp(AMTargetApp.RED)) return true
                    val backNode = getBackNode()
                    if (backNode != null) {
                        if (AMEventUtils.clickFirstClickableParentWithSimulate(
                                backNode,
                                helper
                            )
                        ) return false
                        if (SelectToSpeakService.service?.performGlobalAction(
                                AccessibilityService.GLOBAL_ACTION_BACK
                            ) == true
                        ) {
                            return false
                        }
                    }
                    val rootNode = AMCore.instance.amContext?.rootNode() ?: return false

                    val textNode =
                        AMNodeUtils.getFirstNodeByText(
                            rootNode,
                            false,
                            "退出",
                            "取消",
                            "不保留",
                            "不保存",
                            "确定"
                        )
                    if (textNode != null) {
                        if (textNode.text == "退出") {
                            SelectToSpeakService.service?.performGlobalAction(
                                AccessibilityService.GLOBAL_ACTION_BACK
                            )
                            return false
                        }
                        AMEventUtils.clickFirstClickableParentWithSimulate(textNode, helper)
                        return false
                    }
                    SelectToSpeakService.service?.performGlobalAction(AccessibilityService.GLOBAL_ACTION_BACK)
                    return false
                }

                override fun work(timeIndex: Int): Boolean {
                    return isInRedChatListPage()
                }
            })
    }

    /**
     * 是否在抖音会话列表
     */
    fun isInRedChatListPage(name: String = "消息"): Boolean {
        val rootNode = AMCore.instance.amContext?.rootNode() ?: return false
        val mainNode = getRedBottomTabByText(name)
        val groupBtn = AMNodeUtils.getFirstNodeById(rootNode, IAMWidgetRed.msgGroupbtn().resourceId)
            ?: return AMEventUtils.clickFirstClickableParentWithSimulate(
                mainNode
            )
        if (mainNode != null && groupBtn != null) return AMEventUtils.clickFirstClickableParentWithSimulate(
            mainNode
        )
        return false
    }


    /**
     * 获取red tab节点 - 新方案
     * */
    fun getRedBottomTabByText(text: String): AccessibilityNodeInfo? {
        AMNodeUtils.getAllNodeById(
            AMCore.instance.amContext?.rootNode(),
            IAMWidgetRed.indexTabItem().resourceId
        ).let {
            if (it.isEmpty()) return null
            for (node in it) {
                if (node?.text == text) return node
            }
        }
        return null
    }

    /**
     * 获取返回节点
     * */
    fun getBackNode(): AccessibilityNodeInfo? {
        val rootNode = AMCore.instance.amContext?.rootNode() ?: return null
        var nodeInfo: AccessibilityNodeInfo? = null
        //返回节点id
        nodeInfo =
            AMNodeUtils.getFirstNodeByIdWithCallback(rootNode, object :
                MatchCallback<AccessibilityNodeInfo> {
                override fun isMatch(result: AccessibilityNodeInfo?): Boolean {
                    return result?.contentDescription?.contains(IAMWidgetRed.globalBack().contentDesc) == true
                }
            }, IAMWidgetRed.globalBack().resourceId)

        return nodeInfo
    }

}