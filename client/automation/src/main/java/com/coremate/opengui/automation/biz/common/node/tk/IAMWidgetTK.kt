package com.coremate.opengui.automation.biz.common.node.tk

import com.coremate.opengui.automation.biz.common.node.NodeWidgetBean

/**
 * Douyin node components
 * */
object IAMWidgetTK {

    /////////////////////////////////////////////////////////////////////////////////
    //
    // Global
    //
    /////////////////////////////////////////////////////////////////////////////////

    //Global loading *
    fun loading() = NodeWidgetBean(
        mutableListOf(
            "com.ss.android.ugc.aweme:id/emz"
        ), "android.widget.RelativeLayout", "", ""
    )

    //Global/back *
    fun backBtn() = NodeWidgetBean(
        mutableListOf(
            "com.ss.android.ugc.aweme:id/back_btn"
        ), "android.widget.ImageView", "", "返回"
    )

    /////////////////////////////////////////////////////////////////////////////////
    //
    // Home
    //
    /////////////////////////////////////////////////////////////////////////////////

    //Home/search *
    fun mainSearchBtn() = NodeWidgetBean(
        mutableListOf(
            "com.ss.android.ugc.aweme:id/obj"
        ), "android.widget.Button", "", "搜索"
    )

    /////////////////////////////////////////////////////////////////////////////////
    //
    // Bottom navigation
    //
    /////////////////////////////////////////////////////////////////////////////////

    //tabbottomitemparent container *
    fun indexTabItem() = NodeWidgetBean(
        mutableListOf(
            "com.ss.android.ugc.aweme:id/n6t"
        ), "android.widget.TextView", "", ""
    )

    //tab Bottom item/unread messages
    fun unReadText() = NodeWidgetBean(
        mutableListOf(
            "com.ss.android.ugc.aweme:id/nt="
        ), "android.widget.TextView", "", ""
    )

    /////////////////////////////////////////////////////////////////////////////////
    //
    // Message list
    //
    /////////////////////////////////////////////////////////////////////////////////

    ///Message list/top search
    fun msgSearchBtn() = NodeWidgetBean(
        mutableListOf(
            "com.ss.android.ugc.aweme:id/gwd"
        ), "android.widget.Button", "", "搜索"
    )

    ///Message list/list
    fun msgList() = NodeWidgetBean(
        mutableListOf(
            "com.ss.android.ugc.aweme:id/mp4"
        ), "androidx.recyclerview.widget.RecyclerView", "", ""
    )


    ///Message list/friend nickname
    fun contactNickName() = NodeWidgetBean(
        mutableListOf(
            "com.ss.android.ugc.aweme:id/tv_title"
        ), "android.widget.TextView", "", ""
    )

    ///Message list/numbered red dot
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

    ///Message list/red dot
    fun messageRedItem() = NodeWidgetBean(
        mutableListOf(
            "com.ss.android.ugc.aweme:id/g76"
        ), "android.widget.LinearLayout", "", ""
    )


    /////////////////////////////////////////////////////////////////////////////////
    //
    // Publish page
    //
    /////////////////////////////////////////////////////////////////////////////////

    //Chat page/back *
    fun chatBackBtn() = NodeWidgetBean(
        mutableListOf(
            "com.ss.android.ugc.aweme:id/hf0"
        ), "android.widget.FrameLayout", "", ""
    )

    //Chat page/list *
    fun chatList() = NodeWidgetBean(
        mutableListOf(
            "com.ss.android.ugc.aweme:id/lnn"
        ), "androidx.recyclerview.widget.RecyclerView", "", ""
    )

    //Chat page/text content
    fun chatContent() = NodeWidgetBean(
        mutableListOf(
            "com.ss.android.ugc.aweme:id/content_layout"
        ), "android.widget.TextView", "", ""
    )

    //Chat page/bottom input field
    fun chatEdit() = NodeWidgetBean(
        mutableListOf(
            "com.ss.android.ugc.aweme:id/msg_et"
        ), "android.widget.EditText", "", ""
    )

    //Chat page/send button
    fun chatSend() = NodeWidgetBean(
        mutableListOf(
            "com.ss.android.ugc.aweme:id/fz-"
        ), "android.widget.ImageView", "", ""
    )


    /////////////////////////////////////////////////////////////////////////////////
    //
    // Publish page
    //
    /////////////////////////////////////////////////////////////////////////////////

    //Next step
    fun nextBtn() = NodeWidgetBean(
        mutableListOf(
            "m.l.plugin.tools_plugin:id/fl_next_step",
            "com.ss.android.ugc.aweme:id/jdg"
        ), "android.widget.TextView", "下一步", ""
    )

    //Publish
    fun publishBtn() = NodeWidgetBean(
        mutableListOf(
            "m.l.plugin.tools_plugin:id/publish_txt"
        ), "android.widget.TextView", "", "发布"
    )

}