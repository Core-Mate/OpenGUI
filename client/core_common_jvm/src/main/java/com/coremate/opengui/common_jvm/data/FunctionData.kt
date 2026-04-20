// FunctionData.kt
package com.coremate.opengui.common_jvm.data

/**
 * 代表一个平台分类，例如“抖音”、“小红书”等。
 * @param name 平台名称。
 * @param functions 该平台下可用的功能列表。
 * @param iconName 对应图标的字符串名称，UI层需要将其解析为资源ID。
 */
data class PlatformCategory(
    val name: String,
    val functions: List<Function>,
    val iconName: String? = null,
)

/**
 * 代表一个具体的自动化功能或任务。
 * @param name 功能名称，例如“短视频发布”。
 * @param code 唯一的功能代码，用于识别和执行具体逻辑（例如，"DOUYIN_VIDEO_PUBLISH"）。
 * 这是关键，因为资源ID不能跨模块直接引用，而功能代码可以。
 * @param iconName 对应图标的字符串名称，UI层需要将其解析为资源ID。
 * 我们不能直接在JVM模块中使用 R.drawable.xxx，所以改为字符串。
 * @param desc 功能定义(自定义功能使用)
 */
data class Function(
    val name: String,
    val code: String,
    val iconName: String, // Icon resource name (e.g., "ic_douyin_shorts")
    val desc: String? = null,
)