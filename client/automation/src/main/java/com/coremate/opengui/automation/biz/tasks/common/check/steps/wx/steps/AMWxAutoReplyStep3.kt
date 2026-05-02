package com.coremate.opengui.automation.biz.tasks.common.check.steps.wx.steps

import android.text.TextUtils
import android.view.accessibility.AccessibilityNodeInfo
import android.widget.ListView
import com.coremate.opengui.automation.base.AMCore
import com.coremate.opengui.automation.base.data.AMDataContainer
import com.coremate.opengui.automation.base.exception.AMTaskException
import com.coremate.opengui.automation.base.task.AMBaseStep
import com.coremate.opengui.automation.base.task.AMStepCondition
import com.coremate.opengui.automation.base.utils.AMActionDelay
import com.coremate.opengui.automation.base.utils.AMEventUtils
import com.coremate.opengui.automation.base.utils.AMLog
import com.coremate.opengui.automation.base.utils.AMNodeUtils
import com.coremate.opengui.automation.base.utils.Something
import com.coremate.opengui.automation.biz.common.node.wx.IAMWidgetWX
import com.coremate.opengui.automation.biz.tasks.common.check.steps.wx.AMWxAutoReplyHelper

/**
 * Step 3: Traverse the message list
 */
internal class AMWxAutoReplyStep3(index: Int, helper: AMWxAutoReplyHelper) :
    AMBaseStep<AMWxAutoReplyHelper>(index, helper) {

    //Already-added friend info
    private var alreadyAddFriends = mutableListOf<String>()

    override fun onExecute(data: AMDataContainer?, isResume: Boolean): AMStepCondition {
        val condition = super.onExecute(data, isResume)
        if (condition.isIntercept || !helper.isOngoing()) {
            return condition
        }

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
            val listViewNode = AMNodeUtils.getNodeByClassName(rootNode, ListView::class.java.name)
                ?: throw AMTaskException.business("列表为空")

            //Get listViewItem collection
            val itemList = AMNodeUtils.getAllNodeById(
                listViewNode,
                IAMWidgetWX.messageListItem().resourceId
            )

            ///Whether to swipe to the top
            var isNoCanSlide = false
            if (data?.extra is Boolean) {
                isNoCanSlide = data.extra as Boolean
            }
            if (!isNoCanSlide) {
                //Tap the top entry to return to bottom
                AMEventUtils.reProcessUntilOk(
                    helper,
                    3,
                    AMActionDelay.SHORT,
                    object : Something<Boolean> {
                        override fun judgmentSuccess(result: Boolean): Boolean {
                            return result
                        }

                        override fun work(timeIndex: Int): Boolean {
                            return AMEventUtils.doClickDownByY(helper, y = 30f)
                        }
                    }).dealWith { isSuc, intercept ->
                }
                AMEventUtils.sleep(AMActionDelay.SHORT)
            }


            for (tvNodeInfo in itemList) {
                //1. Check whether the node is null
                if (tvNodeInfo == null) continue
                val nameInfo = AMNodeUtils.getFirstNodeById(
                    tvNodeInfo,
                    IAMWidgetWX.contactNickName().resourceId
                )
                //2. Check whether the user nickname is empty; name may repeat, ignore for now
                val name = nameInfo?.text.toString()
                if (TextUtils.isEmpty(name)) continue

                //3.Filter nodes without red dots
                val numRedInfo = AMNodeUtils.getFirstNodeById(
                    tvNodeInfo,
                    IAMWidgetWX.messageNumRedItem().resourceId
                )
                if (numRedInfo == null) {
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