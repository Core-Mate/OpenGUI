package com.coremate.opengui.automation.biz.tasks.common.check.steps.red.steps

import android.text.TextUtils
import android.view.accessibility.AccessibilityNodeInfo
import android.widget.LinearLayout
import android.widget.RelativeLayout
import com.google.android.accessibility.selecttospeak.SelectToSpeakService
import com.coremate.opengui.automation.base.AMCore
import com.coremate.opengui.automation.base.data.AMDataContainer
import com.coremate.opengui.automation.base.exception.AMTaskException
import com.coremate.opengui.automation.base.task.AMBaseStep
import com.coremate.opengui.automation.base.task.AMStepCondition
import com.coremate.opengui.automation.base.utils.AMActionDelay
import com.coremate.opengui.automation.base.utils.AMEventUtils
import com.coremate.opengui.automation.base.utils.AMLog
import com.coremate.opengui.automation.base.utils.AMNodeUtils
import com.coremate.opengui.automation.biz.common.node.red.IAMWidgetRed
import com.coremate.opengui.automation.biz.tasks.common.check.steps.red.AMRedAutoReplyHelper

/**
 * Step 3: Traverse the message list
 */
internal class AMRedAutoReplyStep3(index: Int, helper: AMRedAutoReplyHelper) :
    AMBaseStep<AMRedAutoReplyHelper>(index, helper) {

    //Already-added friend info
    private var alreadyAddFriends = mutableListOf<String>()

    override fun onExecute(data: AMDataContainer?, isResume: Boolean): AMStepCondition {
        val condition = super.onExecute(data, isResume)
        if (condition.isIntercept || !helper.isOngoing()) {
            return condition
        }

        SelectToSpeakService.service?.changeAccessibilityFlags(true)
        AMEventUtils.sleep(AMActionDelay.SHORT)
        //Clear temporary list
        alreadyAddFriends.clear()
        helper.tempNodeList.clear()
        while (true) {
            if (!helper.isOngoing() || helper.isTaskPauseOrStop()) {
                return condition
            }
            //Root node
            var rootNode = AMCore.instance.amContext?.rootNode()
            if (rootNode == null) {
                AMEventUtils.sleep(AMActionDelay.MIDDLE)
                rootNode = AMCore.instance.amContext?.rootNode()
            }
            //List node
            var listViewNode =
                AMNodeUtils.getFirstNodeById(rootNode, IAMWidgetRed.msgList().resourceId)
                    ?: throw AMTaskException.business("列表为空")

            ///Whether to swipe to the top
            var isNoCanSlide = false
            if (data?.extra is Boolean) {
                isNoCanSlide = data.extra as Boolean
            }
            //Swipe to the top
            while (true) {
                if (!helper.isOngoing() || helper.isTaskPauseOrStop()) {
                    return condition
                }
                if (!listViewNode.performAction(AccessibilityNodeInfo.ACTION_SCROLL_BACKWARD)) {
                    AMEventUtils.sleep(AMActionDelay.LONG)
                    break
                }
            }
            listViewNode =
                AMNodeUtils.getFirstNodeById(rootNode, IAMWidgetRed.msgList().resourceId)
                    ?: throw AMTaskException.business("列表为空")

            for (i in 0..<listViewNode.childCount) {
                val tvNodeInfo = listViewNode.getChild(i)
                if (i == 0 && tvNodeInfo.className.toString() == LinearLayout::class.java.name) {
                    //Filter nodes without red dots
                    for (j in 0..<tvNodeInfo.childCount) {
                        val subNode = tvNodeInfo.getChild(j)
                        val numRedInfo = AMNodeUtils.getFirstNodeById(
                            subNode,
                            IAMWidgetRed.messageNumRedItem().resourceId
                        )
                        if (numRedInfo != null) {
                            //Filter already-added nodes
                            if (alreadyAddFriends.contains("topTab$j")) {
                                continue
                            }
                            //Add to the main array
                            alreadyAddFriends.add("topTab$j")
                            //Add to the temporary array
                            helper.tempNodeList.add(subNode)
                        }
                    }
                    continue
                }
                //1. Check whether the node is null
                if (tvNodeInfo.className.toString() != RelativeLayout::class.java.name) continue
                val nameInfo = AMNodeUtils.getFirstNodeById(
                    tvNodeInfo,
                    IAMWidgetRed.contactNickName().resourceId
                )
                //2. Check whether the user nickname is empty; name may repeat, ignore for now
                val name = nameInfo?.text.toString()
                if (TextUtils.isEmpty(name)) continue

                //3.Filter nodes without red dots
                val numRedInfo2 = AMNodeUtils.getFirstNodeById(
                    tvNodeInfo,
                    IAMWidgetRed.messageNumRedItem2().resourceId
                )

                if (numRedInfo2 == null) {
                    continue
                }
                //4.Filter already-added nodes
                if (alreadyAddFriends.contains(name)) {
                    continue
                }
                //Add to the main array
                alreadyAddFriends.add(name)
                //Add to the temporary array
                helper.tempNodeList.add(tvNodeInfo)

            }
            //Execute step 4 when the temporary list is not empty
            if (helper.tempNodeList.isNotEmpty()) {
                helper.executorService.execute {
                    if (helper.isOngoing()) {
                        helper.forthStep()?.onExecute()
                    }
                }
                return condition
            }
            //Swipe
            val manNode = AMNodeUtils.getFirstNodeById(
                listViewNode,
                IAMWidgetRed.likeManNode().resourceId
            )
            if (manNode != null) {
                break
            }
            if (listViewNode.performAction(AccessibilityNodeInfo.ACTION_SCROLL_FORWARD)) {
                AMEventUtils.sleep(AMActionDelay.MIDDLE)
                continue
            } else {
                AMLog.onEDebugLog("跳出第3步，回复完成")
                break
            }
        }

        ///Return to step 2 and continue
        helper.executorService.execute {
            if (helper.isOngoing()) {
                helper.secondStep()?.onExecute()
            }
        }

        return condition
    }


    override fun onDestroy() {
    }

}