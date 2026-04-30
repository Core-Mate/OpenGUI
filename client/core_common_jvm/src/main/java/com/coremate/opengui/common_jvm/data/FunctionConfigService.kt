// FunctionConfigService.kt
package com.coremate.opengui.common_jvm.data

/**
 * Simple singleton service that provides available automation function configuration.
 * In production, this data may come from remote config, a database, or a richer config system.
 */
object FunctionConfigService {

    fun getAllPlatformCategories(): List<PlatformCategory> {
        return listOf(
            PlatformCategory(
                name = "Automation Test",
                functions = listOf(
                    Function("Run gesture test script", "AUTOMATION_TEST_SCRIPT", "ic_test_automation")
                )
            ),
            PlatformCategory(
                name = "Douyin",
                functions = listOf(
                    Function("Publish short video", "DOUYIN_VIDEO_PUBLISH", "ic_douyin_shorts")
                    // Function("Competitor lead generation", "DOUYIN_COMPETITOR_CUSTOMER", "ic_douyin_competitor"),
                    // Function("Direct-message lead generation", "DOUYIN_PRIVATE_MESSAGE", "ic_douyin_private_message")
                )
            ),
            PlatformCategory(
                name = "WeChat",
                functions = listOf(
                    Function("Like comments", "WECHAT_LIKE_COMMENT", "ic_wechat_friends_circle")
                    // Function("Moments lead generation", "WECHAT_MOMENTS_CUSTOMER", "ic_wechat_friends_circle"),
                    // Function("Community lead generation", "WECHAT_COMMUNITY_CUSTOMER", "ic_wechat_community")
                )
            )
            // Add more platforms and functions as needed.
            // PlatformCategory(
            //     name = "Xiaohongshu",
            //     functions = listOf(
            //         Function("Comment lead generation", "XHS_COMMENT_CUSTOMER", "ic_xiaohongshu_comment"),
            //         Function("Direct-message lead generation", "XHS_PRIVATE_MESSAGE", "ic_xiaohongshu_private_message")
            //     )
            // ),
            // PlatformCategory(
            //     name = "WeChat",
            //     functions = listOf(
            //         Function("Moments lead generation", "WECHAT_MOMENTS_CUSTOMER", "ic_wechat_friends_circle"),
            //         Function("Community lead generation", "WECHAT_COMMUNITY_CUSTOMER", "ic_wechat_community")
            //     )
            // ),
            // PlatformCategory(
            //     name = "Kuaishou",
            //     functions = listOf(
            //         Function("Live streaming", "KUAISHOU_LIVE", "ic_kuaishou_shorts")
            //     )
            // )
        )
    }

    /**
     * Return all functions as a flat list for the Add Task screen.
     */
    fun getAllFunctionsFlatList(): List<Function> {
        return getAllPlatformCategories().flatMap { it.functions }
    }
}
