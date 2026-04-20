// FunctionConfigService.kt
package com.coremate.opengui.common_jvm.data

/**
 * 这是一个简单的单例服务，用于提供应用中所有可用的自动化功能配置。
 * 实际项目中，这些数据可能来自远程配置、数据库或更复杂的配置管理系统。
 */
object FunctionConfigService {

    fun getAllPlatformCategories(): List<PlatformCategory> {
        return listOf(
            PlatformCategory(
                name = "自动化测试",
                functions = listOf(
                    Function("运行手势测试脚本", "AUTOMATION_TEST_SCRIPT", "ic_test_automation")
                )
            ),
            PlatformCategory(
                name = "抖音",
                functions = listOf(
                    Function("短视频发布", "DOUYIN_VIDEO_PUBLISH", "ic_douyin_shorts")
                    // Function("竞品获客", "DOUYIN_COMPETITOR_CUSTOMER", "ic_douyin_competitor"),
                    // Function("私信获客", "DOUYIN_PRIVATE_MESSAGE", "ic_douyin_private_message")
                )
            ),
            PlatformCategory(
                name = "微信", // 新增微信平台
                functions = listOf(
                    Function("评论点赞", "WECHAT_LIKE_COMMENT", "ic_wechat_friends_circle") // 使用现有图标，或创建新图标
                    // Function("朋友圈获客", "WECHAT_MOMENTS_CUSTOMER", "ic_wechat_friends_circle"),
                    // Function("社群获客", "WECHAT_COMMUNITY_CUSTOMER", "ic_wechat_community")
                )
            )
            // 您可以根据需要添加更多平台和功能
            // PlatformCategory(
            //     name = "小红书",
            //     functions = listOf(
            //         Function("评论获客", "XHS_COMMENT_CUSTOMER", "ic_xiaohongshu_comment"),
            //         Function("私信获客", "XHS_PRIVATE_MESSAGE", "ic_xiaohongshu_private_message")
            //     )
            // ),
            // PlatformCategory(
            //     name = "微信",
            //     functions = listOf(
            //         Function("朋友圈获客", "WECHAT_MOMENTS_CUSTOMER", "ic_wechat_friends_circle"),
            //         Function("社群获客", "WECHAT_COMMUNITY_CUSTOMER", "ic_wechat_community")
            //     )
            // ),
            // PlatformCategory(
            //     name = "快手",
            //     functions = listOf(
            //         Function("直播", "KUAISHOU_LIVE", "ic_kuaishou_shorts")
            //     )
            // )
        )
    }

    /**
     * 获取所有功能的扁平化列表，方便在“添加任务”界面展示。
     */
    fun getAllFunctionsFlatList(): List<Function> {
        return getAllPlatformCategories().flatMap { it.functions }
    }
}