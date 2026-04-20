package com.coremate.opengui.automation.biz.tasks.wx.likecomment.bean

import android.view.accessibility.AccessibilityNodeInfo
import android.widget.LinearLayout
import com.coremate.opengui.automation.base.utils.AMNodeUtils
import com.coremate.opengui.automation.biz.common.event.wx.AMWxPageEvent
import com.coremate.opengui.automation.biz.common.node.wx.IAMWidgetWX

//节点模型过滤
data class AMWxLikeCommentItemNode(
    var userName: String = "",                //用户名
    var momentText: String = "",        //文字
    var imageCount: Int = 0             //图片数量
) {
    companion object {
        //通过节点转换为节点模型
        fun transFormNode(contentNode: AccessibilityNodeInfo?): AMWxLikeCommentItemNode? {
            if (contentNode == null) return null

            val data = AMWxLikeCommentItemNode()
            if (contentNode.className != LinearLayout::class.java.name) {
                return data
            }
            //用户名
            val nameNode =
                AMNodeUtils.getFirstNodeById(contentNode, IAMWidgetWX.fcListUserName().resourceId)
            data.userName = nameNode?.text?.toString() ?: ""


            //获取内部的LinearLayout集合
            val llList = AMNodeUtils.getAllNodeByClassName(
                contentNode,
                LinearLayout::class.java.name
            )
            //获取文字的LinearLayout
            var centerTopTextNode: AccessibilityNodeInfo? = null

            if (llList.isNotEmpty()) {
                val list = llList.filter {
                    //过滤带图片的文字链接 和 音乐
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
                //获取朋友圈文字
                if (centerTopTextNode != null) {
                    data.momentText =
                        AMWxPageEvent.getMomentTextFromMomentByLike(centerTopTextNode)
                } else {
                    data.momentText = ""
                }
            } else {
                data.momentText = ""
            }
            //获取图片数量
            val imageNodes =
                AMNodeUtils.getFirstNodeById(contentNode, IAMWidgetWX.fcListImages().resourceId)
            data.imageCount = imageNodes?.childCount ?: 0


            return data
        }
    }
}
