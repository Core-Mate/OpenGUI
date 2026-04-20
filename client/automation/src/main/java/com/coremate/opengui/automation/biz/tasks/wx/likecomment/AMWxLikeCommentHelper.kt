package com.coremate.opengui.automation.biz.tasks.wx.likecomment

import android.view.accessibility.AccessibilityNodeInfo
import com.coremate.opengui.automation.base.task.AMBaseStepHelper
import com.coremate.opengui.automation.biz.tasks.wx.likecomment.bean.AMWxLikeCommentParam

internal class AMWxLikeCommentHelper : AMBaseStepHelper() {

    var param: AMWxLikeCommentParam? = null

    //成功添加的数量
    var sucCount = 0

    //临时节点
    val tempNodeList = mutableListOf<AccessibilityNodeInfo>()

    //列表
    var listNode: AccessibilityNodeInfo? = null

    //临时评论内容
    var tempCommentText = "赞"

    //是否完成
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