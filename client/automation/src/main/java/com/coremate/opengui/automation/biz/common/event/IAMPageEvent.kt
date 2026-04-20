package com.coremate.opengui.automation.biz.common.event

import android.util.Pair
import android.view.accessibility.AccessibilityNodeInfo
import android.widget.CheckBox
import android.widget.ImageView
import android.widget.RelativeLayout
import android.widget.TextView
import androidx.recyclerview.widget.RecyclerView
import com.coremate.opengui.automation.base.AMCore
import com.coremate.opengui.automation.base.AMTargetApp
import com.coremate.opengui.automation.base.task.AMBaseStepHelper
import com.coremate.opengui.automation.base.utils.AMActionDelay
import com.coremate.opengui.automation.base.utils.AMEventUtils
import com.coremate.opengui.automation.base.utils.AMLog
import com.coremate.opengui.automation.base.utils.AMNodeUtils
import com.coremate.opengui.automation.base.utils.MatchCallback
import com.coremate.opengui.automation.base.utils.Something

internal open class IAMPageEvent {


    /**
     * 判断是否要打开app
     */
    fun isOpenAppAndOpen(helper: AMBaseStepHelper): Boolean {
        AMEventUtils.sleep(AMActionDelay.MINI)
        AMEventUtils.reProcessUntilOk(
            helper,
            3,
            AMActionDelay.SHORT,
            object : Something<Boolean> {
                override fun judgmentSuccess(result: Boolean): Boolean {
                    return result
                }

                override fun work(timeIndex: Int): Boolean {
                    val rootNode = AMCore.instance.amContext?.rootNode() ?: return false
                    //今后不提示
                    val checkBox =
                        AMNodeUtils.getFirstNodeById(
                            rootNode,
                            mutableListOf("com.oplus.securitypermission:id/coui_security_alert_dialog_checkbox")
                        ) ?: return false
                    AMEventUtils.clickFirstClickableParentWithSimulate(checkBox, helper)
                    AMEventUtils.sleep(AMActionDelay.MINI)
                    val openBtn =
                        AMNodeUtils.getFirstNodeByIdWithCallback(
                            rootNode,
                            object : MatchCallback<AccessibilityNodeInfo> {
                                override fun isMatch(result: AccessibilityNodeInfo?): Boolean {
                                    if (result?.text != null && result.text.toString() == "打开") {
                                        return true
                                    }
                                    return false
                                }
                            },
                            mutableListOf("android:id/button1")
                        ) ?: return false

                    return AMEventUtils.clickFirstClickableParentWithSimulate(openBtn, helper)
                }
            }, isInterruptIgnore = true
        ).dealWith { isSuc, intercept ->
            if (isSuc) {
                return true
            }
        }
        return false
    }


    /**
     * 选择相册
     * @param timeKey 时间的key
     * @param index 索引
     * @param extra 额外判断(默认为true)
     * @param moreJudgment 是否存在多余判断
     * @return Pair 是否成功 / 是否暂停
     * */
    fun selectPictureOrVideoByTimeAndIndex(
        helper: AMBaseStepHelper,
        timeKey: String,
        index: Int,
        extra: Boolean = true,
        moreJudgment: Boolean = false
    ): Pair<Boolean, Boolean> {
        AMEventUtils.sleep(AMActionDelay.MINI)
        if (moreJudgment) {
            //判断是否在选择图片视频页面
            AMEventUtils.reProcessUntilOk(
                helper,
                20,
                AMActionDelay.SHORT,
                object : Something<Boolean> {
                    override fun judgmentSuccess(result: Boolean): Boolean {
                        return result
                    }

                    override fun work(timeIndex: Int): Boolean {
                        val rootNode = AMCore.instance.amContext?.rootNode() ?: return false
                        if (AMNodeUtils.getFirstNodeByText(
                                rootNode,
                                false,
                                "图片和视频",
                                "搜索,按钮"
                            ) != null
                        ) {
                            return true
                        }
                        return false
                    }
                }).dealWith { isSuc, intercept ->
                if (!isSuc) {
                    if (intercept) return Pair(false, true)
                    AMLog.onEDebugLog("pictureAndVideoNode is null")
                    return Pair(false, false)
                }
            }
        }
        AMLog.onEDebugLog("开始处理第${index}张图片 - 获取recyclerView")
        //获取recyclerView
        var recyclerViewNode: AccessibilityNodeInfo? = null
        var alreadyWait = false
        AMEventUtils.reProcessUntilOk(
            helper,
            10,
            AMActionDelay.SHORT,
            object : Something<Boolean> {
                override fun judgmentSuccess(result: Boolean): Boolean {
                    return result
                }

                override fun work(timeIndex: Int): Boolean {
                    val rootNode = AMCore.instance.amContext?.rootNode() ?: return false
                    recyclerViewNode =
                        AMNodeUtils.getNodeByClassName(rootNode, RecyclerView::class.java.name)
                    if (recyclerViewNode != null && (recyclerViewNode?.childCount ?: 0) > 0) {
                        if (alreadyWait) {
                            return true
                        }
                        if (moreJudgment) {
                            AMEventUtils.sleep(AMActionDelay.LONG)
                        } else {
                            AMEventUtils.sleep(AMActionDelay.MIDDLE)
                        }

                        alreadyWait = true
                    }
                    return false
                }
            }).dealWith { isSuc, intercept ->
            if (!isSuc) {
                if (intercept) return Pair(false, true)
                AMLog.onEDebugLog("recyclerView is null or empty")
                return Pair(false, false)
            }
        }
        AMLog.onEDebugLog("开始处理第${index}张图片 - 滑动")
        //滑动
        AMEventUtils.scroll2TopOrBottom(recyclerViewNode, true)
        AMEventUtils.sleep(AMActionDelay.SHORT)
        var i = 0
        if (!moreJudgment) {
            AMCore.instance.amContext?.rootNode() ?: return Pair(false, false)
            AMEventUtils.reProcessUntilOk(
                helper,
                10,
                AMActionDelay.SHORT,
                object : Something<Boolean> {
                    override fun judgmentSuccess(result: Boolean): Boolean {
                        return result
                    }

                    override fun work(timeIndex: Int): Boolean {
                        val rootNode = AMCore.instance.amContext?.rootNode() ?: return false
                        recyclerViewNode =
                            AMNodeUtils.getNodeByClassName(rootNode, RecyclerView::class.java.name)
                        return recyclerViewNode != null
                    }
                }).dealWith { isSuc, intercept ->
                if (!isSuc && intercept) return Pair(false, true)
            }
            if (recyclerViewNode == null || (recyclerViewNode?.childCount ?: 0) == 0) {
                AMLog.onEDebugLog("没有recyclerView")
                return Pair(false, false)
            }
        }

        while (true) {
            if (helper.isTaskPauseOrStop()) {
                return Pair(false, true)
            }
            //再次获取recyclerView
            if (moreJudgment) {
                AMCore.instance.amContext?.rootNode() ?: return Pair(false, false)
                AMEventUtils.reProcessUntilOk(
                    helper,
                    10,
                    AMActionDelay.SHORT,
                    object : Something<Boolean> {
                        override fun judgmentSuccess(result: Boolean): Boolean {
                            return result
                        }

                        override fun work(timeIndex: Int): Boolean {
                            val rootNode = AMCore.instance.amContext?.rootNode() ?: return false
                            recyclerViewNode =
                                AMNodeUtils.getNodeByClassName(
                                    rootNode,
                                    RecyclerView::class.java.name
                                )
                            return recyclerViewNode != null
                        }
                    }).dealWith { isSuc, intercept ->
                    if (!isSuc && intercept) return Pair(false, true)
                }
                if (recyclerViewNode == null && (recyclerViewNode?.childCount ?: 0) == 0) break
            }

            AMLog.onEDebugLog("开始处理第${index}张图片 - 遍历其中的item")
            //遍历其中的item
            for (itemNode in AMNodeUtils.getAllNodeByClassName(
                recyclerViewNode,
                RelativeLayout::class.java.name
            )) {
                //过滤情况
                if (index > i) {
                    i++
                    continue
                }
                var tempImageInfo: AccessibilityNodeInfo? = null
                //图片列表
                val imageList =
                    AMNodeUtils.getAllNodeByClassName(itemNode, ImageView::class.java.name)
                if (imageList.isEmpty()) continue

                //获取有desc的图片
                val iterator = imageList.iterator()
                while (true) {
                    if (iterator.hasNext()) {
                        tempImageInfo = iterator.next()
                        if (tempImageInfo.contentDescription == null || tempImageInfo.contentDescription.isEmpty()) continue
                    }
                    break
                }
                if (tempImageInfo == null) continue

                //获取图片的desc
                val str = (tempImageInfo.contentDescription ?: "").toString()
                if (!str.contains(timeKey) || (extra && !str.contains("图片")) || (!extra && !str.contains(
                        "视频"
                    ))
                ) {
                    continue
                }
                //获取checkBox节点
                val checkNode =
                    AMNodeUtils.getNodeByClassName(itemNode, CheckBox::class.java.name) ?: continue

                //点击checkBox
                if (!checkNode.isChecked) {
                    AMEventUtils.clickFirstClickableParentWithSimulate(checkNode, helper)
                    AMLog.onEDebugLog("开始处理第${index}张图片 - 点击checkBox")
                    return Pair(true, false)
                }
                return Pair(true, false)
            }
        }
        return Pair(false, false)
    }

    /**
     * 选择视频
     * @param timeKey 时间的key
     * @param index 索引
     * @param extra 额外判断(默认为true)
     * @param moreJudgment 是否存在多余判断
     * @return Pair 是否成功 / 是否暂停
     * */
    open fun selectVideoByTimeAndIndex(
        helper: AMBaseStepHelper,
        timeKey: String,
        index: Int,
        moreJudgment: Boolean = false
    ): Pair<Boolean, Boolean> {

        if (moreJudgment) {
            AMCore.instance.amContext?.rootNode() ?: return Pair(false, false)
            //判断是否在选择图片视频页面
            AMEventUtils.reProcessUntilOk(
                helper,
                20,
                AMActionDelay.SHORT,
                object : Something<Boolean> {
                    override fun judgmentSuccess(result: Boolean): Boolean {
                        return result
                    }

                    override fun work(timeIndex: Int): Boolean {
                        val rootNode = AMCore.instance.amContext?.rootNode() ?: return false
                        if (AMNodeUtils.getFirstNodeByText(
                                rootNode,
                                false,
                                "图片和视频",
                                "搜索,按钮"
                            ) != null
                        ) {
                            return true
                        }
                        return false
                    }
                }).dealWith { isSuc, intercept ->
                if (!isSuc) {
                    if (intercept) return Pair(false, true)
                    AMLog.onEDebugLog("videoNode is null")
                    return Pair(false, false)
                }
            }
        }

        var recyclerViewNode: AccessibilityNodeInfo? = null
        AMEventUtils.reProcessUntilOk(
            helper,
            10,
            AMActionDelay.SHORT,
            object : Something<Boolean> {
                override fun judgmentSuccess(result: Boolean): Boolean {
                    return result
                }

                override fun work(timeIndex: Int): Boolean {
                    val rootNode = AMCore.instance.amContext?.rootNode() ?: return false
                    recyclerViewNode =
                        AMNodeUtils.getNodeByClassName(rootNode, RecyclerView::class.java.name)
                    return recyclerViewNode != null && (recyclerViewNode?.childCount ?: 0) > 0
                }
            }).dealWith { isSuc, intercept ->
            if (!isSuc && intercept) return Pair(false, true)
        }
        if (recyclerViewNode == null && (recyclerViewNode?.childCount ?: 0) == 0) {
            AMLog.onEDebugLog("没有recyclerView")
            return Pair(false, false)
        }
        //滑动
        AMEventUtils.scroll2TopOrBottom(recyclerViewNode, true)
        AMEventUtils.sleep(AMActionDelay.SHORT)
        var j = 0
        while (true) {
            if (helper.isTaskPauseOrStop()) {
                return Pair(false, true)
            }
            //再次获取recyclerView
            val rootNode = AMCore.instance.amContext?.rootNode() ?: return Pair(false, false)
            recyclerViewNode =
                AMNodeUtils.getNodeByClassName(rootNode, RecyclerView::class.java.name)
            if (recyclerViewNode == null || (recyclerViewNode?.childCount ?: 0) == 0) return Pair(
                false,
                false
            )
            AMLog.onEDebugLog("开始处理第${index}个视频 - 遍历其中的item")
            //遍历其中的item
            for (itemNode in AMNodeUtils.getAllNodeByClassName(
                recyclerViewNode,
                RelativeLayout::class.java.name
            )) {
                var tempImageInfo: AccessibilityNodeInfo? = null
                //图片列表
                val imageList =
                    AMNodeUtils.getAllNodeByClassName(itemNode, ImageView::class.java.name)
                if (imageList.isEmpty()) continue

                //获取有desc的图片
                val iterator = imageList.iterator()
                while (true) {
                    if (iterator.hasNext()) {
                        tempImageInfo = iterator.next()
                        if (tempImageInfo.contentDescription == null || tempImageInfo.contentDescription.isEmpty()) continue
                    }
                    break
                }
                if (tempImageInfo == null) continue
                //获取图片的desc
                val str = (tempImageInfo.contentDescription ?: "").toString()
                if (!str.contains(timeKey) || (!str.contains("视频"))) {
                    continue
                }
                val textNode =
                    AMNodeUtils.getNodeByClassName(itemNode, TextView::class.java.name) ?: continue
                val textStr = textNode.text?.toString() ?: ""
                AMLog.onEDebugLog("开始处理第${index}个视频 - ${textStr}")
                if (index > j) {
                    j++
                    continue
                }
                //获取checkBox节点
                val checkNode =
                    AMNodeUtils.getNodeByClassName(itemNode, CheckBox::class.java.name) ?: continue

                //点击checkBox
                if (!checkNode.isChecked) {
                    AMEventUtils.clickFirstClickableParentWithSimulate(checkNode, helper)
                    AMLog.onEDebugLog("开始处理第${index}张图片 - 点击checkBox")
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
                            val rootNode = AMCore.instance.amContext?.rootNode() ?: return false
                            val finishNode =
                                AMNodeUtils.getFirstNodeByText(rootNode, true, "完成")
                                    ?: return false
                            return AMEventUtils.clickFirstClickableParentWithSimulate(
                                finishNode,
                                helper
                            )
                        }
                    }).dealWith { isSuc, intercept ->
                    if (!isSuc) {
                        if (intercept) {
                            return Pair(false, true)
                        } else {
                            AMLog.onEDebugLog(
                                "开始处理第${index}个视频 - clickComplete is false",
                            )
                            return Pair(false, false)
                        }
                    }
                }
                AMEventUtils.sleep(AMActionDelay.MIDDLE)
                AMEventUtils.reProcessUntilOk(
                    helper,
                    50,
                    AMActionDelay.SHORT,
                    object : Something<Boolean> {
                        override fun judgmentSuccess(result: Boolean): Boolean {
                            return result
                        }

                        override fun work(timeIndex: Int): Boolean {
                            val rootNode = AMCore.instance.amContext?.rootNode() ?: return false
                            val finishNode = AMNodeUtils.getFirstNodeByText(rootNode, true, "完成")
                            if (finishNode != null) {
                                return AMEventUtils.clickFirstClickableParentWithSimulate(
                                    finishNode,
                                    helper
                                )
                            }
                            return true
                        }
                    }).dealWith { isSuc, intercept ->
                    if (!isSuc) {
                        if (intercept) {
                            return Pair(false, true)
                        } else {
                            AMLog.onEDebugLog(
                                "开始处理第${index}个视频 - verifyPublishPage is false",
                            )
                            return Pair(false, false)
                        }
                    }
                }
            }
            return Pair(true, false)
        }
    }

    /**
     * 是否在目标app
     * */
    fun isInTargetApp(target: AMTargetApp): Boolean {
        val rootNode = AMCore.instance.amContext?.rootNode() ?: return false
        val stringBuilder = StringBuilder()
        stringBuilder.append("pageName:")
        stringBuilder.append(rootNode.packageName)
        return rootNode.packageName == target.packageName
    }

    /**
     * 是否在目标app
     * */
    fun isInTargetApps(targets: MutableList<AMTargetApp>): Boolean {
        val rootNode = AMCore.instance.amContext?.rootNode() ?: return false
        val stringBuilder = StringBuilder()
        stringBuilder.append("pageName:")
        stringBuilder.append(rootNode.packageName)

        val packageNames = targets.joinToString(separator = ", ") { it.packageName }
        return if (packageNames.contains(rootNode.packageName?.toString() ?: "")) {
            true
        } else {
            false
        }
    }

    interface IAMTaskCallBack {
        fun action(): Boolean
    }
}