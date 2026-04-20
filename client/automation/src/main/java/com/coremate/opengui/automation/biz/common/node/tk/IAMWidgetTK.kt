package com.coremate.opengui.automation.biz.common.node.tk

import com.coremate.opengui.automation.biz.common.node.NodeWidgetBean

/**
 * 抖音的节点组件
 * */
object IAMWidgetTK {

    /////////////////////////////////////////////////////////////////////////////////
    //
    //                    全局
    //
    /////////////////////////////////////////////////////////////////////////////////

    //全局loading *
    fun loading() = NodeWidgetBean(
        mutableListOf(
            "com.ss.android.ugc.aweme:id/emz"
        ), "android.widget.RelativeLayout", "", ""
    )

    //全局/返回 *
    fun backBtn() = NodeWidgetBean(
        mutableListOf(
            "com.ss.android.ugc.aweme:id/back_btn"
        ), "android.widget.ImageView", "", "返回"
    )

    /////////////////////////////////////////////////////////////////////////////////
    //
    //                    主页
    //
    /////////////////////////////////////////////////////////////////////////////////

    //主页/搜索 *
    fun mainSearchBtn() = NodeWidgetBean(
        mutableListOf(
            "com.ss.android.ugc.aweme:id/obj"
        ), "android.widget.Button", "", "搜索"
    )

    /////////////////////////////////////////////////////////////////////////////////
    //
    //                    底部导航
    //
    /////////////////////////////////////////////////////////////////////////////////

    //tab底部item的父容器 *
    fun indexTabItem() = NodeWidgetBean(
        mutableListOf(
            "com.ss.android.ugc.aweme:id/n6t"
        ), "android.widget.TextView", "", ""
    )

    //tab底部item/未读消息
    fun unReadText() = NodeWidgetBean(
        mutableListOf(
            "com.ss.android.ugc.aweme:id/nt="
        ), "android.widget.TextView", "", ""
    )

    /////////////////////////////////////////////////////////////////////////////////
    //
    //                    消息列表
    //
    /////////////////////////////////////////////////////////////////////////////////

    ///消息列表/顶部搜索
    fun msgSearchBtn() = NodeWidgetBean(
        mutableListOf(
            "com.ss.android.ugc.aweme:id/gwd"
        ), "android.widget.Button", "", "搜索"
    )

    ///消息列表/列表
    fun msgList() = NodeWidgetBean(
        mutableListOf(
            "com.ss.android.ugc.aweme:id/mp4"
        ), "androidx.recyclerview.widget.RecyclerView", "", ""
    )


    ///消息列表/好友昵称
    fun contactNickName() = NodeWidgetBean(
        mutableListOf(
            "com.ss.android.ugc.aweme:id/tv_title"
        ), "android.widget.TextView", "", ""
    )

    ///消息列表/数字红点
    fun messageNumRedItem() = NodeWidgetBean(
        mutableListOf(
            "com.ss.android.ugc.aweme:id/red_tips_count_view"
        ), "android.widget.TextView", "", ""
    )

    fun messageNumRedItem2() = NodeWidgetBean(
        mutableListOf(
            "com.ss.android.ugc.aweme:id/lpo"
        ), "android.widget.TextView", "", ""
    )

    ///消息列表/红点
    fun messageRedItem() = NodeWidgetBean(
        mutableListOf(
            "com.ss.android.ugc.aweme:id/g76"
        ), "android.widget.LinearLayout", "", ""
    )


    /////////////////////////////////////////////////////////////////////////////////
    //
    //                    发布页面
    //
    /////////////////////////////////////////////////////////////////////////////////

    //聊天页面/返回 *
    fun chatBackBtn() = NodeWidgetBean(
        mutableListOf(
            "com.ss.android.ugc.aweme:id/hf0"
        ), "android.widget.FrameLayout", "", ""
    )

    //聊天页面/列表 *
    fun chatList() = NodeWidgetBean(
        mutableListOf(
            "com.ss.android.ugc.aweme:id/lnn"
        ), "androidx.recyclerview.widget.RecyclerView", "", ""
    )

    //聊天页面/文字内容
    fun chatContent() = NodeWidgetBean(
        mutableListOf(
            "com.ss.android.ugc.aweme:id/content_layout"
        ), "android.widget.TextView", "", ""
    )

    //聊天页面/底部输入框
    fun chatEdit() = NodeWidgetBean(
        mutableListOf(
            "com.ss.android.ugc.aweme:id/msg_et"
        ), "android.widget.EditText", "", ""
    )

    //聊天页面/发送按钮
    fun chatSend() = NodeWidgetBean(
        mutableListOf(
            "com.ss.android.ugc.aweme:id/fz-"
        ), "android.widget.ImageView", "", ""
    )


    /////////////////////////////////////////////////////////////////////////////////
    //
    //                    发布页面
    //
    /////////////////////////////////////////////////////////////////////////////////

    //下一步
    fun nextBtn() = NodeWidgetBean(
        mutableListOf(
            "m.l.plugin.tools_plugin:id/fl_next_step",
            "com.ss.android.ugc.aweme:id/jdg"
        ), "android.widget.TextView", "下一步", ""
    )

    //发布
    fun publishBtn() = NodeWidgetBean(
        mutableListOf(
            "m.l.plugin.tools_plugin:id/publish_txt"
        ), "android.widget.TextView", "", "发布"
    )

}