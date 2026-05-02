package com.coremate.opengui.automation.biz.tasks.wx.likecomment.bean

import android.view.accessibility.AccessibilityNodeInfo
import android.widget.LinearLayout
import com.coremate.opengui.automation.base.utils.AMNodeUtils
import com.coremate.opengui.automation.biz.common.event.wx.AMWxPageEvent
import com.coremate.opengui.automation.biz.common.node.wx.IAMWidgetWX

//Node model filter
data class AMWxLikeCommentItemNode(
    var userName: String = "",                // Username.
    var momentText: String = "",        // Text.
    var imageCount: Int = 0             // Image count.
) {
    companion object {
        //Convert node to node model
        fun transFormNode(contentNode: AccessibilityNodeInfo?): AMWxLikeCommentItemNode? {
            if (contentNode == null) return null

            val data = AMWxLikeCommentItemNode()
            if (contentNode.className != LinearLayout::class.java.name) {
                return data
            }
            // Username.
            val nameNode =
                AMNodeUtils.getFirstNodeById(contentNode, IAMWidgetWX.fcListUserName().resourceId)
            data.userName = nameNode?.text?.toString() ?: ""


            // Get inner LinearLayout collection.
            val llList = AMNodeUtils.getAllNodeByClassName(
                contentNode,
                LinearLayout::class.java.name
            )
            // Get text LinearLayout.
            var centerTopTextNode: AccessibilityNodeInfo? = null

            if (llList.isNotEmpty()) {
                val list = llList.filter {
                    //Filter text links with images and music
                    AMNodeUtils.getFirstNodeByDesc(
                        it,
                        false,
                        "图片"
                    ) == null && AMNodeUtils.getFirstNodeByDesc(
                        it,
                        false,
                        "点击播放音乐"
                    ) == null && it != contentNode
                }
                if (list.isNotEmpty()) {
                    centerTopTextNode = list.first()
                }
                //Get Moments Text
                if (centerTopTextNode != null) {
                    data.momentText =
                        AMWxPageEvent.getMomentTextFromMomentByLike(centerTopTextNode)
                } else {
                    data.momentText = ""
                }
            } else {
                data.momentText = ""
            }
            //Get image count
            val imageNodes =
                AMNodeUtils.getFirstNodeById(contentNode, IAMWidgetWX.fcListImages().resourceId)
            data.imageCount = imageNodes?.childCount ?: 0


            return data
        }
    }
}
