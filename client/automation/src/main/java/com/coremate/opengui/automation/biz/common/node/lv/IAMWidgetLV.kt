package com.coremate.opengui.automation.biz.common.node.lv

import com.coremate.opengui.automation.biz.common.node.NodeWidgetBean

/**
 * 剪映的节点组件
 * */
object IAMWidgetLV {

    /////////////////////////////////////////////////////////////////////////////////
    //
    //                    全局
    //
    /////////////////////////////////////////////////////////////////////////////////

    //全局/返回按钮 1
    fun globalBack() = NodeWidgetBean(
        mutableListOf(
            "com.lemon.lv:id/ivBack",
            "com.lemon.lv:id/iv_header_back",
        ), "android.widget.ImageView", "", "返回"
    )


    /////////////////////////////////////////////////////////////////////////////////
    //
    //                    底部导航
    //
    /////////////////////////////////////////////////////////////////////////////////

    //tab底部home按钮 *
    fun homeTabItem() = NodeWidgetBean(
        mutableListOf(
            "com.lemon.lv:id/radio_tab_home"
        ), "android.widget.RadioButton", "", ""
    )

    /////////////////////////////////////////////////////////////////////////////////
    //
    //                    首页
    //
    /////////////////////////////////////////////////////////////////////////////////

    //首页热门首次进入的工具列表
    fun homeToolsFirstGridView() = NodeWidgetBean(
        mutableListOf(
            "com.lemon.lv:id/tool_recycler_view"
        ), "android.widget.GridView", "", ""
    )

    //首页热门进入的工具列表
    fun homeToolsGridView() = NodeWidgetBean(
        mutableListOf(
            "com.lemon.lv:id/tool_first_level_rv"
        ), "android.widget.GridView", "", ""
    )

    /////////////////////////////////////////////////////////////////////////////////
    //
    //                    营销视频功能内部
    //
    /////////////////////////////////////////////////////////////////////////////////

    //营销视频
    fun mixMarketingFirstVideos() = NodeWidgetBean(
        mutableListOf(
            "com.lemon.lv:id/home_tool_tv"
        ), "android.widget.TextView", "营销成片", ""
    )

    //营销视频按钮
    fun mixMarketingVideos() = NodeWidgetBean(
        mutableListOf(
            "com.lemon.lv:id/tool_item_title"
        ), "android.widget.TextView", "营销视频", ""
    )


    //使用AI功能的确定按钮或其他确定按钮
    fun mixAiCommitBtn() = NodeWidgetBean(
        mutableListOf(
            "com.lemon.lv:id/btnPositive"
        ), "android.widget.Button", "确认", ""
    )

    //选择素材，即可快速生成视频，取试试按钮
    fun mixTryGoEditBtn() = NodeWidgetBean(
        mutableListOf(
            "com.lemon.lv:id/go_edit"
        ), "android.widget.Button", "去试试", ""
    )

    //素材viewpage
    fun mixVideoViewPager() = NodeWidgetBean(
        mutableListOf(
            "com.lemon.lv:id/gallery_list_pager2"
        ), "androidx.viewpager.widget.ViewPager", "", ""
    )

    //素材列表
    fun mixVideoViewGridList() = NodeWidgetBean(
        mutableListOf(
            "com.lemon.lv:id/local_media_recycler_view"
        ), "android.widget.GridView", "", ""
    )

    //每一个素材选择按钮
    fun mixVideoItemSelBtn() = NodeWidgetBean(
        mutableListOf(
            "com.lemon.lv:id/iv_local_multi_media_select_index"
        ), "android.widget.TextView", "", ""
    )

    //下一步按钮
    fun mixMarketingVideoNext() = NodeWidgetBean(
        mutableListOf(
            "com.lemon.lv:id/sb_media_select_done"
        ), "android.widget.Button", "下一步", ""
    )

    //商品门店信息
    fun mixLynxTextAreaView() = NodeWidgetBean(
        mutableListOf(
            ""
        ), "com.bytedance.ies.xelement.input.LynxTextAreaView", "", ""
    )

    //生成中的loading
    fun mixStartLoadingTv() = NodeWidgetBean(
        mutableListOf(
            "com.lemon.lv:id/loading_msg"
        ), "android.widget.TextView", "", ""
    )

    //开始生成按钮
    fun mixStartMixBtn() = NodeWidgetBean(
        mutableListOf(
            ""
        ), "com.lynx.tasm.behavior.ui.text.FlattenUIText", "开始生成", ""
    )

    //合成进度
    fun mixStartProgressTv() = NodeWidgetBean(
        mutableListOf(
            "com.lemon.lv:id/tvProgress"
        ), "android.widget.TextView", "", ""
    )

    //努力导出中loading
    fun mixExportLoading() = NodeWidgetBean(
        mutableListOf(
            "com.lemon.lv:id/main_title"
        ), "android.widget.TextView", "努力导出中...", ""
    )

    //导出按钮
    fun mixStartExportTv() = NodeWidgetBean(
        mutableListOf(
            "com.lemon.lv:id/ivExport"
        ), "android.widget.TextView", "导出", ""
    )

    //导出并分享
    fun mixStartExportBtn() = NodeWidgetBean(
        mutableListOf(
            "com.lemon.lv:id/tv_shareAweme"
        ), "android.widget.TextView", "无水印保存并分享", ""
    )


    /////////////////////////////////////////////////////////////////////////////////
    //
    //                    AI故事按钮功能内部
    //
    /////////////////////////////////////////////////////////////////////////////////

    //AI故事按钮
    fun marketingFirstVideos() = NodeWidgetBean(
        mutableListOf(
            "com.lemon.lv:id/home_tool_tv"
        ), "android.widget.TextView", "AI 故事成片", ""
    )

    //AI故事按钮
    fun marketingVideos() = NodeWidgetBean(
        mutableListOf(
            "com.lemon.lv:id/tool_item_title"
        ), "android.widget.TextView", "AI 故事成片", ""
    )


    //功能升级提示-我知道了
    fun funcUpKnow() = NodeWidgetBean(
        mutableListOf(
            "com.lemon.lv:id/btn_got_it"
        ), "android.widget.Button", "我知道了", ""
    )

    //AI生成
    fun aiCreate() = NodeWidgetBean(
        mutableListOf(
            "com.lemon.lv:id/content_ai"
        ), "android.widget.TextView", "AI 生成", ""
    )

    //ai文字输入框
    fun aiInput() = NodeWidgetBean(
        mutableListOf(
            "com.lemon.lv:id/vet_lui_input_content"
        ), "android.widget.EditText", "说说你的想法吧", ""
    )

    //ai文字输入发送
    fun aiInputSend() = NodeWidgetBean(
        mutableListOf(
            "com.lemon.lv:id/iv_lui_input_send"
        ), "android.widget.ImageView", "", ""
    )

    //ai内容插入
    fun aiInputInsert() = NodeWidgetBean(
        mutableListOf(
            "com.lemon.lv:id/vtv_lui_bottom_tool_insert"
        ), "android.widget.TextView", "插入", ""
    )


    //应用
    fun makeAiVideo() = NodeWidgetBean(
        mutableListOf(
            "com.lemon.lv:id/btn_finish"
        ), "android.widget.TextView", "应用", ""
    )

    //开始生成按钮
    fun startBtn() = NodeWidgetBean(
        mutableListOf(
            "com.lemon.lv:id/generate_video_btn"
        ), "android.view.ViewGroup", "", ""
    )

    //确定使用积分消耗
    fun startBtnConfirm() = NodeWidgetBean(
        mutableListOf(
            "com.lemon.lv:id/btn_confirm"
        ), "android.widget.Button", "确认使用", ""
    )

    //生成中的loading
    fun startLoadingTv() = NodeWidgetBean(
        mutableListOf(
            "com.lemon.lv:id/tvBottomContext"
        ), "android.widget.TextView", "视频生成中", ""
    )

    //导出按钮
    fun startExportTv() = NodeWidgetBean(
        mutableListOf(
            "com.lemon.lv:id/tvExport"
        ), "android.widget.Button", "导出", ""
    )

    //弹窗的关闭按钮
    fun exportDialogClose() = NodeWidgetBean(
        mutableListOf(
            "com.lemon.lv:id/market_feedback_dialog_close"
        ), "android.widget.Button", "", ""
    )

    //导出并分享
    fun startExportBtn() = NodeWidgetBean(
        mutableListOf(
            "com.lemon.lv:id/tv_share_aweme_v2"
        ), "android.widget.TextView", "分享到抖音", ""
    )


    //打开第三方app的按钮
    fun startThirdAppBtn() = NodeWidgetBean(
        mutableListOf(
            "android:id/button1"
        ), "android.widget.Button", "打开", ""
    )


}