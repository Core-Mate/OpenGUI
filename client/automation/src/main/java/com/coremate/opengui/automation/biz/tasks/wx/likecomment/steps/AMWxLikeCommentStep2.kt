package com.coremate.opengui.automation.biz.tasks.wx.likecomment.steps

import android.view.accessibility.AccessibilityNodeInfo
import android.widget.ListView
import androidx.recyclerview.widget.RecyclerView
import com.coremate.opengui.automation.base.AMCore
import com.coremate.opengui.automation.base.data.AMDataContainer
import com.coremate.opengui.automation.base.task.AMBaseStep
import com.coremate.opengui.automation.base.task.AMStepCondition
import com.coremate.opengui.automation.base.utils.AMActionDelay
import com.coremate.opengui.automation.base.utils.AMEventUtils
import com.coremate.opengui.automation.base.utils.AMNodeUtils
import com.coremate.opengui.automation.base.utils.Something
import com.coremate.opengui.automation.biz.common.event.wx.AMWxPageEvent
import com.coremate.opengui.automation.biz.tasks.wx.likecomment.AMWxLikeCommentHelper

/**
 * Step 2: Check whether on Moments and swipe to top
 */
internal class AMWxLikeCommentStep2(index: Int, helper: AMWxLikeCommentHelper) :
    AMBaseStep<AMWxLikeCommentHelper>(index, helper) {

    override fun onExecute(data: AMDataContainer?, isResume: Boolean): AMStepCondition {
        val condition = super.onExecute(data, isResume)
        if (condition.isIntercept) {
            return condition
        }

        AMEventUtils.sleep(AMActionDelay.MIDDLE_LONG)
        //Check whether not on Moments
        AMWxPageEvent.comeToFriendMoments(helper, condition, isException = true).let {
            if (it.isIntercept) return it
        }
        //Swipe to top
        val listNode = AMNodeUtils.getNodeByClassName(
            AMCore.instance.amContext?.rootNode(),
            RecyclerView::class.java.name
        )
        AMEventUtils.reProcessUntilOk(
            helper,
            100,
            AMActionDelay.SHORT,
            object : Something<Boolean> {
                override fun judgmentSuccess(result: Boolean): Boolean {
                    return result
                }

                override fun work(timeIndex: Int): Boolean {
                    return listNode?.performAction(AccessibilityNodeInfo.ACTION_SCROLL_BACKWARD) == false
                }
            }).dealWith { isSuc, intercept ->
            //...
        }
        helper.executorService.execute {
            helper.thirdStep()?.onExecute()
        }

        return condition
    }

    override fun onDestroy() {
    }
}