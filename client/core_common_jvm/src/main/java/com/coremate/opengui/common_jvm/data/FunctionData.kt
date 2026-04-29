// FunctionData.kt
package com.coremate.opengui.common_jvm.data

/**
 */
data class PlatformCategory(
    val name: String,
    val functions: List<Function>,
    val iconName: String? = null,
)

/**
 */
data class Function(
    val name: String,
    val code: String,
    val iconName: String, // Icon resource name (e.g., "ic_douyin_shorts")
    val desc: String? = null,
)