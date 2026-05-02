package com.coremate.opengui.automation.biz.common.event.tk

import android.accessibilityservice.AccessibilityService
import android.view.accessibility.AccessibilityNodeInfo
import android.widget.Button
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
import com.coremate.opengui.automation.biz.common.node.tk.IAMWidgetTK

internal object AMTkPageEvent : IAMPageEvent() {

    /**
 * Return to Douyin home page
     * */
    fun backTKHomePage(callBack: IAMTaskCallBack, helper: AMBaseStepHelper? = null) {
        AMEventUtils.doSomethingUntilSuccess(
            10,
            AMActionDelay.SHORT,
            object : Something<Boolean> {
                override fun judgmentSuccess(result: Boolean): Boolean {
                    if (callBack.action()) return true
                    if (result) return true
                    if (!isInTargetApp(AMTargetApp.TK)) return true
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
                    return isInTkHomePage()
                }
            })
    }

    /**
 * Whether on Douyin home page
     */
    fun isInTkHomePage(name: String = "首页"): Boolean {
        AMCore.instance.amContext?.rootNode() ?: return false
        val searchNode = getMainSearchNode()
        val mainNode = getTKBottomTabByText(name)
        if (mainNode != null && searchNode != null) return true
        if (mainNode != null) {
            return AMEventUtils.clickFirstClickableParentWithSimulate(mainNode)
        }
        return false
    }

    /**
 * Return to Douyin conversation
     * */
    fun backTKChatListPage(callBack: IAMTaskCallBack, helper: AMBaseStepHelper? = null) {
        AMEventUtils.doSomethingUntilSuccess(
            10,
            AMActionDelay.SHORT,
            object : Something<Boolean> {
                override fun judgmentSuccess(result: Boolean): Boolean {
                    if (callBack.action()) return true
                    if (result) return true
                    if (!isInTargetApp(AMTargetApp.TK)) return true
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
                            "确定",
                            "关闭"
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
                    return isInTkChatListPage()
                }
            })
    }

    /**
 * Whether on the Douyin conversation list
     */
    fun isInTkChatListPage(name: String = "消息"): Boolean {
        val rootNode = AMCore.instance.amContext?.rootNode() ?: return false
        val searchNode = getMsgSearchNode()
        val mainNode = getTKBottomTabByText(name)
        val chatBack = AMNodeUtils.getFirstNodeById(rootNode, IAMWidgetTK.chatBackBtn().resourceId)
        if (chatBack != null) return false
        if (mainNode != null && searchNode != null) return true
        if (mainNode != null) {
            return AMEventUtils.clickFirstClickableParentWithSimulate(mainNode)
        }
        return false
    }

    /**
 * Get tk tab node - new approach
     * */
    fun getTKBottomTabByText(text: String): AccessibilityNodeInfo? {
        AMNodeUtils.getAllNodeById(
            AMCore.instance.amContext?.rootNode(),
            IAMWidgetTK.indexTabItem().resourceId
        ).let {
            if (it.isEmpty()) return null
            for (node in it) {
                if (node?.text == text) return node
            }
        }
        return null
    }

    /**
 * Get home search node
     * */
    fun getMainSearchNode(): AccessibilityNodeInfo? {
        val rootNode = AMCore.instance.amContext?.rootNode() ?: return null
        val searchNode = AMNodeUtils.getFirstNodeByIdWithCallback(
            rootNode,
            object : MatchCallback<AccessibilityNodeInfo> {
                override fun isMatch(result: AccessibilityNodeInfo?): Boolean {
                    return result?.className == Button::class.java.name
                }
            },
            IAMWidgetTK.mainSearchBtn().resourceId
        )
        return searchNode
    }

    /**
 * Get message-list search node
     * */
    fun getMsgSearchNode(): AccessibilityNodeInfo? {
        val rootNode = AMCore.instance.amContext?.rootNode() ?: return null
        val searchNode = AMNodeUtils.getFirstNodeByIdWithCallback(
            rootNode,
            object : MatchCallback<AccessibilityNodeInfo> {
                override fun isMatch(result: AccessibilityNodeInfo?): Boolean {
                    return result?.className == Button::class.java.name
                }
            },
            IAMWidgetTK.msgSearchBtn().resourceId
        )
        return searchNode
    }


    /**
 * Get back node
     * */
    fun getBackNode(): AccessibilityNodeInfo? {
        val rootNode = AMCore.instance.amContext?.rootNode() ?: return null
        var nodeInfo: AccessibilityNodeInfo? = null
        //Back node id
        nodeInfo =
            AMNodeUtils.getFirstNodeByIdWithCallback(rootNode, object :
                MatchCallback<AccessibilityNodeInfo> {
                override fun isMatch(result: AccessibilityNodeInfo?): Boolean {
                    return result?.contentDescription?.contains(IAMWidgetTK.backBtn().contentDesc) == true
                }
            }, IAMWidgetTK.backBtn().resourceId)

        return nodeInfo
    }

}