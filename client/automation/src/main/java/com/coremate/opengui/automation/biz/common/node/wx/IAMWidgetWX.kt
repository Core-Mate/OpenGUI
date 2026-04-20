package com.coremate.opengui.automation.biz.common.node.wx

import com.coremate.opengui.automation.biz.common.node.NodeWidgetBean

/**
 * 微信的节点组件
 * */
object IAMWidgetWX {

    /////////////////////////////////////////////////////////////////////////////////
    //
    //                     全局
    //
    /////////////////////////////////////////////////////////////////////////////////

    //全局/返回按钮 1
    fun globalBack() = NodeWidgetBean(
        mutableListOf(
            "com.tencent.mm:id/a4p",
            "com.tencent.mm:id/actionbar_up_indicator_btn"
        ), "android.widget.ImageView", "", "返回"
    )

    /////////////////////////////////////////////////////////////////////////////////
    //
    //                    微信首页
    //
    /////////////////////////////////////////////////////////////////////////////////

    //微信首页/搜索 1
    fun mainSearch() = NodeWidgetBean(
        mutableListOf(
            "com.tencent.mm:id/jha"
        ), "android.widget.RelativeLayout", "", "搜索"
    )

    //微信首页/更多 1
    fun mainMore() = NodeWidgetBean(
        mutableListOf(
            "com.tencent.mm:id/jga"
        ), "android.widget.RelativeLayout", "", "更多功能按钮"
    )

    //微信首页/最近
    fun topTitle() = NodeWidgetBean(
        mutableListOf(
            "com.tencent.mm:id/wp"
        ), "android.widget.TextView", "最近", ""
    )



    /////////////////////////////////////////////////////////////////////////////////
    //
    //                    底部导航
    //
    /////////////////////////////////////////////////////////////////////////////////

    //tab底部item的父容器 *
    fun indexTabItem() = NodeWidgetBean(
        mutableListOf(
            "com.tencent.mm:id/nvt"
        ), "android.widget.RelativeLayout", "", ""
    )

    //tab底部item/未读消息
    fun unReadText() = NodeWidgetBean(
        mutableListOf(
            "com.tencent.mm:id/osw"
        ), "android.widget.TextView", "", ""
    )

    /////////////////////////////////////////////////////////////////////////////////
    //
    //                    消息
    //
    /////////////////////////////////////////////////////////////////////////////////

    ///消息列表/item
    fun messageListItem() = NodeWidgetBean(
        mutableListOf(
            "com.tencent.mm:id/cj1"
        ), "android.widget.LinearLayout", "", ""
    )

    ///消息列表/好友昵称
    fun contactNickName() = NodeWidgetBean(
        mutableListOf(
            "com.tencent.mm:id/kbq"
        ), "android.widget.TextView", "", ""
    )

    ///消息列表/数字红点
    fun messageNumRedItem() = NodeWidgetBean(
        mutableListOf(
            "com.tencent.mm:id/o_u"
        ), "android.widget.TextView", "", ""
    )

    /////////////////////////////////////////////////////////////////////////////////
    //
    //                    聊天页面
    //
    /////////////////////////////////////////////////////////////////////////////////

    //聊天页面/会话列表 *
    fun chatList() = NodeWidgetBean(
        mutableListOf(
            "com.tencent.mm:id/bp0"
        ), "androidx.recyclerview.widget.RecyclerView", "", ""
    )

    //聊天页面/最后一条消息内容
    fun lastMessage() = NodeWidgetBean(
        mutableListOf(
            "com.tencent.mm:id/bkl"
        ), "android.widget.TextView", "", ""
    )

    //聊天页面/发送按钮
    fun sendBtn() = NodeWidgetBean(
        mutableListOf(
            "com.tencent.mm:id/bql"
        ), "android.widget.Button", "", ""
    )


    /////////////////////////////////////////////////////////////////////////////////
    //
    //                    朋友圈
    //
    /////////////////////////////////////////////////////////////////////////////////


    //朋友圈用户名
    fun fcListUserName() = NodeWidgetBean(
        mutableListOf(
            "com.tencent.mm:id/kbq"
        ), "android.widget.TextView", "", ""
    )

    //朋友圈/列表图片集合
    fun fcListImages() = NodeWidgetBean(
        mutableListOf(
            "com.tencent.mm:id/n96"
        ), "", "", ""
    )

    //朋友圈/评论输入框
    fun fcListCommentEdit() = NodeWidgetBean(
        mutableListOf(
            "com.tencent.mm:id/p0"
        ), "android.widget.EditText", "", ""
    )

    fun fcListCommentSend() = NodeWidgetBean(
        mutableListOf(
            "com.tencent.mm:id/p4"
        ), "android.widget.Button", "", ""
    )


    //更多按钮
    fun fcMoreBtn() = NodeWidgetBean(
        mutableListOf(
            "com.tencent.mm:id/r2"
        ), "android.widget.Button", "", "评论"
    )


}