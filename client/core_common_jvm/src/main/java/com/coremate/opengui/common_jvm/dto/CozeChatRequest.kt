

package com.coremate.opengui.common_jvm.dto

/**
 */
data class CozeChatRequest(
    val lastMessageContent: String,
    val userNickname: String,
    val screenshotBase64: String?
)

/**
 */
data class CozeChatResponse(
    val message: String? = null,
    val code: Int? = null,
    val msg: String? = null
)
