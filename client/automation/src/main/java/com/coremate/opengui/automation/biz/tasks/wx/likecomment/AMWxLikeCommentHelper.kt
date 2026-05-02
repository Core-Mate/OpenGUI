package com.coremate.opengui.automation.biz.tasks.wx.likecomment

import android.view.accessibility.AccessibilityNodeInfo
import com.coremate.opengui.automation.base.task.AMBaseStepHelper
import com.coremate.opengui.automation.biz.tasks.wx.likecomment.bean.AMWxLikeCommentParam

internal class AMWxLikeCommentHelper : AMBaseStepHelper() {

    var param: AMWxLikeCommentParam? = null

    //Number added successfully
    var sucCount = 0

    //temporary Node
    val tempNodeList = mutableListOf<AccessibilityNodeInfo>()

    //List
    var listNode: AccessibilityNodeInfo? = null

    //Temporary comment content
    var tempCommentText = "赞"

    //Whether complete
    var isFinish = false

    override fun onObserveTaskResume() {
        when (currentStep) {
            1, 2, 3 -> {
                get(currentStep - 1)?.onExecute(isResume = true)
            }

            else -> {
                forthStep()?.onExecute(isResume = true)
            }
        }

    }
}