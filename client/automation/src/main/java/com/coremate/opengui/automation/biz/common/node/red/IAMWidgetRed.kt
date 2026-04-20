package com.coremate.opengui.automation.biz.common.node.red

import com.coremate.opengui.automation.biz.common.node.NodeWidgetBean

/**
 * 小红书的节点组件
 * */
object IAMWidgetRed {

    /////////////////////////////////////////////////////////////////////////////////
    //
    //                    全局
    //
    /////////////////////////////////////////////////////////////////////////////////

    //全局/返回按钮 1
    fun globalBack() = NodeWidgetBean(
        mutableListOf(
            "com.xingin.xhs:id/a2i",
            "com.xingin.xhs:id/a2d"
        ), "android.widget.Button", "", ""
    )

    /////////////////////////////////////////////////////////////////////////////////
    //
    //                    底部导航
    //
    /////////////////////////////////////////////////////////////////////////////////

    //tab底部item的父容器 *
    fun indexTabItem() = NodeWidgetBean(
        mutableListOf(
            "com.xingin.xhs:id/igz"
        ), "android.widget.TextView", "", ""
    )

    //tab底部item/未读消息
    fun unReadText() = NodeWidgetBean(
        mutableListOf(
            "com.xingin.xhs:id/gbi"
        ), "android.widget.TextView", "", ""
    )

    /////////////////////////////////////////////////////////////////////////////////
    //
    //                    消息列表
    //
    /////////////////////////////////////////////////////////////////////////////////

    ///消息列表/顶部右边群聊按钮
    fun msgGroupbtn() = NodeWidgetBean(
        mutableListOf(
            "com.xingin.xhs:id/fmq"
        ), "android.widget.TextView", "", "发现群聊"
    )

    ///消息列表/数字红点
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

    ///消息列表/列表
    fun msgList() = NodeWidgetBean(
        mutableListOf(
            "com.xingin.xhs:id/fqk"
        ), "androidx.recyclerview.widget.RecyclerView", "", ""
    )

    ///消息列表/好友昵称
    fun contactNickName() = NodeWidgetBean(
        mutableListOf(
            "com.xingin.xhs:id/fqh"
        ), "android.widget.TextView", "", ""
    )


    /////////////////////////////////////////////////////////////////////////////////
    //
    //                    消息
    //
    /////////////////////////////////////////////////////////////////////////////////

    //聊天页面/会话列表 *
    fun chatList() = NodeWidgetBean(
        mutableListOf(
            "com.xingin.xhs:id/az4"
        ), "androidx.recyclerview.widget.RecyclerView", "", ""
    )

    //聊天页面/最后一条消息内容
    fun lastMessage() = NodeWidgetBean(
        mutableListOf(
            "com.xingin.xhs:id/ayd"
        ), "android.widget.TextView", "", ""
    )

    //聊天页面/发送按钮
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

    //你可能感兴趣的人
    fun likeManNode() = NodeWidgetBean(
        mutableListOf(
            "com.xingin.xhs:id/fth"
        ), "android.widget.TextView", "", ""
    )




}