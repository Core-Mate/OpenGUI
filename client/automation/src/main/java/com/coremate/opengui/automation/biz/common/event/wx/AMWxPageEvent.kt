package com.coremate.opengui.automation.biz.common.event.wx

import android.accessibilityservice.AccessibilityService
import android.view.accessibility.AccessibilityNodeInfo
import android.widget.ImageView
import android.widget.LinearLayout
import android.widget.ListView
import android.widget.TextView
import androidx.recyclerview.widget.RecyclerView
import com.google.android.accessibility.selecttospeak.SelectToSpeakService
import com.coremate.opengui.automation.base.AMCore
import com.coremate.opengui.automation.base.AMTargetApp
import com.coremate.opengui.automation.base.exception.AMTaskException
import com.coremate.opengui.automation.base.task.AMBaseStepHelper
import com.coremate.opengui.automation.base.task.AMStepCondition
import com.coremate.opengui.automation.base.utils.AMActionDelay
import com.coremate.opengui.automation.base.utils.AMEventUtils
import com.coremate.opengui.automation.base.utils.AMLog
import com.coremate.opengui.automation.base.utils.AMNodeUtils
import com.coremate.opengui.automation.base.utils.MatchCallback
import com.coremate.opengui.automation.base.utils.Something
import com.coremate.opengui.automation.base.utils.SomethingEvent
import com.coremate.opengui.automation.biz.common.event.IAMPageEvent
import com.coremate.opengui.automation.biz.common.node.wx.IAMWidgetWX

/**
 * We Chat events
 * */
internal object AMWxPageEvent : IAMPageEvent() {

    /**
 * Get back node
     * */
    fun getBackNode(): AccessibilityNodeInfo? {
        val rootNode = AMCore.instance.amContext?.rootNode() ?: return null
        var nodeInfo: AccessibilityNodeInfo? = null
        //Back node id
        nodeInfo =
            AMNodeUtils.getFirstNodeById(rootNode, IAMWidgetWX.globalBack().resourceId)
        return nodeInfo
    }

    /**
 * Get We Chat tab node - new approach
     * */
    fun getWxBottomTabByText(text: String): AccessibilityNodeInfo? {
        AMNodeUtils.getAllNodeById(
            AMCore.instance.amContext?.rootNode(),
            IAMWidgetWX.indexTabItem().resourceId
        ).let {
            if (it.isEmpty()) return null
            for (node in it) {
                val textNode =
                    AMNodeUtils.getFirstNodeByText(node, false, text)
                if (textNode != null) return textNode
            }
        }
        return null
    }

    /**
 * Get We Chat Discover list
     * */
    fun getWeChatDiscoverListView(rootNode: AccessibilityNodeInfo?): List<AccessibilityNodeInfo>? {
        if (rootNode == null) return null
        val list = AMNodeUtils.getAllNodeByClassName(rootNode, ListView::class.java.name)
        if (list.isEmpty()) return null
        val nList = list.filter {
            AMNodeUtils.getFirstNodeByText(it, true, "微信号") == null
        }
        return nList
    }

    /**
 * Whether on We Chat home page
     */
    fun isInWeChatHomePage(name: String = "微信"): Boolean {
        AMCore.instance.amContext?.rootNode() ?: return false
        val searchNode = getMainSearchNode()
        val moreNode = getMainMoreNode()
        if (searchNode != null && moreNode != null) {
            val mainNode = getWxBottomTabByText(name) ?: return false
            return AMEventUtils.clickFirstClickableParentWithSimulate(mainNode)
        }

        if (isInSettingPage())
            return false
        if (isInCurrencyPage())
            return false
        if (isInHelperPage())
            return false
        val mainNode = getWxBottomTabByText(name) ?: return false
        return AMEventUtils.clickFirstClickableParentWithSimulate(mainNode)
    }

    /**
 * Get home search node
     * */
    fun getMainSearchNode(): AccessibilityNodeInfo? {
        val rootNode = AMCore.instance.amContext?.rootNode() ?: return null
        var searchNode =
            AMNodeUtils.getFirstNodeById(rootNode, IAMWidgetWX.mainSearch().resourceId)
        if (searchNode == null) {
            searchNode = AMNodeUtils.getFirstNodeByDesc(rootNode, false, "搜索")
        }
        return searchNode
    }

    /**
 * Get home more node
     * */
    fun getMainMoreNode(): AccessibilityNodeInfo? {
        val rootNode = AMCore.instance.amContext?.rootNode() ?: return null
        var moreNode = AMNodeUtils.getFirstNodeById(rootNode, IAMWidgetWX.mainMore().resourceId)
        if (moreNode == null) {
            moreNode = AMNodeUtils.getFirstNodeByDesc(rootNode, false, "更多功能按钮")
        }
        return moreNode
    }

    /**
 * Whether on the settings page
     * */
    fun isInSettingPage(): Boolean {
        val rootNode = AMCore.instance.amContext?.rootNode() ?: return false
        val settingNode = AMNodeUtils.getFirstNodeByText(rootNode, false, "设置")
        val subNode = AMNodeUtils.getFirstNodeByText(rootNode, false, "账号与安全", "帐号与安全")
        if (settingNode != null && subNode != null) return true
        return false
    }

    /**
 * Whether on the General page
     * */
    fun isInCurrencyPage(): Boolean {
        val rootNode = AMCore.instance.amContext?.rootNode() ?: return false
        val generalNode = AMNodeUtils.getFirstNodeByIdWithCallback(
            rootNode,
            object : MatchCallback<AccessibilityNodeInfo> {
                override fun isMatch(result: AccessibilityNodeInfo?): Boolean {
                    return (result?.text ?: "").toString() == "通用"
                }
            },
            mutableListOf("android:id/text1")
        )
        return generalNode != null
    }

    /**
 * Whether on the Accessibility page
     * */
    fun isInHelperPage(): Boolean {
        val rootNode = AMCore.instance.amContext?.rootNode() ?: return false
        val generalNode = AMNodeUtils.getFirstNodeByIdWithCallback(
            rootNode,
            object : MatchCallback<AccessibilityNodeInfo> {
                override fun isMatch(result: AccessibilityNodeInfo?): Boolean {
                    return (result?.text ?: "").toString() == "辅助功能"
                }
            },
            mutableListOf("android:id/text1")
        )
        return generalNode != null
    }

    /**
 * Top-right three-dot menu on friend details
     */
    private fun getFriendDetailMoreNode(): AccessibilityNodeInfo? {
        val rootNode = AMCore.instance.amContext?.rootNode() ?: return null
        return AMNodeUtils.getFirstNodeByDesc(rootNode, false, "更多信息")
    }


    /**
 * Whether on the Moments page
     * */
    fun isInFriendMomentsPage(): Boolean {
        val rootNode = AMCore.instance.amContext?.rootNode() ?: return false
        return AMNodeUtils.getFirstNodeByDescWithClassName(
            rootNode,
            ImageView::class.java.name,
            "拍照分享"
        ) != null
    }


    /**
 * Get Moments list node
     * */
    fun getMoments(): MutableList<AccessibilityNodeInfo> {
        val list = mutableListOf<AccessibilityNodeInfo>()
        val rootNode = AMCore.instance.amContext?.rootNode() ?: return list
        //Page List View
        var listNode =
            AMNodeUtils.getNodeByClassName(rootNode, ListView::class.java.name)
        if (listNode == null) {
            listNode = AMNodeUtils.getNodeByClassName(rootNode, RecyclerView::class.java.name)
                ?: return list
        }
        val iterator = AMNodeUtils.getAllNodeContainDesc(listNode, "头像").iterator()
        while (iterator.hasNext()) {
            iterator.next().let { node ->
                if (node.parent != null && node.parent.className != RecyclerView::class.java.name) {
                    list.add(node.parent)
                }
            }

        }
        return list
    }

    /**
 * Return to Moments page
     * */
    fun back2MomentAndHomePage(helper: AMBaseStepHelper): SomethingEvent {

        return AMEventUtils.reProcessUntilOk(
            helper,
            10,
            AMActionDelay.MIDDLE,
            object : Something<Boolean> {
                override fun judgmentSuccess(result: Boolean): Boolean {

                    if (result) return true
                    if (!isInTargetApp(AMTargetApp.WX)) return true
                    val backNode = getBackNode()
                    if (backNode != null) {
                        if (AMEventUtils.clickFirstClickableParentWithSimulate(
                                backNode,
                                helper
                            )
                        ) return false
                    }
                    val rootNode = AMCore.instance.amContext?.rootNode() ?: return false
                    val textNode =
                        AMNodeUtils.getFirstNodeByText(
                            rootNode,
                            true,
                            "退出",
                            "取消",
                            "不保留",
                            "不保存"
                        )
                    if (textNode != null) {
                        AMEventUtils.clickFirstClickableParentWithSimulate(textNode, helper)
                        return false
                    }
                    SelectToSpeakService.service?.performGlobalAction(AccessibilityService.GLOBAL_ACTION_BACK)
                    return false
                }

                override fun work(timeIndex: Int): Boolean {
                    return isInWeChatHomePage() || isInFriendMomentsPage()
                }
            })
    }

    /**
 * Navigate to Moments
     * */
    fun comeToFriendMoments(
        helper: AMBaseStepHelper,
        condition: AMStepCondition,
        isException: Boolean = false
    ): AMStepCondition {

        if (isInWeChatHomePage() || isInWeChatHomePage("通讯录")) {
            AMLog.onEDebugLog("点击发现")
            AMEventUtils.reProcessUntilOk(
                helper,
                10,
                AMActionDelay.SHORT,
                object : Something<Boolean> {
                    override fun judgmentSuccess(result: Boolean): Boolean {
                        return result
                    }

                    override fun work(timeIndex: Int): Boolean {
                        val findNode = getWxBottomTabByText("发现")
                        if (findNode != null) {
                            AMLog.onEDebugLog("获取到发现节点")
                        } else {
                            return false
                        }
                        return AMEventUtils.clickFirstClickableParentWithSimulate(findNode, helper)
                    }
                }).dealWith { isSuc, intercept ->
                if (intercept) {
                    return condition.interceptted()
                }
                if (!isSuc) {
                    if (isException) {
                        throw AMTaskException.business(
                            "clickDiscovery2 is false",
                        )
                    } else {
                        AMLog.onEDebugLog("clickDiscovery3 is false")
                    }

                    return condition.interceptted()
                }
            }
            AMLog.onEDebugLog("点击朋友圈")
            AMEventUtils.reProcessUntilOk(
                helper,
                10,
                AMActionDelay.SHORT,
                object : Something<Boolean> {
                    override fun judgmentSuccess(result: Boolean): Boolean {
                        return result
                    }

                    override fun work(timeIndex: Int): Boolean {
                        val listNode =
                            getWeChatDiscoverListView(AMCore.instance.amContext?.rootNode())
                                ?: return false
                        if (listNode.isNotEmpty()) {
                            var textNode: AccessibilityNodeInfo? = null
                            for (i in 0 until listNode.size) {
                                val node = listNode[i]
                                textNode = AMNodeUtils.getFirstNodeByText(node, true, "朋友圈")
                                if (textNode != null) break
                            }
                            return AMEventUtils.clickFirstClickableParentWithSimulate(
                                textNode,
                                helper
                            )
                        }
                        return false
                    }
                }).dealWith { isSuc, intercept ->
                if (!isSuc) {
                    if (isException) {
                        throw AMTaskException.business(
                            "clickDiscovery2 is false",
                        )
                    } else {
                        AMLog.onEDebugLog("clickDiscovery2 is false")
                    }

                    return condition.interceptted()
                }
            }

            AMEventUtils.reProcessUntilOk(
                helper,
                10,
                AMActionDelay.SHORT,
                object : Something<Boolean> {
                    override fun judgmentSuccess(result: Boolean): Boolean {
                        return result
                    }

                    override fun work(timeIndex: Int): Boolean {
                        return isInFriendMomentsPage()
                    }
                }).dealWith { isSuc, intercept ->
                if (!isSuc) {
                    if (isException) {
                        throw AMTaskException.business(
                            "comeToFriendMoments is false"
                        )
                    } else {
                        AMLog.onEDebugLog("comeToFriendMoments is false")
                    }

                    return condition.interceptted()
                }
            }
        }
        return condition
    }

    /**
 * Return to We Chat home page
     * */
    fun back2WeChatHomePage(callBack: IAMTaskCallBack, helper: AMBaseStepHelper? = null) {
        AMEventUtils.doSomethingUntilSuccess(
            10,
            AMActionDelay.SHORT,
            object : Something<Boolean> {
                override fun judgmentSuccess(result: Boolean): Boolean {
                    if (callBack.action()) return true
                    if (result) return true
                    if (!isInTargetApp(AMTargetApp.WX)) return true
                    val backNode = getBackNode()
                    if (backNode != null) {
                        if (AMEventUtils.doClickDown(
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
                        if (textNode.text == "退出" && isInSettingPage()) {
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
                    return isInWeChatHomePage()
                }
            })
    }

    /**
 * Back
     * */
    fun simpleBack(helper: AMBaseStepHelper? = null) {
        if (!isInTargetApp(AMTargetApp.WX)) return
        var nodeInfo = getBackNode()
        if (nodeInfo == null) {
            AMEventUtils.sleep(AMActionDelay.MIDDLE)
            SelectToSpeakService.service?.performGlobalAction(AccessibilityService.GLOBAL_ACTION_BACK)
            return
        }
        AMEventUtils.clickFirstClickableParentWithSimulate(nodeInfo, helper)
    }

    /**
 * Get Moments list text for likes
     * */
    fun getMomentTextFromMomentByLike(
        paramAccessibilityNodeInfo: AccessibilityNodeInfo
    ): String {
        val str = ""
        val list = AMNodeUtils.getAllChildNodeByClassNameWithCallback(
            paramAccessibilityNodeInfo,
            LinearLayout::class.java.name
        )
        if (list.isEmpty()) return str

        val firstNode = list.first()
        val firstTextNode = AMNodeUtils.getNodeByClassName(firstNode, TextView::class.java.name)
            ?: return (firstNode.text ?: "").toString()

        if (firstTextNode.text == "全文") {
            return firstNode.text.toString()
        }
        if (firstNode.text?.isNotEmpty() == true) {
            return (firstNode.text ?: "").toString()
        }
        if (firstTextNode.text?.isNotEmpty() == true) {
            return (firstTextNode.text ?: "").toString()
        }
        return str
    }

    /**
 * Get Moments list node 2
     * */
    fun getMoments2(): MutableList<AccessibilityNodeInfo> {
        val list = mutableListOf<AccessibilityNodeInfo>()
        val rootNode = AMCore.instance.amContext?.rootNode() ?: return list
        //Page List View
        var listNode =
            AMNodeUtils.getNodeByClassName(rootNode, ListView::class.java.name)
        if (listNode == null) {
            listNode = AMNodeUtils.getNodeByClassName(rootNode, RecyclerView::class.java.name)
                ?: return list
        }
        val iterator = AMNodeUtils.getAllNodeContainDesc(listNode, "头像").iterator()
        while (iterator.hasNext()) {
            val node = iterator.next()
            if (node.parent != null) {
                val textNode =
                    AMNodeUtils.getFirstNodeByDesc(
                        node.parent,
                        false,
                        ",我的头像,再点一次可以进入我的相册"
                    )
                if (textNode == null) {
                    list.add(node.parent)
                }
            }
        }
        return list
    }

}
