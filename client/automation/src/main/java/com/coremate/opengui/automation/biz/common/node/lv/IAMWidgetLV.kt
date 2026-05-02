package com.coremate.opengui.automation.biz.common.node.lv

import com.coremate.opengui.automation.biz.common.node.NodeWidgetBean

/**
 * Jianying node components
 * */
object IAMWidgetLV {

    /////////////////////////////////////////////////////////////////////////////////
    //
    // Global
    //
    /////////////////////////////////////////////////////////////////////////////////

    //Global/back button 1
    fun globalBack() = NodeWidgetBean(
        mutableListOf(
            "com.lemon.lv:id/ivBack",
            "com.lemon.lv:id/iv_header_back",
        ), "android.widget.ImageView", "", "返回"
    )


    /////////////////////////////////////////////////////////////////////////////////
    //
    // Bottom navigation
    //
    /////////////////////////////////////////////////////////////////////////////////

    //tabbottomhome Button *
    fun homeTabItem() = NodeWidgetBean(
        mutableListOf(
            "com.lemon.lv:id/radio_tab_home"
        ), "android.widget.RadioButton", "", ""
    )

    /////////////////////////////////////////////////////////////////////////////////
    //
    // Home page
    //
    /////////////////////////////////////////////////////////////////////////////////

    //Home hot tool list on first entry
    fun homeToolsFirstGridView() = NodeWidgetBean(
        mutableListOf(
            "com.lemon.lv:id/tool_recycler_view"
        ), "android.widget.GridView", "", ""
    )

    //Home hot tool list after entry
    fun homeToolsGridView() = NodeWidgetBean(
        mutableListOf(
            "com.lemon.lv:id/tool_first_level_rv"
        ), "android.widget.GridView", "", ""
    )

    /////////////////////////////////////////////////////////////////////////////////
    //
    // Inside marketing video feature
    //
    /////////////////////////////////////////////////////////////////////////////////

    //Marketing video
    fun mixMarketingFirstVideos() = NodeWidgetBean(
        mutableListOf(
            "com.lemon.lv:id/home_tool_tv"
        ), "android.widget.TextView", "营销成片", ""
    )

    //Marketing video button
    fun mixMarketingVideos() = NodeWidgetBean(
        mutableListOf(
            "com.lemon.lv:id/tool_item_title"
        ), "android.widget.TextView", "营销视频", ""
    )


    //Confirm button for AI feature or other confirmation button
    fun mixAiCommitBtn() = NodeWidgetBean(
        mutableListOf(
            "com.lemon.lv:id/btnPositive"
        ), "android.widget.Button", "确认", ""
    )

    //Select materials to quickly generate a video, then use the Try button
    fun mixTryGoEditBtn() = NodeWidgetBean(
        mutableListOf(
            "com.lemon.lv:id/go_edit"
        ), "android.widget.Button", "去试试", ""
    )

    //Material View Pager
    fun mixVideoViewPager() = NodeWidgetBean(
        mutableListOf(
            "com.lemon.lv:id/gallery_list_pager2"
        ), "androidx.viewpager.widget.ViewPager", "", ""
    )

    //Material list
    fun mixVideoViewGridList() = NodeWidgetBean(
        mutableListOf(
            "com.lemon.lv:id/local_media_recycler_view"
        ), "android.widget.GridView", "", ""
    )

    //Selection button for each material
    fun mixVideoItemSelBtn() = NodeWidgetBean(
        mutableListOf(
            "com.lemon.lv:id/iv_local_multi_media_select_index"
        ), "android.widget.TextView", "", ""
    )

    //Next button
    fun mixMarketingVideoNext() = NodeWidgetBean(
        mutableListOf(
            "com.lemon.lv:id/sb_media_select_done"
        ), "android.widget.Button", "下一步", ""
    )

    //Product/store information
    fun mixLynxTextAreaView() = NodeWidgetBean(
        mutableListOf(
            ""
        ), "com.bytedance.ies.xelement.input.LynxTextAreaView", "", ""
    )

    //Generating loading state
    fun mixStartLoadingTv() = NodeWidgetBean(
        mutableListOf(
            "com.lemon.lv:id/loading_msg"
        ), "android.widget.TextView", "", ""
    )

    //Start generation button
    fun mixStartMixBtn() = NodeWidgetBean(
        mutableListOf(
            ""
        ), "com.lynx.tasm.behavior.ui.text.FlattenUIText", "开始生成", ""
    )

    //Composition progress
    fun mixStartProgressTv() = NodeWidgetBean(
        mutableListOf(
            "com.lemon.lv:id/tvProgress"
        ), "android.widget.TextView", "", ""
    )

    //Exporting loading state
    fun mixExportLoading() = NodeWidgetBean(
        mutableListOf(
            "com.lemon.lv:id/main_title"
        ), "android.widget.TextView", "努力导出中...", ""
    )

    //Export button
    fun mixStartExportTv() = NodeWidgetBean(
        mutableListOf(
            "com.lemon.lv:id/ivExport"
        ), "android.widget.TextView", "导出", ""
    )

    //Export and share
    fun mixStartExportBtn() = NodeWidgetBean(
        mutableListOf(
            "com.lemon.lv:id/tv_shareAweme"
        ), "android.widget.TextView", "无水印保存并分享", ""
    )


    /////////////////////////////////////////////////////////////////////////////////
    //
    // AI story button inside feature
    //
    /////////////////////////////////////////////////////////////////////////////////

    //AI story button
    fun marketingFirstVideos() = NodeWidgetBean(
        mutableListOf(
            "com.lemon.lv:id/home_tool_tv"
        ), "android.widget.TextView", "AI 故事成片", ""
    )

    //AI story button
    fun marketingVideos() = NodeWidgetBean(
        mutableListOf(
            "com.lemon.lv:id/tool_item_title"
        ), "android.widget.TextView", "AI 故事成片", ""
    )


    //Feature upgrade prompt: Got it
    fun funcUpKnow() = NodeWidgetBean(
        mutableListOf(
            "com.lemon.lv:id/btn_got_it"
        ), "android.widget.Button", "我知道了", ""
    )

    //AI Generate
    fun aiCreate() = NodeWidgetBean(
        mutableListOf(
            "com.lemon.lv:id/content_ai"
        ), "android.widget.TextView", "AI 生成", ""
    )

    //AI text input field
    fun aiInput() = NodeWidgetBean(
        mutableListOf(
            "com.lemon.lv:id/vet_lui_input_content"
        ), "android.widget.EditText", "说说你的想法吧", ""
    )

    //Send AI text input
    fun aiInputSend() = NodeWidgetBean(
        mutableListOf(
            "com.lemon.lv:id/iv_lui_input_send"
        ), "android.widget.ImageView", "", ""
    )

    //Insert AI content
    fun aiInputInsert() = NodeWidgetBean(
        mutableListOf(
            "com.lemon.lv:id/vtv_lui_bottom_tool_insert"
        ), "android.widget.TextView", "插入", ""
    )


    //App
    fun makeAiVideo() = NodeWidgetBean(
        mutableListOf(
            "com.lemon.lv:id/btn_finish"
        ), "android.widget.TextView", "应用", ""
    )

    //Start generation button
    fun startBtn() = NodeWidgetBean(
        mutableListOf(
            "com.lemon.lv:id/generate_video_btn"
        ), "android.view.ViewGroup", "", ""
    )

    //Confirm point usage
    fun startBtnConfirm() = NodeWidgetBean(
        mutableListOf(
            "com.lemon.lv:id/btn_confirm"
        ), "android.widget.Button", "确认使用", ""
    )

    //Generating loading state
    fun startLoadingTv() = NodeWidgetBean(
        mutableListOf(
            "com.lemon.lv:id/tvBottomContext"
        ), "android.widget.TextView", "视频生成中", ""
    )

    //Export button
    fun startExportTv() = NodeWidgetBean(
        mutableListOf(
            "com.lemon.lv:id/tvExport"
        ), "android.widget.Button", "导出", ""
    )

    //Dialog close button
    fun exportDialogClose() = NodeWidgetBean(
        mutableListOf(
            "com.lemon.lv:id/market_feedback_dialog_close"
        ), "android.widget.Button", "", ""
    )

    //Export and share
    fun startExportBtn() = NodeWidgetBean(
        mutableListOf(
            "com.lemon.lv:id/tv_share_aweme_v2"
        ), "android.widget.TextView", "分享到抖音", ""
    )


    //Open third-party app button
    fun startThirdAppBtn() = NodeWidgetBean(
        mutableListOf(
            "android:id/button1"
        ), "android.widget.Button", "打开", ""
    )


}