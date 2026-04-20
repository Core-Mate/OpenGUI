package com.coremate.opengui.automation.biz.tasks.tk.mixvideo.steps

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
import com.coremate.opengui.automation.biz.tasks.tk.mixvideo.AMTkPublishVideoMixHelper

/**
 * 第2步：点击营销视频
 */
internal class AMTkPublishVideoMixStep2(index: Int, helper: AMTkPublishVideoMixHelper) :
    AMBaseStep<AMTkPublishVideoMixHelper>(index, helper) {

    override fun onExecute(data: AMDataContainer?, isResume: Boolean): AMStepCondition {
        val condition = super.onExecute(data, isResume)
        if (condition.isIntercept) {
            return condition
        }

        var gridViewNode: AccessibilityNodeInfo? = null
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
                    gridViewNode =
                        AMNodeUtils.getFirstNodeById(
                            rootNode,
                            IAMWidgetLV.homeToolsGridView().resourceId
                        )
                    return gridViewNode != null
                }
            }).dealWith { isSuc, intercept ->
            //...
        }
        if (gridViewNode == null) {
            ///兼容首次布局
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
                        gridViewNode =
                            AMNodeUtils.getFirstNodeById(
                                rootNode,
                                IAMWidgetLV.homeToolsFirstGridView().resourceId
                            )
                        return gridViewNode != null
                    }
                }).dealWith { isSuc, intercept ->
                //...
            }
            if (gridViewNode == null) {
                throw AMTaskException.business("未找到营销视频所在列表")
            }
            //点击进入营销成片
            AMEventUtils.reProcessUntilOk(
                helper,
                10,
                AMActionDelay.SHORT,
                object : Something<Boolean> {
                    override fun judgmentSuccess(result: Boolean): Boolean {
                        return result
                    }

                    override fun work(timeIndex: Int): Boolean {
                        val videoNode =
                            AMNodeUtils.getFirstNodeByIdWithCallback(
                                gridViewNode,
                                object :
                                    MatchCallback<AccessibilityNodeInfo> {
                                    override fun isMatch(result: AccessibilityNodeInfo?): Boolean {
                                        return result?.text.toString() == IAMWidgetLV.mixMarketingFirstVideos().text
                                    }
                                },
                                IAMWidgetLV.mixMarketingFirstVideos().resourceId
                            ) ?: return false
                        return AMEventUtils.clickFirstClickableParentWithSimulate(videoNode, helper)
                    }
                }).dealWith { isSuc, intercept ->
                if (!isSuc) {
                    throw AMTaskException.business("点击营销成片失败")
                }
            }
        } else {
            //点击进入营销视频
            AMEventUtils.reProcessUntilOk(
                helper,
                10,
                AMActionDelay.SHORT,
                object : Something<Boolean> {
                    override fun judgmentSuccess(result: Boolean): Boolean {
                        return result
                    }

                    override fun work(timeIndex: Int): Boolean {
                        val videoNode =
                            AMNodeUtils.getFirstNodeByIdWithCallback(
                                gridViewNode,
                                object :
                                    MatchCallback<AccessibilityNodeInfo> {
                                    override fun isMatch(result: AccessibilityNodeInfo?): Boolean {
                                        return result?.text.toString() == IAMWidgetLV.mixMarketingVideos().text
                                    }
                                },
                                IAMWidgetLV.mixMarketingVideos().resourceId
                            ) ?: return false
                        return AMEventUtils.clickFirstClickableParentWithSimulate(videoNode, helper)
                    }
                }).dealWith { isSuc, intercept ->
                if (!isSuc) {
                    throw AMTaskException.business("点击营销视频失败")
                }
            }
        }

        helper.executorService.execute {
            helper.thirdStep()?.onExecute()
        }

        return condition
    }

    override fun onDestroy() {
    }
}