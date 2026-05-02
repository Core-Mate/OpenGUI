package com.coremate.opengui.automation.biz.common.node.wx

import com.coremate.opengui.automation.biz.common.node.NodeWidgetBean

/**
 * We Chat node components
 * */
object IAMWidgetWX {

    /////////////////////////////////////////////////////////////////////////////////
    //
    // Global
    //
    /////////////////////////////////////////////////////////////////////////////////

    //Global/back button 1
    fun globalBack() = NodeWidgetBean(
        mutableListOf(
            "com.tencent.mm:id/a4p",
            "com.tencent.mm:id/actionbar_up_indicator_btn"
        ), "android.widget.ImageView", "", "返回"
    )

    /////////////////////////////////////////////////////////////////////////////////
    //
    // We Chat home
    //
    /////////////////////////////////////////////////////////////////////////////////

    //We Chat home/search 1
    fun mainSearch() = NodeWidgetBean(
        mutableListOf(
            "com.tencent.mm:id/jha"
        ), "android.widget.RelativeLayout", "", "搜索"
    )

    //We Chat home/more 1
    fun mainMore() = NodeWidgetBean(
        mutableListOf(
            "com.tencent.mm:id/jga"
        ), "android.widget.RelativeLayout", "", "更多功能按钮"
    )

    //We Chat home/recent
    fun topTitle() = NodeWidgetBean(
        mutableListOf(
            "com.tencent.mm:id/wp"
        ), "android.widget.TextView", "最近", ""
    )



    /////////////////////////////////////////////////////////////////////////////////
    //
    // Bottom navigation
    //
    /////////////////////////////////////////////////////////////////////////////////

    //tabbottomitemparent container *
    fun indexTabItem() = NodeWidgetBean(
        mutableListOf(
            "com.tencent.mm:id/nvt"
        ), "android.widget.RelativeLayout", "", ""
    )

    //tab Bottom item/unread messages
    fun unReadText() = NodeWidgetBean(
        mutableListOf(
            "com.tencent.mm:id/osw"
        ), "android.widget.TextView", "", ""
    )

    /////////////////////////////////////////////////////////////////////////////////
    //
    // Message
    //
    /////////////////////////////////////////////////////////////////////////////////

    ///Message list/item
    fun messageListItem() = NodeWidgetBean(
        mutableListOf(
            "com.tencent.mm:id/cj1"
        ), "android.widget.LinearLayout", "", ""
    )

    ///Message list/friend nickname
    fun contactNickName() = NodeWidgetBean(
        mutableListOf(
            "com.tencent.mm:id/kbq"
        ), "android.widget.TextView", "", ""
    )

    ///Message list/numbered red dot
    fun messageNumRedItem() = NodeWidgetBean(
        mutableListOf(
            "com.tencent.mm:id/o_u"
        ), "android.widget.TextView", "", ""
    )

    /////////////////////////////////////////////////////////////////////////////////
    //
    // Chat page
    //
    /////////////////////////////////////////////////////////////////////////////////

    //Chat page/conversation list *
    fun chatList() = NodeWidgetBean(
        mutableListOf(
            "com.tencent.mm:id/bp0"
        ), "androidx.recyclerview.widget.RecyclerView", "", ""
    )

    //Chat page/last message content
    fun lastMessage() = NodeWidgetBean(
        mutableListOf(
            "com.tencent.mm:id/bkl"
        ), "android.widget.TextView", "", ""
    )

    //Chat page/send button
    fun sendBtn() = NodeWidgetBean(
        mutableListOf(
            "com.tencent.mm:id/bql"
        ), "android.widget.Button", "", ""
    )


    /////////////////////////////////////////////////////////////////////////////////
    //
    // Moments
    //
    /////////////////////////////////////////////////////////////////////////////////


    //Moments username
    fun fcListUserName() = NodeWidgetBean(
        mutableListOf(
            "com.tencent.mm:id/kbq"
        ), "android.widget.TextView", "", ""
    )

    //Moments/list image set
    fun fcListImages() = NodeWidgetBean(
        mutableListOf(
            "com.tencent.mm:id/n96"
        ), "", "", ""
    )

    //Moments/comment input field
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


    //more Button
    fun fcMoreBtn() = NodeWidgetBean(
        mutableListOf(
            "com.tencent.mm:id/r2"
        ), "android.widget.Button", "", "评论"
    )


}