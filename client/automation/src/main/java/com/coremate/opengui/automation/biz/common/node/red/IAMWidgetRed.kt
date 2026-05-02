package com.coremate.opengui.automation.biz.common.node.red

import com.coremate.opengui.automation.biz.common.node.NodeWidgetBean

/**
 * Xiaohongshu node components
 * */
object IAMWidgetRed {

    /////////////////////////////////////////////////////////////////////////////////
    //
    // Global
    //
    /////////////////////////////////////////////////////////////////////////////////

    //Global/back button 1
    fun globalBack() = NodeWidgetBean(
        mutableListOf(
            "com.xingin.xhs:id/a2i",
            "com.xingin.xhs:id/a2d"
        ), "android.widget.Button", "", ""
    )

    /////////////////////////////////////////////////////////////////////////////////
    //
    // Bottom navigation
    //
    /////////////////////////////////////////////////////////////////////////////////

    //tabbottomitemparent container *
    fun indexTabItem() = NodeWidgetBean(
        mutableListOf(
            "com.xingin.xhs:id/igz"
        ), "android.widget.TextView", "", ""
    )

    //tab Bottom item/unread messages
    fun unReadText() = NodeWidgetBean(
        mutableListOf(
            "com.xingin.xhs:id/gbi"
        ), "android.widget.TextView", "", ""
    )

    /////////////////////////////////////////////////////////////////////////////////
    //
    // Message list
    //
    /////////////////////////////////////////////////////////////////////////////////

    ///Message list/top-right group chat button
    fun msgGroupbtn() = NodeWidgetBean(
        mutableListOf(
            "com.xingin.xhs:id/fmq"
        ), "android.widget.TextView", "", "发现群聊"
    )

    ///Message list/numbered red dot
    fun messageNumRedItem() = NodeWidgetBean(
        mutableListOf(
            "com.xingin.xhs:id/ce2"
        ), "android.widget.TextView", "", ""
    )

    fun messageNumRedItem2() = NodeWidgetBean(
        mutableListOf(
            "com.xingin.xhs:id/a3u"
        ), "android.widget.TextView", "", ""
    )

    ///Message list/list
    fun msgList() = NodeWidgetBean(
        mutableListOf(
            "com.xingin.xhs:id/fqk"
        ), "androidx.recyclerview.widget.RecyclerView", "", ""
    )

    ///Message list/friend nickname
    fun contactNickName() = NodeWidgetBean(
        mutableListOf(
            "com.xingin.xhs:id/fqh"
        ), "android.widget.TextView", "", ""
    )


    /////////////////////////////////////////////////////////////////////////////////
    //
    // Message
    //
    /////////////////////////////////////////////////////////////////////////////////

    //Chat page/conversation list *
    fun chatList() = NodeWidgetBean(
        mutableListOf(
            "com.xingin.xhs:id/az4"
        ), "androidx.recyclerview.widget.RecyclerView", "", ""
    )

    //Chat page/last message content
    fun lastMessage() = NodeWidgetBean(
        mutableListOf(
            "com.xingin.xhs:id/ayd"
        ), "android.widget.TextView", "", ""
    )

    //Chat page/send button
    fun sendBtn() = NodeWidgetBean(
        mutableListOf(
            "com.xingin.xhs:id/ayy"
        ), "android.widget.Button", "", ""
    )

    fun chatEdit() = NodeWidgetBean(
        mutableListOf(
            "com.xingin.xhs:id/ayp"
        ), "android.widget.EditText", "", ""
    )

    //People you may be interested in
    fun likeManNode() = NodeWidgetBean(
        mutableListOf(
            "com.xingin.xhs:id/fth"
        ), "android.widget.TextView", "", ""
    )




}