// core_common_jvm/src/main/java/com/haomai/promotor/common_jvm/dto/CozeDto.kt (或者类似路径)

package com.coremate.opengui.common_jvm.dto

/**
 * Coze AI 聊天请求体
 */
data class CozeChatRequest(
    val lastMessageContent: String,
    val userNickname: String,
    val screenshotBase64: String?
)

/**
 * Coze AI 聊天响应体
 */
data class CozeChatResponse(
    val message: String? = null,
    val code: Int? = null,
    val msg: String? = null
)
