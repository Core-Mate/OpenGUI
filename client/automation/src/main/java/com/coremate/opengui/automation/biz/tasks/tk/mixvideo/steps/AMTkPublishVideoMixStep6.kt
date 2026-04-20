package com.coremate.opengui.automation.biz.tasks.tk.mixvideo.steps

import android.os.Build
import android.view.accessibility.AccessibilityNodeInfo
import androidx.annotation.RequiresApi
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
 * 第6步：填写信息，点击合成
 */
internal class AMTkPublishVideoMixStep6(index: Int, helper: AMTkPublishVideoMixHelper) :
    AMBaseStep<AMTkPublishVideoMixHelper>(index, helper) {

    override fun onExecute(data: AMDataContainer?, isResume: Boolean): AMStepCondition {
        val condition = super.onExecute(data, isResume)
        if (condition.isIntercept) {
            return condition
        }

        AMEventUtils.sleep(AMActionDelay.MIDDLE)
        AMEventUtils.reProcessUntilOk(
            helper,
            10,
            AMActionDelay.MIDDLE,
            object : Something<Boolean> {
                override fun judgmentSuccess(result: Boolean): Boolean {
                    return result
                }

                @RequiresApi(Build.VERSION_CODES.O)
                override fun work(timeIndex: Int): Boolean {
                    val rootNode = AMCore.instance.amContext?.rootNode() ?: return false
                    val node = AMNodeUtils.getFirstNodeByDescCallBack(rootNode, object :
                        MatchCallback<AccessibilityNodeInfo> {
                        override fun isMatch(result: AccessibilityNodeInfo?): Boolean {
                            return result?.className == "com.lynx.tasm.behavior.ui.text.FlattenUIText"

                        }
                    }, "你想推广什么")
                    return node != null
                }
            }, isInterruptIgnore = false
        ).dealWith { isSuc, intercept ->
            if (!isSuc) {
                throw AMTaskException.business("开始生成的弹窗未弹出")
            }
            if (intercept) {
                return condition.interceptted()
            }
        }

        AMEventUtils.sleep(AMActionDelay.MIDDLE)
        var editNode: AccessibilityNodeInfo? = null
        //长按
        AMEventUtils.reProcessUntilOk(
            helper,
            10,
            AMActionDelay.MIDDLE,
            object : Something<Boolean> {
                override fun judgmentSuccess(result: Boolean): Boolean {
                    return result
                }

                @RequiresApi(Build.VERSION_CODES.O)
                override fun work(timeIndex: Int): Boolean {
                    val rootNode = AMCore.instance.amContext?.rootNode() ?: return false
                    editNode =
                        AMNodeUtils.getNodeByClassName(
                            rootNode,
                            IAMWidgetLV.mixLynxTextAreaView().classCame
                        ) ?: return false
                    return AMEventUtils.doLongClickDown(editNode, helper)
                }
            }, isInterruptIgnore = false
        ).dealWith { isSuc, intercept ->
            if (intercept) {
                return condition.interceptted()
            }
        }

        AMEventUtils.sleep(AMActionDelay.LONG)
        AMEventUtils.sleep(AMActionDelay.MINI)
        //粘贴
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
                    editNode =
                        AMNodeUtils.getNodeByClassName(
                            rootNode,
                            IAMWidgetLV.mixLynxTextAreaView().classCame
                        ) ?: return false

                    return AMEventUtils.doClickDown2(
                        helper,
                        60f,
                        300f
                    )
                }
            }).dealWith { isSuc, intercept ->
        }
        AMEventUtils.sleep(AMActionDelay.SHORT)
        //点击键盘消失
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
                    editNode =
                        AMNodeUtils.getNodeByClassName(
                            rootNode,
                            IAMWidgetLV.mixLynxTextAreaView().classCame
                        ) ?: return false

                    return AMEventUtils.doClickDown2(
                        helper,
                        20f,
                        180f
                    )
                }
            }).dealWith { isSuc, intercept ->
        }
        AMEventUtils.sleep(AMActionDelay.MIDDLE)

        //点击合成
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
                    val startNode =
                        AMNodeUtils.getFirstNodeByDescCallBack(
                            rootNode,
                            object :
                                MatchCallback<AccessibilityNodeInfo> {
                                override fun isMatch(result: AccessibilityNodeInfo?): Boolean {
                                    return result?.className == IAMWidgetLV.mixStartMixBtn().classCame
                                }
                            }, IAMWidgetLV.mixStartMixBtn().text
                        ) ?: return false

                    return AMEventUtils.clickFirstClickableParentWithSimulate(startNode, helper)
                }
            }).dealWith { isSuc, intercept ->
            if (!isSuc) {
                throw AMTaskException.business("点击生成失败")
            }
        }

        helper.executorService.execute {
            helper.sevenStep()?.onExecute()
        }

        return condition
    }

    override fun onDestroy() {
    }
}