package com.coremate.opengui.automation.biz.tasks.wx.likecomment.steps

import androidx.recyclerview.widget.RecyclerView
import com.coremate.opengui.automation.base.AMCore
import com.coremate.opengui.automation.base.data.AMDataContainer
import com.coremate.opengui.automation.base.exception.AMTaskException
import com.coremate.opengui.automation.base.task.AMBaseStep
import com.coremate.opengui.automation.base.task.AMStepCondition
import com.coremate.opengui.automation.base.utils.AMActionDelay
import com.coremate.opengui.automation.base.utils.AMEventUtils
import com.coremate.opengui.automation.base.utils.AMLog
import com.coremate.opengui.automation.base.utils.AMNodeUtils
import com.coremate.opengui.automation.biz.common.event.wx.AMWxPageEvent
import com.coremate.opengui.automation.biz.common.node.wx.IAMWidgetWX
import com.coremate.opengui.automation.biz.tasks.wx.likecomment.AMWxLikeCommentHelper
import com.coremate.opengui.automation.biz.tasks.wx.likecomment.bean.AMWxLikeCommentItemNode

/**
 * Step 3: Get list node collection
 */
internal class AMWxLikeCommentStep3(index: Int, helper: AMWxLikeCommentHelper) :
    AMBaseStep<AMWxLikeCommentHelper>(index, helper) {

    //Already-added nodes
    private var alreadyAddNode = mutableListOf<AMWxLikeCommentItemNode>()

    override fun onExecute(data: AMDataContainer?, isResume: Boolean): AMStepCondition {
        val condition = super.onExecute(data, isResume)
        if (condition.isIntercept) {
            return condition
        }

        AMEventUtils.sleep(AMActionDelay.SHORT)
        //Clear temporary list
        helper.tempNodeList.clear()
        if (helper.isFinish) {
            //Complete
            helper.amContext.processListener?.onProcessTaskFinish(
                true,
                System.currentTimeMillis() - helper.startTime,
            )
            return condition
        }

        while (true) {
            if (helper.isTaskPauseOrStop()) {
                AMLog.onEDebugLog("任务停止在第${index}步1 - 步骤内")
                return condition.interceptted()
            }
            //Get all Moments on the current page
            val rootNode = AMCore.instance.amContext?.rootNode()
            //Page List View
            val listNode = AMNodeUtils.getNodeByClassName(rootNode, RecyclerView::class.java.name)
            helper.listNode = listNode
            val momentList = AMWxPageEvent.getMoments2()
            //Check Momentswhetheris empty
            if (momentList.isEmpty()) {
                throw AMTaskException.business("朋友圈是空的")
            }

            for (i in 0 until momentList.size) {
                val itemNode = momentList[i]
               val moreBtn = AMNodeUtils.getFirstNodeById(
                    itemNode,
                    IAMWidgetWX.fcMoreBtn().resourceId
                ) ?: continue
                val nodeData = AMWxLikeCommentItemNode.transFormNode(itemNode)
                //Filter already-added nodes
                if (nodeData != null && alreadyAddNode.contains(nodeData)) {
                    continue
                }
                //Record
                if (nodeData != null) {
                    helper.tempNodeList.add(itemNode)
                    alreadyAddNode.add(nodeData)
                    //TODO: record only one item
                    break
                }
            }
            //Execute step 4 when the temporary list is not empty
            if (helper.tempNodeList.isNotEmpty()) {
                AMLog.onEDebugLog("本次有${helper.tempNodeList.size}条")
                helper.executorService.execute {
                    helper.forthStep()?.onExecute()
                }
                return condition
            }
            var isSwipe = false
            //Check loading state
            while (true) {
                if (AMNodeUtils.getFirstNodeByText(listNode, true, "正在加载") == null) break
                if (!isSwipe) {
                    isSwipe = true
                    AMEventUtils.doSwipeUp(listNode, helper)
                }
                if (helper.isTaskPauseOrStop()) {
                    AMLog.onEDebugLog("任务停止在第${index}步2 - 步骤内")
                    return condition.interceptted()
                }
            }
            //Check end state
            if (helper.sucCount >= (helper.param?.count ?: 0)) {
                AMLog.onEDebugLog("缓存完毕，结束循环")
                break
            }

//            if (listNode?.performAction(AccessibilityNodeInfo.ACTION_SCROLL_FORWARD) == false) {
// AMLog.onEDebugLog("Swipe complete, end loop")
//                break
//            }
            AMEventUtils.sleep(AMActionDelay.LONG)
        }
        //Complete
        helper.amContext.processListener?.onProcessTaskFinish(
            true,
            System.currentTimeMillis() - helper.startTime,
        )
        return condition
    }

    override fun onDestroy() {
    }
}