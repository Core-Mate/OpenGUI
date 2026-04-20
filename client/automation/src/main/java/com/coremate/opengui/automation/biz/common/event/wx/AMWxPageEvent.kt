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
 * 微信的事件
 * */
internal object AMWxPageEvent : IAMPageEvent() {

    /**
     * 获取返回节点
     * */
    fun getBackNode(): AccessibilityNodeInfo? {
        val rootNode = AMCore.instance.amContext?.rootNode() ?: return null
        var nodeInfo: AccessibilityNodeInfo? = null
        //返回节点id
        nodeInfo =
            AMNodeUtils.getFirstNodeById(rootNode, IAMWidgetWX.globalBack().resourceId)
        return nodeInfo
    }

    /**
     * 获取wx tab节点 - 新方案
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
     * 获取微信发现列表
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
     * 是否在微信首页
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
     * 获取主页搜索节点
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
     * 获取主页更多节点
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
     * 是否在设置页面
     * */
    fun isInSettingPage(): Boolean {
        val rootNode = AMCore.instance.amContext?.rootNode() ?: return false
        val settingNode = AMNodeUtils.getFirstNodeByText(rootNode, false, "设置")
        val subNode = AMNodeUtils.getFirstNodeByText(rootNode, false, "账号与安全", "帐号与安全")
        if (settingNode != null && subNode != null) return true
        return false
    }

    /**
     * 是否在通用页面
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
     * 是否在辅助功能
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
     * 好友详情右上角三个点
     */
    private fun getFriendDetailMoreNode(): AccessibilityNodeInfo? {
        val rootNode = AMCore.instance.amContext?.rootNode() ?: return null
        return AMNodeUtils.getFirstNodeByDesc(rootNode, false, "更多信息")
    }


    /**
     * 是否在朋友圈页面
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
     * 获取朋友圈列表节点
     * */
    fun getMoments(): MutableList<AccessibilityNodeInfo> {
        val list = mutableListOf<AccessibilityNodeInfo>()
        val rootNode = AMCore.instance.amContext?.rootNode() ?: return list
        //页面listview
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
     * 返回朋友圈页面
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
     * 跳转朋友圈
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
     * 回到微信首页
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
     * 返回
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
     * 获取朋友圈列表文案 - 点赞使用
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
     * 获取朋友圈列表节点2
     * */
    fun getMoments2(): MutableList<AccessibilityNodeInfo> {
        val list = mutableListOf<AccessibilityNodeInfo>()
        val rootNode = AMCore.instance.amContext?.rootNode() ?: return list
        //页面listview
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
